import type { Field } from "@field-shift/shared";
import { areaHa, contains, type Point, type Polygon } from "./geo";
import { fetchJson } from "./http";

type Location = { lat: number; lon: number };
type OSMWay = { type: "way"; id: number; geometry?: Location[] };
type OSMRelation = {
  type: "relation"; id: number;
  members?: { role: string; geometry?: Location[] }[];
};
type Element = OSMWay | OSMRelation;

function completeRing(nodes: Location[] | undefined): number[][] | null {
  if (!nodes || nodes.length < 4) return null;
  const first = nodes[0], last = nodes[nodes.length - 1];
  if (first.lat !== last.lat || first.lon !== last.lon) return null;
  return nodes.map(({ lat, lon }) => [lon, lat]);
}

function polygon(element: Element): Polygon | null {
  if (element.type === "way") {
    const ring = completeRing(element.geometry);
    return ring ? { type: "Polygon", coordinates: [ring] } : null;
  }
  // Skip incomplete multipolygon relations rather than inventing missing boundaries.
  const members = element.members ?? [];
  const outer = members.filter((item) => item.role === "outer");
  if (outer.length !== 1 || members.some((item) => item.role === "inner")) return null;
  const ring = completeRing(outer[0].geometry);
  return ring ? { type: "Polygon", coordinates: [ring] } : null;
}

export async function findOSMField(point: Point): Promise<Field | null> {
  const query = '[out:json][timeout:7];(' +
    'way(around:150,' + point.lat + ',' + point.lon + ')[landuse~"^(farmland|meadow|orchard)$"];' +
    'relation(around:150,' + point.lat + ',' + point.lon + ')[landuse~"^(farmland|meadow|orchard)$"];' +
    ');out geom;';
  const result = await fetchJson<{ elements?: Element[] }>(
    "https://overpass-api.de/api/interpreter", 8000,
    { method: "POST", body: new URLSearchParams({ data: query }) },
  );
  const fields = (result.elements ?? []).flatMap((item) => {
    const boundary = polygon(item);
    if (!boundary || !contains(boundary, point)) return [];
    const hectares = areaHa(boundary);
    return hectares > 0 ? [{ source: "osm" as const, geometry: boundary, areaHa: hectares }] : [];
  });
  fields.sort((a, b) => a.areaHa - b.areaHa);
  return fields[0] ?? null;
}
