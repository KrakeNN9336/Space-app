import type { RawClimate } from "@field-shift/shared";
import { samplePoints, type Point } from "./geo";
import { fetchJson } from "./http";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
// In the climatology endpoint T2M_MIN / T2M_MAX are the extremes of the whole period
// (checked for Lviv: January minimum -31.7 C), not mean daily values. Mean daily minimum and
// maximum are therefore derived from the mean and the mean daily range (T2M_RANGE).
const PARAMETERS = ["T2M", "T2M_RANGE", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN"] as const;
type Parameter = typeof PARAMETERS[number];
type POWER = {
  properties?: { parameter?: Record<string, Record<string, number | null>> };
  header?: { fill_value?: number };
};
type Sample = {
  tempC: number[];
  tempMinC: number[];
  tempMaxC: number[];
  precipMm: number[];
  solarMjM2Day: number[] | null;
};

function values(response: POWER, parameter: Parameter): number[] | null {
  const record = response.properties?.parameter?.[parameter] ?? {};
  const fill = response.header?.fill_value ?? -999;
  const result = MONTHS.map((month) => record[month]);
  return result.every((x): x is number =>
    typeof x === "number" && Number.isFinite(x) && x !== fill && x > -900) ? result as number[] : null;
}

async function sample(point: Point): Promise<Sample> {
  const url = new URL("https://power.larc.nasa.gov/api/temporal/climatology/point");
  url.search = new URLSearchParams({
    latitude: String(point.lat), longitude: String(point.lon), community: "AG",
    parameters: PARAMETERS.join(","), format: "JSON",
  }).toString();
  const response = await fetchJson<POWER>(url.toString(), 8000);
  const tempC = values(response, "T2M");
  const range = values(response, "T2M_RANGE");
  const precipitation = values(response, "PRECTOTCORR");
  if (!tempC || !range || !precipitation) throw new Error("NO_CLIMATE_DATA");
  const tempMinC = tempC.map((t, i) => t - range[i] / 2);
  const tempMaxC = tempC.map((t, i) => t + range[i] / 2);
  return {
    tempC, tempMinC, tempMaxC,
    precipMm: precipitation.map((value, i) => value * DAYS[i]),
    solarMjM2Day: values(response, "ALLSKY_SFC_SW_DWN"), // AG uses MJ/m²/day.
  };
}

const average = (values: number[]): number => values.reduce((sum, x) => sum + x, 0) / values.length;
const spread = (values: number[]): number | null =>
  values.length >= 2 ? Math.max(...values) - Math.min(...values) : null;
const monthMean = (samples: Sample[], key: "tempC" | "tempMinC" | "tempMaxC" | "precipMm") =>
  MONTHS.map((_, i) => average(samples.map((sample) => sample[key][i])));

export async function collectRawClimate(point: Point, radiusKm: number): Promise<RawClimate> {
  const points = samplePoints(point, radiusKm);
  const samples: Sample[] = [];
  // Four in flight avoids exhausting the Worker outbound-connection budget.
  for (let i = 0; i < points.length; i += 4) {
    const settled = await Promise.allSettled(points.slice(i, i + 4).map(sample));
    for (const item of settled) if (item.status === "fulfilled") samples.push(item.value);
  }
  if (!samples.length) throw new Error("NO_CLIMATE_DATA");
  const solars = samples.filter((item) => item.solarMjM2Day !== null);
  const solarMjM2Day = solars.length ? MONTHS.map((_, i) =>
    average(solars.map((item) => item.solarMjM2Day![i]))) : null;
  const annualTemp = samples.map((item) => average(item.tempC));
  const annualRain = samples.map((item) => item.precipMm.reduce((sum, x) => sum + x, 0));
  return {
    monthly: {
      tempC: monthMean(samples, "tempC"),
      tempMinC: monthMean(samples, "tempMinC"),
      tempMaxC: monthMean(samples, "tempMaxC"),
      precipMm: monthMean(samples, "precipMm"),
      solarMjM2Day,
    },
    spread: { tempC: spread(annualTemp), precipMm: spread(annualRain) },
    samples: samples.length,
    source: "NASA POWER climatology (AG)",
  };
}
