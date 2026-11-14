import type { Terrain } from "@field-shift/shared";
import { pointAt, type Point } from "./geo";
import { fetchJson } from "./http";

export async function collectTerrain(point: Point): Promise<Terrain> {
  const distance = 0.15;
  const points = [point, pointAt(point, distance, Math.PI / 2), pointAt(point, distance, 3 * Math.PI / 2),
    pointAt(point, distance, 0), pointAt(point, distance, Math.PI)];
  const url = new URL("https://api.open-meteo.com/v1/elevation");
  url.searchParams.set("latitude", points.map((p) => p.lat.toFixed(6)).join(","));
  url.searchParams.set("longitude", points.map((p) => p.lon.toFixed(6)).join(","));
  const response = await fetchJson<{ elevation?: (number | null)[] }>(url.toString(), 8000);
  const e = response.elevation;
  if (!e || e.length !== 5 || typeof e[0] !== "number" || !Number.isFinite(e[0]))
    throw new Error("NO_TERRAIN_DATA");
  const valid = e.slice(1).every((n): n is number => typeof n === "number" && Number.isFinite(n));
  const slopePct = valid
    ? Math.hypot(((e[1] ?? 0) - (e[2] ?? 0)) / 300, ((e[3] ?? 0) - (e[4] ?? 0)) / 300) * 100
    : null;
  return { elevationM: e[0], slopePct };
}
