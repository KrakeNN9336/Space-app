import type { FieldGeometry } from "@field-shift/shared";
export type Point = { lat: number; lon: number };
export type Polygon = Extract<FieldGeometry, { type: "Polygon" }>;
const R = 6371.0088;
const rad = (d: number) => d * Math.PI / 180;
const deg = (r: number) => r * 180 / Math.PI;

export function pointAt(origin: Point, radiusKm: number, bearing: number): Point {
  const distance = radiusKm / R;
  const lat = rad(origin.lat);
  const lon = rad(origin.lon);
  const lat2 = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(bearing));
  const lon2 = lon + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(lat),
    Math.cos(distance) - Math.sin(lat) * Math.sin(lat2));
  return { lat: deg(lat2), lon: ((deg(lon2) + 540) % 360) - 180 };
}

export function samplePoints(point: Point, radiusKm: number): Point[] {
  return [point, ...Array.from({ length: 8 }, (_, i) => pointAt(point, radiusKm, i * Math.PI / 4))];
}

export function contains(poly: Polygon, point: Point): boolean {
  const inside = (ring: number[][]): boolean => {
    let value = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > point.lat) !== (yj > point.lat) &&
          point.lon < (xj - xi) * (point.lat - yi) / (yj - yi) + xi) value = !value;
    }
    return value;
  };
  return poly.coordinates.length > 0 &&
    inside(poly.coordinates[0]) && poly.coordinates.slice(1).every((ring) => !inside(ring));
}

export function areaHa(poly: Polygon): number {
  const ringArea = (ring: number[][]): number => {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [lon1, lat1] = ring[i];
      const [lon2, lat2] = ring[i + 1];
      sum += rad(lon2 - lon1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
    }
    return Math.abs(sum * (6371008.8 ** 2) / 2) / 10000;
  };
  return Math.max(0, ringArea(poly.coordinates[0]) -
    poly.coordinates.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0));
}
