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
import mockAnalyze from "@field-shift/shared/mock-analyze.json";
import cropsFile from "../../../data/crops.json";

type Bindings = {
  CACHE: KVNamespace;
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

app.get("/field", (c) => {
  const lat = Number(c.req.query("lat") ?? NaN);
  const lon = Number(c.req.query("lon") ?? NaN);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return c.json(fail("INVALID_REQUEST", "lat must be -90..90 and lon must be -180..180"), 400);
  }
  // TODO(backend): OSM Overpass lookup. Until then: nothing found, the UI falls back to a point.
  return c.json<FieldResponse>({ field: null });
});

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

  // TODO(backend): collect real climate / soil / terrain here (NASA POWER, SoilGrids, elevation API).
  // Until then the mock stands in for the collected data and for the result of recommend().
  const mock = mockAnalyze as unknown as AnalyzeResponse;
  const input: LogicInput = {
    location: req.location,
    field: req.field,
    radiusKm: req.radiusKm,
    history: req.history,
    priorities: req.priorities ?? { water: d, income: d, soil: d, erosion: d },
    lang,
    climate: null,
    soil: null,
    terrain: mock.terrain,
    dataStatus: mock.dataStatus,
  };
  const logic = recommend(input);

  const response: AnalyzeResponse = {
    field: { ...req.field, note: req.field.note ?? null },
    climate: logic.climate,
    soil: logic.soil,
    terrain: input.terrain,
    stress: logic.stress,
    recommendation: logic.recommendation,
    dataStatus: input.dataStatus,
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
