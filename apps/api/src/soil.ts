import type { RawSoil, RangeValue, SoilProperties } from "@field-shift/shared";
import { fromArrayBuffer } from "geotiff";
import type { Point } from "./geo";

// SoilGrids REST beta is currently paused; WCS serves spatial GeoTIFF subsets.
// https://docs.isric.org/globaldata/soilgrids/wcs.html
const WCS_URL = "https://maps.isric.org/mapserv";
const WCS_CRS = "http://www.opengis.net/def/crs/EPSG/0/4326";
const DEPTH = "0-5cm";
const HALF_SIZE_DEG = 0.005;
const TIMEOUT_MS = 15000;
const MAX_TIFF_BYTES = 2_000_000;

const PROPERTIES = [
  { key: "organicCarbonGkg", layer: "soc" },
  { key: "phH2O", layer: "phh2o" },
  { key: "sandPct", layer: "sand" },
  { key: "siltPct", layer: "silt" },
  { key: "clayPct", layer: "clay" },
] as const;

type SoilKey = (typeof PROPERTIES)[number]["key"];
type Quantile = "Q0.05" | "Q0.5" | "Q0.95";

const emptyRange = (): RangeValue => ({ median: null, low: null, high: null });

function buildWcsUrl(layer: string, quantile: Quantile, point: Point): string {
  const url = new URL(WCS_URL);
  const x0 = Math.max(-180, point.lon - HALF_SIZE_DEG);
  const x1 = Math.min(180, point.lon + HALF_SIZE_DEG);
  const y0 = Math.max(-90, point.lat - HALF_SIZE_DEG);
  const y1 = Math.min(90, point.lat + HALF_SIZE_DEG);

  url.searchParams.set("map", `/map/${layer}.map`);
  url.searchParams.set("SERVICE", "WCS");
  url.searchParams.set("VERSION", "2.0.1");
  url.searchParams.set("REQUEST", "GetCoverage");
  url.searchParams.set("COVERAGEID", `${layer}_${DEPTH}_${quantile}`);
  url.searchParams.set("FORMAT", "GEOTIFF_INT16");
  url.searchParams.append("SUBSET", `X(${x0},${x1})`);
  url.searchParams.append("SUBSET", `Y(${y0},${y1})`);
  url.searchParams.set("SUBSETTINGCRS", WCS_CRS);
  url.searchParams.set("OUTPUTCRS", WCS_CRS);
  return url.toString();
}

async function readWcsRawValue(layer: string, quantile: Quantile, point: Point): Promise<number | null> {
  const url = buildWcsUrl(layer, quantile, point);
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`SOIL_WCS_HTTP_${response.status}`);

  const mime = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!mime.includes("tiff")) throw new Error("SOIL_WCS_NOT_TIFF");
  const declaredSize = Number(response.headers.get("content-length"));
  if (declaredSize > MAX_TIFF_BYTES) throw new Error("SOIL_WCS_TOO_LARGE");

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_TIFF_BYTES) {
    throw new Error("SOIL_WCS_INVALID_SIZE");
  }

  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const geoKeys = image.getGeoKeys();
  if (geoKeys?.GeographicTypeGeoKey !== 4326) {
    throw new Error("SOIL_WCS_UNEXPECTED_CRS");
  }

  const [minX, minY, maxX, maxY] = image.getBoundingBox();
  const width = image.getWidth();
  const height = image.getHeight();
  if (
    ![minX, minY, maxX, maxY].every(Number.isFinite) ||
    maxX <= minX || maxY <= minY || width < 1 || height < 1 ||
    point.lon < minX || point.lon > maxX || point.lat < minY || point.lat > maxY
  ) {
    throw new Error("SOIL_WCS_INVALID_GRID");
  }

  const x = Math.min(width - 1, Math.floor(((point.lon - minX) / (maxX - minX)) * width));
  const y = Math.min(height - 1, Math.floor(((maxY - point.lat) / (maxY - minY)) * height));
  const bands = await image.readRasters({ window: [x, y, x + 1, y + 1], samples: [0] });
  const value = bands[0]?.[0];
  const noData = image.getGDALNoData();

  if (typeof value !== "number" || !Number.isFinite(value) || value === noData) return null;
  // In sampled SoilGrids WCS urban/masked areas the server returned 0 without
  // a NoData tag. Conservatively treat non-positive readings as unavailable.
  // Do not use these values as measurements or substitute nearby pixels.
  if (value <= 0) return null;
  return value;
}

async function readQuantile(layer: string, quantile: Quantile, point: Point): Promise<number | null> {
  const raw = await readWcsRawValue(layer, quantile, point);
  // Official SoilGrids 2.0 conversion factors: these five layers all divide by 10.
  // soc -> g/kg; phh2o -> pH; sand/silt/clay -> percentage.
  return raw === null ? null : raw / 10;
}

async function readRange(layer: string, point: Point): Promise<RangeValue> {
  // Only fetch uncertainty quantiles when the median exists at the chosen point.
  const median = await readQuantile(layer, "Q0.5", point);
  if (median === null) return emptyRange();

  const [lower, upper] = await Promise.allSettled([
    readQuantile(layer, "Q0.05", point),
    readQuantile(layer, "Q0.95", point),
  ]);
  const low = lower.status === "fulfilled" ? lower.value : null;
  const high = upper.status === "fulfilled" ? upper.value : null;
  return {
    median,
    low: low !== null && low <= median ? low : null,
    high: high !== null && high >= median ? high : null,
  };
}

export async function collectRawSoil(point: Point): Promise<RawSoil> {
  if (
    !Number.isFinite(point.lat) || point.lat < -90 || point.lat > 90 ||
    !Number.isFinite(point.lon) || point.lon < -180 || point.lon > 180
  ) {
    throw new Error("SOIL_INVALID_COORDINATES");
  }

  const results = await Promise.allSettled(
    PROPERTIES.map(({ layer }) => readRange(layer, point)),
  );
  const properties = {} as SoilProperties;
  PROPERTIES.forEach(({ key }, index) => {
    const result = results[index];
    properties[key as SoilKey] = result.status === "fulfilled" ? result.value : emptyRange();
    if (result.status === "rejected") {
      console.warn("SoilGrids WCS unavailable for", key, result.reason);
    }
  });

  if (Object.values(properties).every((range) => range.median === null)) {
    throw new Error("NO_SOIL_DATA");
  }

  return {
    wrbGroup: null,
    properties,
    source: "ISRIC SoilGrids 2.0 WCS (0-5 cm; approx. 250 m grid)",
  };
}
