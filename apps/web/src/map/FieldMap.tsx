import { useEffect, useRef, useState, type ReactNode } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import type { AnalyzeResponse, Field, FieldGeometry } from "@field-shift/shared";
import "./field-map.css";

type Layer = "satellite" | "streets";

// Fields of the World: predicted field boundaries for 2025 (PRUE model on Sentinel-2), CC-BY-4.0.
// Archive and layer name are from the collection metadata at
// https://data.source.coop/ftw/global-data/predictions/vectors/collection.json
const FTW_URL = "pmtiles://https://data.source.coop/ftw/global-field-boundaries/pmtiles/ftw-global-fields-2025.pmtiles";
const FTW_LAYER = "fields";
const FTW_ATTRIBUTION = "Field boundaries © Fields of the World (CC BY 4.0)";
let pmtilesReady = false;
function ensurePmtiles() {
  if (pmtilesReady) return;
  maplibregl.addProtocol("pmtiles", new Protocol().tile);
  pmtilesReady = true;
}
/** Adds the field boundary layers under the labels; safe to call again after a style change. */
function addFieldLayers(map: MapLibreMap) {
  if (map.getSource("ftw")) return;
  map.addSource("ftw", { type: "vector", url: FTW_URL, attribution: FTW_ATTRIBUTION });
  const before = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
  map.addLayer({ id: "ftw-fill", type: "fill", source: "ftw", "source-layer": FTW_LAYER, paint: { "fill-color": "#7dffb0", "fill-opacity": 0.08 } }, before);
  map.addLayer({ id: "ftw-outline", type: "line", source: "ftw", "source-layer": FTW_LAYER, paint: { "line-color": "#7dffb0", "line-opacity": 0.9, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.4, 14, 1.6] } }, before);
}
/** Approximate area of a lon/lat polygon in hectares (spherical excess formula). */
function ringAreaM2(ring: number[][]): number {
  const rad = Math.PI / 180;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += (ring[i + 1][0] - ring[i][0]) * rad * (2 + Math.sin(ring[i][1] * rad) + Math.sin(ring[i + 1][1] * rad));
  }
  return Math.abs((sum * 6371008.8 ** 2) / 2);
}
function geometryAreaHa(geometry: FieldGeometry): number | null {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  if (!polygons.length) return null;
  const m2 = polygons.reduce((total, rings) => total + rings.slice(1).reduce((a, hole) => a - ringAreaM2(hole), ringAreaM2(rings[0])), 0);
  return Math.round((m2 / 10000) * 10) / 10;
}
export interface FieldMapProps {
  field?: Field | null;
  analysis?: AnalyzeResponse | null;
  onFieldSelected?: (field: Field) => void;
  /** Fired for every click on the map, so the host can look a field up at that point. */
  /** `field` is set when the click hit a Fields of the World boundary. */
  onMapClick?: (lat: number, lon: number, field?: Field) => void;
  radiusKm?: number;
  layer?: string;
  /** Extra content (status, actions) shown at the top of the side panel. */
  panelSlot?: ReactNode;
  /** Language of the settlement and country names on the map. */
  lang?: "uk" | "en";
}
// Borders and settlement names come from OpenFreeMap vector tiles (OpenStreetMap data, OpenMapTiles
// schema), the same source the "streets" style uses. They are drawn over the satellite imagery.
const landBorder = (min: number, max: number) => ["all",
  ["==", ["typeof", ["get", "admin_level"]], "number"],
  [">=", ["get", "admin_level"], min], ["<=", ["get", "admin_level"], max],
  ["!=", ["get", "maritime"], 1], ["!=", ["get", "disputed"], 1], ["!", ["has", "claimed_by"]]];
const placeLabel = (id: string, filter: unknown, font: string, size: unknown, name: unknown, zoom: { minzoom?: number; maxzoom?: number }, upper = false) => ({
  id, type: "symbol", source: "openmaptiles", "source-layer": "place", filter, ...zoom,
  layout: { "text-field": name, "text-font": [font], "text-size": size, "text-max-width": 8, ...(upper ? { "text-transform": "uppercase", "text-letter-spacing": 0.15 } : {}) },
  paint: { "text-color": "#ffffff", "text-halo-color": "rgba(8,22,16,0.9)", "text-halo-width": 1.4 },
});
function satelliteStyle(lang: "uk" | "en") {
  const name = ["coalesce", ["get", lang === "uk" ? "name:uk" : "name:en"], ["get", "name"]];
  const cls = (value: string) => ["==", ["get", "class"], value];
  return {
    version: 8 as const,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      satellite: { type: "raster" as const, tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "Imagery © Esri and contributors" },
     // openmaptiles тимчасово вимкнено через CORS
    },
 layers: [
  { id: "satellite", type: "raster", source: "satellite" },
],
  };
}
const streetStyle = "https://tiles.openfreemap.org/styles/liberty";
const severity = { low: "#49c58b", moderate: "#f3bf4b", high: "#ed746c" };
const titles: Record<string, string> = { drought: "Посуха", waterlogging: "Перезволоження", frost: "Заморозки", heat: "Спека", erosion: "Ерозія", fertility: "Родючість" };
const labels = { low: "Низький ризик", moderate: "Потребує уваги", high: "Високий ризик" };

function fieldFeature(geometry: FieldGeometry) {
  return { type: "Feature", properties: {}, geometry: geometry as any };
}
function getBounds(geometry: FieldGeometry): maplibregl.LngLatBounds | null {
  const bounds = new maplibregl.LngLatBounds();
  let count = 0;
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      bounds.extend([value[0], value[1]]); count++; return;
    }
    value.forEach(visit);
  };
  visit(geometry.coordinates);
  return count ? bounds : null;
}
export function FieldMap({ field, analysis, onFieldSelected, onMapClick, layer, panelSlot, lang = "uk" }: FieldMapProps) {
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [base, setBase] = useState<Layer>("satellite");
  const [showSoil, setShowSoil] = useState(true);
  const [selected, setSelected] = useState(false);
  const [error, setError] = useState("");
  const currentField = analysis?.field ?? field ?? null;
  const stress = analysis?.stress ?? [];
  const mainStress = [...stress].sort((a, b) => b.score - a.score)[0];
  const soil = analysis?.soil;
  useEffect(() => {
    if (!container.current) return;
    ensurePmtiles();
    const map = new maplibregl.Map({ container: container.current, style: base === "satellite" ? (satelliteStyle(lang) as any) : streetStyle, center: [24.03, 40], zoom: 1.4, attributionControl: false });
    // Globe view; MapLibre switches to flat Mercator by itself when zoomed in.
    map.on("style.load", () => { map.setProjection({ type: "globe" }); addFieldLayers(map); });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.on("click", (e) => {
      // From far away a click only zooms in; field outlines are drawn from about zoom 12.
      if (map.getZoom() < 12) { map.flyTo({ center: e.lngLat, zoom: Math.min(map.getZoom() + 4, 13) }); return; }
      const hit = map.getLayer("ftw-fill") ? map.queryRenderedFeatures(e.point, { layers: ["ftw-fill"] })[0] : undefined;
      const g = hit?.geometry;
      if (g && (g.type === "Polygon" || g.type === "MultiPolygon")) {
        // The polygon comes from a map tile, so a field on a tile edge can be cut; the note says so.
        const geometry = { type: g.type, coordinates: g.coordinates } as FieldGeometry;
        const m2 = Number(hit.properties?.["metrics:area"]);
        const areaHa = Number.isFinite(m2) && m2 > 0 ? Math.round(m2 / 1000) / 10 : geometryAreaHa(geometry);
        clickRef.current?.(e.lngLat.lat, e.lngLat.lng, { source: "ftw", geometry, areaHa, note: "Fields of the World 2025 (model prediction from Sentinel-2)" });
        return;
      }
      clickRef.current?.(e.lngLat.lat, e.lngLat.lng);
    });
    map.on("error", () => setError("Не вдалося завантажити частину карти. Перевірте інтернет."));
    return () => { mapRef.current = null; map.remove(); };
  }, [base, lang]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const draw = () => {
      if (map.getLayer("field-outline")) map.removeLayer("field-outline");
      if (map.getLayer("field-fill")) map.removeLayer("field-fill");
      if (map.getSource("selected-field")) map.removeSource("selected-field");
      if (!currentField) return;
      const geometry = currentField.geometry;
      map.addSource("selected-field", { type: "geojson", data: fieldFeature(geometry) as any });
      if (geometry.type !== "Point") {
     
map.addLayer({
  id: "field-fill",
  type: "fill",
  source: "selected-field",
  paint: {
    "fill-color": "#f5c451",
    "fill-opacity": 0.25,
  },
});

map.addLayer({
  id: "field-outline",
  type: "line",
  source: "selected-field",
  paint: {
    "line-color": "#ffd54f",
    "line-width": 4,
    "line-opacity": 1,
  },
});

      } else {
        map.addLayer({ id: "field-outline", type: "circle", source: "selected-field", paint: { "circle-color": "#49c58b", "circle-radius": 9, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      }
      const bounds = getBounds(geometry);
      if (bounds) map.fitBounds(bounds, { padding: 90, maxZoom: 14, duration: 1800 });
    };
    if (map.isStyleLoaded()) draw();
    map.on("style.load", draw);
    return () => { map.off("style.load", draw); };
  }, [currentField, mainStress?.level, showSoil, base, lang]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !currentField) return;
    const select = () => { setSelected(true); onFieldSelected?.(currentField); };
    map.on("click", "field-fill", select);
    map.on("click", "field-outline", select);
    return () => { map.off("click", "field-fill", select); map.off("click", "field-outline", select); };
  }, [currentField, onFieldSelected, base, lang]);
  return <section className="field-map-shell" aria-label="Карта полів">
    <div className="field-map-canvas" ref={container} />
    <div className="field-map-controls">
      <button type="button" aria-pressed={base === "satellite"} onClick={() => setBase("satellite")}>🛰️ Супутник</button>
      <button type="button" aria-pressed={base === "streets"} onClick={() => setBase("streets")}>🗺️ Карта</button>
      <button type="button" aria-pressed={showSoil} onClick={() => setShowSoil(!showSoil)}>🌱 Аналіз поля</button>
    </div>
    {currentField && <aside className="field-map-panel">
      {panelSlot}
      <div className="field-map-eyebrow">ОГЛЯД ДІЛЯНКИ</div>
      <h2>{currentField ? "Ваше поле" : "Оберіть поле"}</h2>
      <p>{currentField ? (currentField.areaHa != null ? `Площа: ${currentField.areaHa} га` : "Площа невідома") : "Передайте межі поля або результат аналізу з JSON."}</p>
      {!analysis ? null : soil ? <div className="field-map-soil"><span>Тип ґрунту</span><strong>{soil.wrbGroup?.name ?? "Немає даних"}</strong><small>Джерело: {soil.source}</small></div> : <div className="field-map-soil">Дані про ґрунт ще не завантажені</div>}
      {analysis && <h3>На що звернути увагу</h3>}
      {!analysis ? null : stress.length ? stress.map(item => <div className="field-map-risk" key={item.id}><span className="field-map-risk-dot" style={{ background: severity[item.level] }} /><span><strong>{titles[item.id] ?? item.id}</strong><small>{labels[item.level]}</small></span></div>) : <p>Ризики з’являться після аналізу.</p>}
      {selected && mainStress && <div className="field-map-note"><strong>{titles[mainStress.id]}</strong><p>{mainStress.whyShort}</p></div>}
      {currentField?.note && <small className="field-map-caution">{currentField.note}</small>}
    </aside>}
    {analysis && <div className="field-map-legend"><span style={{background:severity.low}}/> Низький <span style={{background:severity.moderate}}/> Помірний <span style={{background:severity.high}}/> Високий</div>}
    {analysis && <div className="field-map-disclaimer">Колір відображає найбільший ризик для всього поля, а не виміряні зони ґрунту всередині нього.</div>}
    {error && <div className="field-map-error" role="status">{error}</div>}
  </section>;
}
