/**
 * Field Shift API — Cloudflare Worker on Hono.
 * SKELETON by the team lead: every endpoint answers in the contract shape using the mock.
 * Owner of this folder: Yehor (branch `backend`) — replace the bodies with real data collection.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ApiError,
  CropOption,
  CropsResponse,
  ErrorCode,
  FieldResponse,
  HealthResponse,
  LogicInput,
} from "@field-shift/shared";
import { CONTRACT_VERSION, PRIORITY_DEFAULT, validateAnalyzeRequest } from "@field-shift/shared";
import { recommend } from "@field-shift/logic";
import cropsFile from "../../../data/crops.json";
import { findOSMField } from "./fields";
import { collectRawClimate } from "./power";
import { collectRawSoil } from "./soil";
import { collectTerrain } from "./terrain";
import { cached, type CachedResult } from "./http";
import type { RawClimate, RawSoil, Terrain, DataStatusValue } from "@field-shift/shared";

type Bindings = {
  CACHE?: KVNamespace;
  ASSETS: Fetcher;
};

const DISCLAIMER: Record<"en" | "uk", string> = {
  en: "This tool supports decisions and does not replace a local agronomist.",
  uk: "Цей інструмент допомагає у рішеннях і не замінює місцевого агронома.",
};

const crops = cropsFile.crops as CropOption[];
const cropIds = crops.map((c) => c.id);

const fail = (code: ErrorCode, message: string): ApiError => ({ error: { code, message } });

const app = new Hono<{ Bindings: Bindings }>().basePath("/api");

app.use("*", cors());

app.get("/health", (c) =>
  c.json<HealthResponse>({ ok: true, contract: CONTRACT_VERSION, time: new Date().toISOString() }),
);

app.get("/crops", (c) => {
  const body: CropsResponse = {
    crops: crops.map(({ id, name, group, icon }) => ({ id, name, group, icon })),
  };
  return c.json(body);
});

app.get("/field", async (c) => {
  const rawLat = c.req.query("lat"), rawLon = c.req.query("lon");
  const lat = Number(rawLat), lon = Number(rawLon);
  if (!rawLat || !rawLon || !Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lon) || lon < -180 || lon > 180)
    return c.json(fail("INVALID_REQUEST", "lat must be -90..90 and lon must be -180..180"), 400);
  try {
    const key = "field:v1:" + lat.toFixed(4) + ":" + lon.toFixed(4);
    const result = await cached(c.env.CACHE, key, 86400, () => findOSMField({ lat, lon }));
    return c.json<FieldResponse>({ field: result.value });
  } catch (err) {
    console.warn("Field lookup unavailable", err);
    return c.json(fail("UPSTREAM_UNAVAILABLE", "Field boundary provider unavailable"), 502);
  }
});

function unpack<T>(result: PromiseSettledResult<CachedResult<T>>):
  { value: T | null; status: DataStatusValue } {
  if (result.status === "rejected") {
    console.warn("Data provider failed", result.reason);
    return { value: null, status: "failed" };
  }
  return {
    value: result.value.value,
    status: result.value.source === "live" ? "live" : "cached",
  };
}

app.post("/analyze", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail("INVALID_REQUEST", "Body must be valid JSON"), 400);
  }
  const problems = validateAnalyzeRequest(body, cropIds);
  if (problems.length > 0) {
    return c.json(fail("INVALID_REQUEST", problems.join("; ")), 400);
  }
  const req = body as AnalyzeRequest;
  const lang = req.lang ?? "en";
  const d = PRIORITY_DEFAULT;

  const climateKey = "climate:v1:" + req.location.lat.toFixed(1) + ":" +
    req.location.lon.toFixed(1) + ":" + req.radiusKm;
  const soilKey = "soil:v1:" + req.location.lat.toFixed(1) + ":" + req.location.lon.toFixed(1);
  const terrainKey = "terrain:v1:" + req.location.lat.toFixed(2) + ":" + req.location.lon.toFixed(2);

  const results = await Promise.allSettled([
    cached(c.env.CACHE, climateKey, 604800, () => collectRawClimate(req.location, req.radiusKm)),
    cached(c.env.CACHE, soilKey, 2592000, () => collectRawSoil(req.location)),
    cached(c.env.CACHE, terrainKey, 2592000, () => collectTerrain(req.location)),
  ] as const);
  const climate = unpack<RawClimate>(results[0]);
  const soil = unpack<RawSoil>(results[1]);
  const terrain = unpack<Terrain>(results[2]);

  if (climate.value === null && soil.value === null && terrain.value === null) {
    return c.json(fail("UPSTREAM_UNAVAILABLE", "No data providers responded"), 502);
  }
  const dataStatus = {
    climate: climate.value !== null && climate.value.samples < 9 && climate.status === "live"
      ? "partial" as const : climate.status,
    soil: soil.status,
    terrain: terrain.status,
  };
  const input: LogicInput = {
    location: req.location,
    field: req.field,
    radiusKm: req.radiusKm,
    history: req.history,
    priorities: req.priorities ?? { water: d, income: d, soil: d, erosion: d },
    lang,
    climate: climate.value,
    soil: soil.value,
    terrain: terrain.value,
    dataStatus,
  };
  // The team's recommend() currently returns a mock; Serhii will replace that logic.
  const logic = recommend(input);

  const response: AnalyzeResponse = {
    field: { ...req.field, note: req.field.note ?? null },
    climate: climate.value === null ? null : logic.climate,
    soil: soil.value === null ? null : logic.soil,
    terrain: terrain.value,
    stress: logic.stress,
    recommendation: logic.recommendation,
    dataStatus,
    disclaimer: DISCLAIMER[lang],
  };
  return c.json(response);
});

app.notFound((c) => c.json(fail("NOT_FOUND", `No route ${c.req.method} ${c.req.path}`), 404));

app.onError((err, c) => {
  console.error(err);
  return c.json(fail("INTERNAL", "Unexpected server error"), 500);
});

export default app;
