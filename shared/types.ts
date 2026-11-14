/**
 * Field Shift — API contract v2.
 *
 * Single source of truth for the whole team. Owner: Nazar (team lead).
 * Rules:
 *  - Fields may be ADDED (after agreement with the team lead), never removed or renamed.
 *  - If data is missing, use `null`. Never invent a value.
 *  - Human-readable docs: docs/api-contract.md. Example payload: shared/mock-analyze.json.
 */

export const CONTRACT_VERSION = "2.0.0";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type Lang = "en" | "uk";
export type Confidence = "low" | "medium" | "high";
export type StressLevel = "low" | "moderate" | "high";
export type StressId = "drought" | "waterlogging" | "frost" | "heat" | "erosion" | "fertility";
export type DataStatusValue = "live" | "cached" | "partial" | "failed";
export type FieldSource = "ftw" | "osm" | "drawn" | "point";

/** Exactly the six stress ids, in the order the API returns them. */
export const STRESS_IDS: readonly StressId[] = [
  "drought",
  "waterlogging",
  "frost",
  "heat",
  "erosion",
  "fertility",
];

/** Special crop ids allowed in history in addition to ids from GET /api/crops. */
export const SPECIAL_CROP_IDS = ["fallow", "unknown"] as const;
export type SpecialCropId = (typeof SPECIAL_CROP_IDS)[number];

export const RADIUS_KM_MIN = 1;
export const RADIUS_KM_MAX = 25;
export const RADIUS_KM_DEFAULT = 5;
export const PRIORITY_MIN = 1;
export const PRIORITY_MAX = 5;
export const PRIORITY_DEFAULT = 3;
export const HISTORY_YEARS = 3;

/** 12 values, index 0 = January ... 11 = December. */
export type MonthlyValues = number[];

export interface LatLon {
  /** -90..90 */
  lat: number;
  /** -180..180 */
  lon: number;
}

// ---------------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------------

/** GeoJSON position: [lon, lat]. */
export type Position = number[];

export interface PointGeometry {
  type: "Point";
  coordinates: Position;
}
export interface PolygonGeometry {
  type: "Polygon";
  coordinates: Position[][];
}
export interface MultiPolygonGeometry {
  type: "MultiPolygon";
  coordinates: Position[][][];
}
export type FieldGeometry = PointGeometry | PolygonGeometry | MultiPolygonGeometry;

export interface Field {
  /** ftw = Fields of the World, osm = OpenStreetMap, drawn = drawn by user, point = just a point. */
  source: FieldSource;
  /** For source "point" the geometry is a GeoJSON Point. */
  geometry: FieldGeometry;
  /** Area in hectares. Absent or null for source "point". */
  areaHa?: number | null;
  /** Caption about the boundary origin, e.g. "Estimated from satellite imagery, not a legal boundary". */
  note?: string | null;
}

// ---------------------------------------------------------------------------
// POST /api/analyze — request
// ---------------------------------------------------------------------------

export interface HistoryYear {
  year: number;
  /** One or more crop ids from GET /api/crops, or "fallow" / "unknown". Never empty. */
  crops: string[];
}

/** Each value 1..5, default 3. */
export interface Priorities {
  water: number;
  income: number;
  soil: number;
  erosion: number;
}

export interface AnalyzeRequest {
  /** Centre of the analysis circle (centre of the field). */
  location: LatLon;
  field: Field;
  /** 1..25, default 5. */
  radiusKm: number;
  /** Exactly three years, oldest first. */
  history: HistoryYear[];
  /** Optional; missing means all 3. */
  priorities?: Priorities;
  /** Language of all explanatory texts in the response. Default "en". */
  lang?: Lang;
}

// ---------------------------------------------------------------------------
// POST /api/analyze — response
// ---------------------------------------------------------------------------

export interface KoppenClass {
  /** e.g. "Dfb" */
  code: string;
  name: string;
  /** Plain-language explanation in the requested language. */
  explain: string;
}

export interface ClimateMonthly {
  tempC: MonthlyValues;
  tempMinC: MonthlyValues;
  tempMaxC: MonthlyValues;
  /** Monthly totals in mm (NOT mm/day). */
  precipMm: MonthlyValues;
  /** Potential evapotranspiration, monthly totals in mm. */
  petMm: MonthlyValues;
}

export interface ClimateSpread {
  /** Disagreement between sample points inside the radius, annual mean temperature, °C. */
  tempC: number | null;
  /** Disagreement between sample points inside the radius, annual precipitation, mm. */
  precipMm: number | null;
}

export interface Climate {
  koppen: KoppenClass | null;
  annualTempC: number | null;
  annualPrecipMm: number | null;
  growingSeasonMonths: number | null;
  frostFreeMonths: number | null;
  monthly: ClimateMonthly;
  spread: ClimateSpread;
  /** Number of sample points that actually returned data (1..9). */
  samples: number;
  /** e.g. "NASA POWER 2001-2020" */
  source: string;
}

export interface WrbGroup {
  /** Short code, e.g. "CH". */
  code: string;
  /** e.g. "Chernozems" */
  name: string;
  /** 0..1, probability of the most probable group. Null if unknown. */
  probability: number | null;
  explain: string;
}

export interface RangeValue {
  median: number | null;
  low: number | null;
  high: number | null;
}

export interface SoilProperties {
  /** Soil organic carbon, g/kg. */
  organicCarbonGkg: RangeValue;
  phH2O: RangeValue;
  sandPct: RangeValue;
  siltPct: RangeValue;
  clayPct: RangeValue;
}

export interface Soil {
  wrbGroup: WrbGroup | null;
  properties: SoilProperties;
  /** e.g. "ISRIC SoilGrids 2.0" */
  source: string;
}

export interface Terrain {
  elevationM: number | null;
  slopePct: number | null;
}

export interface Evidence {
  label: string;
  value: number | string;
  unit?: string | null;
}

export interface StressItem {
  id: StressId;
  level: StressLevel;
  /** 0..100, higher = more stress. */
  score: number;
  /** One sentence for a non-farmer (Simple mode). */
  whyShort: string;
  /** Full explanation with concrete numbers (Expert mode). */
  whyFull: string;
  evidence: Evidence[];
  confidence: Confidence;
  sources: string[];
}

export interface CropShare {
  /** Crop id from GET /api/crops. */
  id: string;
  /** Crop name in the requested language. */
  name: string;
  /** Multiple of 5; all shares sum to exactly 100. */
  sharePct: number;
  /** 0..100 suitability score (relative, not a yield). */
  score: number;
  why: string;
}

export interface RotationBlock {
  cropId: string;
  sharePct: number;
}

export interface RotationYear {
  year: number;
  blocks: RotationBlock[];
}

export interface TillageAdvice {
  id: string;
  title: string;
  /** Plain-language advice (Simple mode). */
  simple: string;
  /** Agronomic wording with numbers (Expert mode). */
  expert: string;
  /** Why this advice applies to this very field, with numbers. */
  why: string;
}

export interface Recommendation {
  crops: CropShare[];
  /** The three years following the last history year. */
  rotationPlan: RotationYear[];
  tillage: TillageAdvice[];
  warnings: string[];
  confidence: Confidence;
  assumptions: string[];
}

export interface DataStatus {
  climate: DataStatusValue;
  soil: DataStatusValue;
  terrain: DataStatusValue;
}

export interface AnalyzeResponse {
  field: Field;
  /** Null only when dataStatus.climate is "failed". */
  climate: Climate | null;
  /** Null only when dataStatus.soil is "failed". */
  soil: Soil | null;
  /** Null only when dataStatus.terrain is "failed". */
  terrain: Terrain | null;
  /** Exactly six items, ids as in STRESS_IDS. */
  stress: StressItem[];
  recommendation: Recommendation;
  dataStatus: DataStatus;
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// Other endpoints
// ---------------------------------------------------------------------------

export type CropGroup =
  | "cereal"
  | "legume"
  | "oilseed"
  | "root"
  | "vegetable"
  | "industrial"
  | "cover"
  | "other";

export interface LocalizedText {
  en: string;
  uk: string;
}

/** One item of GET /api/crops (a light view of data/crops.json for the crop picker). */
export interface CropOption {
  id: string;
  name: LocalizedText;
  group: CropGroup;
  /** Emoji or icon key. */
  icon: string;
}

export interface CropsResponse {
  crops: CropOption[];
}

/** GET /api/field?lat=&lon= — `field` is null when nothing was found at the point. */
export interface FieldResponse {
  field: Field | null;
}

export interface HealthResponse {
  ok: true;
  contract: string;
  time: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ErrorCode =
  | "INVALID_REQUEST" // 400 — body or query failed validation
  | "NOT_FOUND" // 404 — unknown route
  | "NO_SOIL_DATA" // 422 — sea, ice or outside SoilGrids coverage
  | "NO_CLIMATE_DATA" // 422 — climate source has no data for the point
  | "RATE_LIMITED" // 429 — too many requests from this IP
  | "UPSTREAM_UNAVAILABLE" // 502 — all sources failed and there is no cache
  | "INTERNAL"; // 500 — unexpected error

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
  };
}

// ---------------------------------------------------------------------------
// Internal boundary: apps/api (data collection) -> packages/logic (pure rules)
// Not part of the public HTTP API, but both sides must agree on it.
// ---------------------------------------------------------------------------

/** Climate as collected by the API, before Köppen / PET / season maths. */
export interface RawClimate {
  monthly: {
    tempC: MonthlyValues;
    tempMinC: MonthlyValues;
    tempMaxC: MonthlyValues;
    /** Monthly totals in mm (the API converts POWER mm/day to mm/month). */
    precipMm: MonthlyValues;
    /** All-sky surface shortwave radiation, MJ/m²/day. Null if not collected. */
    solarMjM2Day: MonthlyValues | null;
  };
  spread: ClimateSpread;
  samples: number;
  source: string;
}

/** Soil as collected by the API, before the WRB explanation is attached. */
export interface RawSoil {
  wrbGroup: { name: string; probability: number | null } | null;
  properties: SoilProperties;
  source: string;
}

export interface LogicInput {
  location: LatLon;
  field: Field;
  radiusKm: number;
  history: HistoryYear[];
  priorities: Priorities;
  lang: Lang;
  climate: RawClimate | null;
  soil: RawSoil | null;
  terrain: Terrain | null;
  dataStatus: DataStatus;
}

/** What packages/logic returns; the API adds field, dataStatus and disclaimer on top. */
export interface LogicOutput {
  climate: Climate | null;
  soil: Soil | null;
  stress: StressItem[];
  recommendation: Recommendation;
}
