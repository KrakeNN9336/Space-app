import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { AnalyzeResponse, Field, FieldGeometry } from "@field-shift/shared";
import "./field-map.css";

type Layer = "satellite" | "streets";
export interface FieldMapProps {
  field?: Field | null;
  analysis?: AnalyzeResponse | null;
  onFieldSelected?: (field: Field) => void;
  radiusKm?: number;
  layer?: string;
}
const satelliteStyle = {
  version: 8 as const,
  sources: { satellite: { type: "raster" as const, tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "Imagery © Esri and contributors" } },
  layers: [{ id: "satellite", type: "raster" as const, source: "satellite" }]
};
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
export function FieldMap({ field, analysis, onFieldSelected, layer }: FieldMapProps) {
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
    const map = new maplibregl.Map({ container: container.current, style: base === "satellite" ? satelliteStyle : streetStyle, center: [24.03, 49.845], zoom: 11, attributionControl: false });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.on("error", () => setError("Не вдалося завантажити частину карти. Перевірте інтернет."));
    return () => { mapRef.current = null; map.remove(); };
  }, [base]);
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
        map.addLayer({ id: "field-fill", type: "fill", source: "selected-field", paint: { "fill-color": mainStress ? severity[mainStress.level] : "#49c58b", "fill-opacity": showSoil ? 0.33 : 0.06 } });
        map.addLayer({ id: "field-outline", type: "line", source: "selected-field", paint: { "line-color": "#f5fff8", "line-width": 3 } });
      } else {
        map.addLayer({ id: "field-outline", type: "circle", source: "selected-field", paint: { "circle-color": "#49c58b", "circle-radius": 9, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      }
      const bounds = getBounds(geometry);
      if (bounds) map.fitBounds(bounds, { padding: 90, maxZoom: 15, duration: 0 });
    };
    if (map.isStyleLoaded()) draw();
    map.on("style.load", draw);
    return () => { map.off("style.load", draw); };
  }, [currentField, mainStress?.level, showSoil, base]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !currentField) return;
    const select = () => { setSelected(true); onFieldSelected?.(currentField); };
    map.on("click", "field-fill", select);
    map.on("click", "field-outline", select);
    return () => { map.off("click", "field-fill", select); map.off("click", "field-outline", select); };
  }, [currentField, onFieldSelected, base]);
  return <section className="field-map-shell" aria-label="Карта полів">
    <div className="field-map-canvas" ref={container} />
    <div className="field-map-brand"><span className="field-map-dot" /> FIELD SHIFT <small>Карта стану поля</small></div>
    <div className="field-map-controls">
      <button type="button" aria-pressed={base === "satellite"} onClick={() => setBase("satellite")}>🛰️ Супутник</button>
      <button type="button" aria-pressed={base === "streets"} onClick={() => setBase("streets")}>🗺️ Карта</button>
      <button type="button" aria-pressed={showSoil} onClick={() => setShowSoil(!showSoil)}>🌱 Аналіз поля</button>
    </div>
    <aside className="field-map-panel">
      <div className="field-map-eyebrow">ОГЛЯД ДІЛЯНКИ</div>
      <h2>{currentField ? "Ваше поле" : "Оберіть поле"}</h2>
      <p>{currentField ? (currentField.areaHa != null ? `Площа: ${currentField.areaHa} га` : "Площа невідома") : "Передайте межі поля або результат аналізу з JSON."}</p>
      {soil ? <div className="field-map-soil"><span>Тип ґрунту</span><strong>{soil.wrbGroup?.name ?? "Немає даних"}</strong><small>Джерело: {soil.source}</small></div> : <div className="field-map-soil">Дані про ґрунт ще не завантажені</div>}
      <h3>На що звернути увагу</h3>
      {stress.length ? stress.map(item => <div className="field-map-risk" key={item.id}><span className="field-map-risk-dot" style={{ background: severity[item.level] }} /><span><strong>{titles[item.id] ?? item.id}</strong><small>{labels[item.level]}</small></span></div>) : <p>Ризики з’являться після аналізу.</p>}
      {selected && mainStress && <div className="field-map-note"><strong>{titles[mainStress.id]}</strong><p>{mainStress.whyShort}</p></div>}
      {currentField?.note && <small className="field-map-caution">{currentField.note}</small>}
    </aside>
    <div className="field-map-legend"><span style={{background:severity.low}}/> Низький <span style={{background:severity.moderate}}/> Помірний <span style={{background:severity.high}}/> Високий</div>
    <div className="field-map-disclaimer">Колір відображає найбільший ризик для всього поля, а не виміряні зони ґрунту всередині нього.</div>
    {error && <div className="field-map-error" role="status">{error}</div>}
  </section>;
}
