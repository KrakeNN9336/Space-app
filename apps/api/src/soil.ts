import type { RawSoil, RangeValue } from "@field-shift/shared";
import type { Point } from "./geo";
import { fetchJson } from "./http";

type Values = Record<string, number | null>;
type Layer = {
  name: string;
  unit_measure?: { d_factor?: number };
  depths?: { label?: string; values?: Values }[];
};
type SoilResponse = { properties?: { layers?: Layer[] } };
const EMPTY: RangeValue = { median: null, low: null, high: null };

function property(response: SoilResponse, name: string): RangeValue {
  const layer = response.properties?.layers?.find((item) => item.name === name);
  const values = layer?.depths?.find((d) => d.label === "0-5cm")?.values;
  const divisor = layer?.unit_measure?.d_factor;
  if (!values || !divisor || divisor <= 0) return { ...EMPTY };
  const conversion = (x: number | null | undefined) =>
    typeof x === "number" && Number.isFinite(x) ? x / divisor : null;
  return {
    median: conversion(values["Q0.5"] ?? values["Q0.50"]),
    low: conversion(values["Q0.05"]),
    high: conversion(values["Q0.95"]),
  };
}

export async function collectRawSoil(point: Point): Promise<RawSoil> {
  const url = new URL("https://rest.isric.org/soilgrids/v2.0/properties/query");
  url.searchParams.set("lon", String(point.lon));
  url.searchParams.set("lat", String(point.lat));
  for (const name of ["soc", "phh2o", "sand", "silt", "clay"]) url.searchParams.append("property", name);
  url.searchParams.set("depth", "0-5cm");
  for (const v of ["Q0.05", "Q0.5", "Q0.95"]) url.searchParams.append("value", v);
  const response = await fetchJson<SoilResponse>(url.toString(), 8000);
  if (!response.properties?.layers?.length) throw new Error("NO_SOIL_DATA");
  const properties = {
    organicCarbonGkg: property(response, "soc"),
    phH2O: property(response, "phh2o"),
    sandPct: property(response, "sand"),
    siltPct: property(response, "silt"),
    clayPct: property(response, "clay"),
  };
  if (Object.values(properties).every((r) => r.median === null)) throw new Error("NO_SOIL_DATA");
  return { wrbGroup: null, properties, source: "ISRIC SoilGrids 2.0 (0-5 cm)" };
}
