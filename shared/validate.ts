/**
 * Dependency-free runtime checks for the API contract.
 * Each function returns a list of problems; an empty list means the value is valid.
 * Used by the contract test (scripts/contract-check.ts) and by API request validation.
 */
import {
  HISTORY_YEARS,
  PRIORITY_MAX,
  PRIORITY_MIN,
  RADIUS_KM_MAX,
  RADIUS_KM_MIN,
  SPECIAL_CROP_IDS,
  STRESS_IDS,
} from "./types";

type Obj = Record<string, unknown>;

const CONFIDENCE = ["low", "medium", "high"];
const LEVELS = ["low", "moderate", "high"];
const DATA_STATUS = ["live", "cached", "partial", "failed"];
const FIELD_SOURCES = ["ftw", "osm", "drawn", "point"];
const LANGS = ["en", "uk"];

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNumOrNull = (v: unknown) => v === null || isNum(v);

class Checker {
  errors: string[] = [];
  fail(path: string, msg: string) {
    this.errors.push(`${path}: ${msg}`);
  }
  str(o: Obj, key: string, path: string, opts: { nonEmpty?: boolean } = {}) {
    const v = o[key];
    if (!isStr(v)) this.fail(`${path}.${key}`, "must be a string");
    else if (opts.nonEmpty && v.trim() === "") this.fail(`${path}.${key}`, "must not be empty");
  }
  num(o: Obj, key: string, path: string, min = -Infinity, max = Infinity) {
    const v = o[key];
    if (!isNum(v)) this.fail(`${path}.${key}`, "must be a number");
    else if (v < min || v > max) this.fail(`${path}.${key}`, `must be between ${min} and ${max}`);
  }
  numOrNull(o: Obj, key: string, path: string) {
    if (!isNumOrNull(o[key])) this.fail(`${path}.${key}`, "must be a number or null");
  }
  oneOf(o: Obj, key: string, path: string, allowed: readonly string[]) {
    const v = o[key];
    if (!isStr(v) || !allowed.includes(v)) {
      this.fail(`${path}.${key}`, `must be one of ${allowed.join(", ")}`);
    }
  }
  strArray(o: Obj, key: string, path: string) {
    const v = o[key];
    if (!Array.isArray(v) || !v.every(isStr)) this.fail(`${path}.${key}`, "must be an array of strings");
  }
  monthly(o: Obj, key: string, path: string) {
    const v = o[key];
    if (!Array.isArray(v) || v.length !== 12 || !v.every(isNum)) {
      this.fail(`${path}.${key}`, "must be an array of 12 numbers");
    }
  }
  obj(o: Obj, key: string, path: string): Obj | null {
    const v = o[key];
    if (!isObj(v)) {
      this.fail(`${path}.${key}`, "must be an object");
      return null;
    }
    return v;
  }
}

function checkField(c: Checker, v: unknown, path: string) {
  if (!isObj(v)) return c.fail(path, "must be an object");
  c.oneOf(v, "source", path, FIELD_SOURCES);
  const g = c.obj(v, "geometry", path);
  if (g) {
    c.oneOf(g, "type", `${path}.geometry`, ["Point", "Polygon", "MultiPolygon"]);
    if (!Array.isArray(g.coordinates)) c.fail(`${path}.geometry.coordinates`, "must be an array");
    if (v.source === "point" && g.type !== "Point") {
      c.fail(`${path}.geometry.type`, 'must be "Point" when source is "point"');
    }
    if (v.source !== "point" && g.type === "Point") {
      c.fail(`${path}.geometry.type`, 'must be a polygon unless source is "point"');
    }
  }
  if (v.areaHa !== undefined && !isNumOrNull(v.areaHa)) c.fail(`${path}.areaHa`, "must be a number or null");
  if (v.note !== undefined && v.note !== null && !isStr(v.note)) c.fail(`${path}.note`, "must be a string or null");
}

/**
 * Validates the body of POST /api/analyze.
 * @param knownCropIds ids from data/crops.json; when given, history crops are checked against it.
 */
export function validateAnalyzeRequest(body: unknown, knownCropIds?: readonly string[]): string[] {
  const c = new Checker();
  if (!isObj(body)) return ["body: must be a JSON object"];

  const loc = c.obj(body, "location", "body");
  if (loc) {
    c.num(loc, "lat", "location", -90, 90);
    c.num(loc, "lon", "location", -180, 180);
  }
  checkField(c, body.field, "field");
  c.num(body, "radiusKm", "body", RADIUS_KM_MIN, RADIUS_KM_MAX);

  const history = body.history;
  if (!Array.isArray(history) || history.length !== HISTORY_YEARS) {
    c.fail("history", `must be an array of exactly ${HISTORY_YEARS} years`);
  } else {
    history.forEach((h, i) => {
      const p = `history[${i}]`;
      if (!isObj(h)) return c.fail(p, "must be an object");
      if (!isNum(h.year) || !Number.isInteger(h.year)) c.fail(`${p}.year`, "must be an integer");
      if (!Array.isArray(h.crops) || h.crops.length === 0 || !h.crops.every(isStr)) {
        return c.fail(`${p}.crops`, "must be a non-empty array of crop ids");
      }
      if (knownCropIds) {
        for (const id of h.crops as string[]) {
          if (!knownCropIds.includes(id) && !(SPECIAL_CROP_IDS as readonly string[]).includes(id)) {
            c.fail(`${p}.crops`, `unknown crop id "${id}"`);
          }
        }
      }
    });
  }

  if (body.priorities !== undefined) {
    const pr = c.obj(body, "priorities", "body");
    if (pr) for (const k of ["water", "income", "soil", "erosion"]) c.num(pr, k, "priorities", PRIORITY_MIN, PRIORITY_MAX);
  }
  if (body.lang !== undefined) c.oneOf(body, "lang", "body", LANGS);
  return c.errors;
}

function checkRange(c: Checker, parent: Obj, key: string, path: string) {
  const r = c.obj(parent, key, path);
  if (r) for (const k of ["median", "low", "high"]) c.numOrNull(r, k, `${path}.${key}`);
}

/** Validates the body of a successful POST /api/analyze response against contract v2. */
export function validateAnalyzeResponse(res: unknown): string[] {
  const c = new Checker();
  if (!isObj(res)) return ["response: must be a JSON object"];

  checkField(c, res.field, "field");

  const status = c.obj(res, "dataStatus", "response");
  if (status) for (const k of ["climate", "soil", "terrain"]) c.oneOf(status, k, "dataStatus", DATA_STATUS);

  // climate
  if (res.climate === null) {
    if (status && status.climate !== "failed") c.fail("climate", 'may be null only when dataStatus.climate is "failed"');
  } else {
    const cl = c.obj(res, "climate", "response");
    if (cl) {
      if (cl.koppen !== null) {
        const k = c.obj(cl, "koppen", "climate");
        if (k) for (const f of ["code", "name", "explain"]) c.str(k, f, "climate.koppen", { nonEmpty: true });
      }
      for (const f of ["annualTempC", "annualPrecipMm", "growingSeasonMonths", "frostFreeMonths"]) c.numOrNull(cl, f, "climate");
      const m = c.obj(cl, "monthly", "climate");
      if (m) for (const f of ["tempC", "tempMinC", "tempMaxC", "precipMm", "petMm"]) c.monthly(m, f, "climate.monthly");
      const sp = c.obj(cl, "spread", "climate");
      if (sp) for (const f of ["tempC", "precipMm"]) c.numOrNull(sp, f, "climate.spread");
      c.num(cl, "samples", "climate", 1, 9);
      c.str(cl, "source", "climate", { nonEmpty: true });
    }
  }

  // soil
  if (res.soil === null) {
    if (status && status.soil !== "failed") c.fail("soil", 'may be null only when dataStatus.soil is "failed"');
  } else {
    const so = c.obj(res, "soil", "response");
    if (so) {
      if (so.wrbGroup !== null) {
        const w = c.obj(so, "wrbGroup", "soil");
        if (w) {
          for (const f of ["code", "name", "explain"]) c.str(w, f, "soil.wrbGroup", { nonEmpty: true });
          if (w.probability !== null) c.num(w, "probability", "soil.wrbGroup", 0, 1);
        }
      }
      const pr = c.obj(so, "properties", "soil");
      if (pr) for (const f of ["organicCarbonGkg", "phH2O", "sandPct", "siltPct", "clayPct"]) checkRange(c, pr, f, "soil.properties");
      c.str(so, "source", "soil", { nonEmpty: true });
    }
  }

  // terrain
  if (res.terrain === null) {
    if (status && status.terrain !== "failed") c.fail("terrain", 'may be null only when dataStatus.terrain is "failed"');
  } else {
    const t = c.obj(res, "terrain", "response");
    if (t) for (const f of ["elevationM", "slopePct"]) c.numOrNull(t, f, "terrain");
  }

  // stress: exactly six, fixed ids
  const stress = res.stress;
  if (!Array.isArray(stress)) {
    c.fail("stress", "must be an array");
  } else {
    const ids = stress.map((s) => (isObj(s) ? s.id : undefined));
    if (stress.length !== STRESS_IDS.length || !STRESS_IDS.every((id) => ids.includes(id))) {
      c.fail("stress", `must have exactly 6 items with ids ${STRESS_IDS.join(", ")}`);
    }
    stress.forEach((s, i) => {
      const p = `stress[${i}]`;
      if (!isObj(s)) return c.fail(p, "must be an object");
      c.oneOf(s, "id", p, STRESS_IDS);
      c.oneOf(s, "level", p, LEVELS);
      c.num(s, "score", p, 0, 100);
      c.str(s, "whyShort", p, { nonEmpty: true });
      c.str(s, "whyFull", p, { nonEmpty: true });
      c.oneOf(s, "confidence", p, CONFIDENCE);
      c.strArray(s, "sources", p);
      if (!Array.isArray(s.evidence)) c.fail(`${p}.evidence`, "must be an array");
      else
        s.evidence.forEach((e, j) => {
          const ep = `${p}.evidence[${j}]`;
          if (!isObj(e)) return c.fail(ep, "must be an object");
          c.str(e, "label", ep, { nonEmpty: true });
          if (!isNum(e.value) && !isStr(e.value)) c.fail(`${ep}.value`, "must be a number or string");
        });
    });
  }

  // recommendation
  const rec = c.obj(res, "recommendation", "response");
  if (rec) {
    const checkShares = (items: unknown, path: string, idKey: string) => {
      if (!Array.isArray(items)) return c.fail(path, "must be an array");
      let sum = 0;
      items.forEach((it, i) => {
        const p = `${path}[${i}]`;
        if (!isObj(it)) return c.fail(p, "must be an object");
        c.str(it, idKey, p, { nonEmpty: true });
        c.num(it, "sharePct", p, 0, 100);
        if (isNum(it.sharePct)) {
          sum += it.sharePct;
          if (it.sharePct % 5 !== 0) c.fail(`${p}.sharePct`, "must be a multiple of 5");
        }
      });
      if (items.length > 0 && sum !== 100) c.fail(path, `sharePct must sum to 100, got ${sum}`);
    };

    checkShares(rec.crops, "recommendation.crops", "id");
    if (Array.isArray(rec.crops)) {
      rec.crops.forEach((cr, i) => {
        if (!isObj(cr)) return;
        const p = `recommendation.crops[${i}]`;
        c.str(cr, "name", p, { nonEmpty: true });
        c.num(cr, "score", p, 0, 100);
        c.str(cr, "why", p, { nonEmpty: true });
      });
    }

    if (!Array.isArray(rec.rotationPlan)) c.fail("recommendation.rotationPlan", "must be an array");
    else {
      if (rec.rotationPlan.length !== 3) c.fail("recommendation.rotationPlan", "must cover exactly 3 years");
      rec.rotationPlan.forEach((y, i) => {
        const p = `recommendation.rotationPlan[${i}]`;
        if (!isObj(y)) return c.fail(p, "must be an object");
        if (!isNum(y.year) || !Number.isInteger(y.year)) c.fail(`${p}.year`, "must be an integer");
        checkShares(y.blocks, `${p}.blocks`, "cropId");
      });
    }

    // strategies: at least three, exactly one "current" and one "recommended"
    if (!Array.isArray(rec.strategies)) c.fail("recommendation.strategies", "must be an array");
    else {
      const kinds = rec.strategies.map((s) => (isObj(s) ? s.kind : undefined));
      if (rec.strategies.length < 3) c.fail("recommendation.strategies", "must have at least 3 strategies");
      for (const kind of ["current", "recommended"]) {
        if (kinds.filter((k) => k === kind).length !== 1) {
          c.fail("recommendation.strategies", `must have exactly one strategy of kind "${kind}"`);
        }
      }
      rec.strategies.forEach((s, i) => {
        const p = `recommendation.strategies[${i}]`;
        if (!isObj(s)) return c.fail(p, "must be an object");
        for (const f of ["id", "title", "summary", "why"]) c.str(s, f, p, { nonEmpty: true });
        c.oneOf(s, "kind", p, ["current", "recommended", "alternative"]);
        c.num(s, "score", p, 0, 100);
        c.oneOf(s, "confidence", p, CONFIDENCE);
        for (const f of ["benefits", "risks", "dataGaps"]) c.strArray(s, f, p);
        if (!Array.isArray(s.evidence)) c.fail(`${p}.evidence`, "must be an array");
        if (s.bareSoilMonths !== null) c.num(s, "bareSoilMonths", p, 0, 12);
        if (!Array.isArray(s.rotationPlan)) return c.fail(`${p}.rotationPlan`, "must be an array");
        const emptyAllowed = s.kind === "current" && s.rotationPlan.length === 0;
        if (!emptyAllowed && s.rotationPlan.length !== 3) {
          c.fail(`${p}.rotationPlan`, 'must cover exactly 3 years (may be empty only for kind "current")');
        }
        s.rotationPlan.forEach((y, j) => {
          const yp = `${p}.rotationPlan[${j}]`;
          if (!isObj(y)) return c.fail(yp, "must be an object");
          if (!isNum(y.year) || !Number.isInteger(y.year)) c.fail(`${yp}.year`, "must be an integer");
          checkShares(y.blocks, `${yp}.blocks`, "cropId");
        });
      });
    }

    if (rec.avoid !== undefined) {
      if (!Array.isArray(rec.avoid)) c.fail("recommendation.avoid", "must be an array when present");
      else
        rec.avoid.forEach((a, i) => {
          const p = `recommendation.avoid[${i}]`;
          if (!isObj(a)) return c.fail(p, "must be an object");
          for (const f of ["id", "name", "why"]) c.str(a, f, p, { nonEmpty: true });
          if (a.reason !== "rotation" && a.reason !== "site") c.fail(`${p}.reason`, 'must be "rotation" or "site"');
        });
    }

    if (!Array.isArray(rec.tillage)) c.fail("recommendation.tillage", "must be an array");
    else
      rec.tillage.forEach((t, i) => {
        const p = `recommendation.tillage[${i}]`;
        if (!isObj(t)) return c.fail(p, "must be an object");
        for (const f of ["id", "title", "simple", "expert", "why"]) c.str(t, f, p, { nonEmpty: true });
      });

    c.strArray(rec, "warnings", "recommendation");
    c.strArray(rec, "assumptions", "recommendation");
    c.oneOf(rec, "confidence", "recommendation", CONFIDENCE);
  }

  c.str(res, "disclaimer", "response", { nonEmpty: true });
  return c.errors;
}
