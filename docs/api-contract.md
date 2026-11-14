# API contract v2

The single shared language of the team. The backend returns exactly this JSON; the frontend builds
its screens only on it. The machine-readable version is [shared/types.ts](../shared/types.ts), the
example is [shared/mock-analyze.json](../shared/mock-analyze.json), and the runtime checks are in
[shared/validate.ts](../shared/validate.ts).

## Rules

1. Only the team lead (Nazar) changes `shared/` and this file.
2. Fields may be **added** after agreement with the team lead. Fields are never removed or renamed.
3. If data is missing, the value is `null`. Never invent a value.
4. All explanatory text in a response is in the requested `lang` (`en` by default, or `uk`).
5. No yields in tonnes and no money. Scores are relative (0-100).
6. Every response carries the `disclaimer`.

## Endpoints

| Endpoint | Purpose | Owner |
| --- | --- | --- |
| `GET /api/health` | The Worker is alive | Yehor |
| `GET /api/crops` | Crop list for the history picker, from `data/crops.json` | Yehor (data by Serhii) |
| `GET /api/field?lat=&lon=` | Looks for a field at the point (OSM fallback) | Yehor |
| `POST /api/analyze` | Main analysis: climate, soil, stress, recommendation | Yehor (data) + Serhii (logic) |

### GET /api/health

```json
{ "ok": true, "contract": "2.1.0", "time": "2026-11-14T09:00:00.000Z" }
```

### GET /api/crops

```json
{
  "crops": [
    { "id": "winter_wheat", "name": { "en": "Winter wheat", "uk": "Пшениця озима" }, "group": "cereal", "icon": "🌾" }
  ]
}
```

`group` is one of `cereal`, `legume`, `oilseed`, `root`, `vegetable`, `industrial`, `cover`, `other`.
Two special ids are always allowed in history and are **not** in this list: `fallow` and `unknown`.

### GET /api/field?lat=&lon=

Returns `{ "field": Field }` or `{ "field": null }` when nothing is found at the point (the UI then
offers a point or a hand-drawn polygon). Invalid coordinates give `400 INVALID_REQUEST`.

### POST /api/analyze — request

```json
{
  "location": { "lat": 49.84, "lon": 24.03 },
  "field": {
    "source": "ftw",
    "geometry": { "type": "Polygon", "coordinates": [[[24.03, 49.84], [24.04, 49.84], [24.04, 49.85], [24.03, 49.85], [24.03, 49.84]]] },
    "areaHa": 42.5
  },
  "radiusKm": 5,
  "history": [
    { "year": 2024, "crops": ["winter_wheat"] },
    { "year": 2025, "crops": ["corn", "soybean"] },
    { "year": 2026, "crops": ["fallow"] }
  ],
  "priorities": { "water": 3, "income": 3, "soil": 3, "erosion": 3 },
  "lang": "en"
}
```

| Field | Rule |
| --- | --- |
| `location.lat`, `location.lon` | -90..90 and -180..180; centre of the analysis circle |
| `field.source` | `ftw` (Fields of the World), `osm`, `drawn` or `point` |
| `field.geometry` | GeoJSON, positions are `[lon, lat]`. For `point` it is a `Point`; otherwise `Polygon` or `MultiPolygon` |
| `field.areaHa` | hectares; absent or `null` for `point` |
| `radiusKm` | 1..25, default 5 |
| `history` | exactly 3 years, oldest first; each `crops` is a non-empty list of ids from `/api/crops`, or `fallow` / `unknown` |
| `priorities` | optional; each 1..5, default 3 |
| `lang` | optional; `en` (default) or `uk` |

### POST /api/analyze — response

The full example is [shared/mock-analyze.json](../shared/mock-analyze.json) (numbers are illustrative).

| Block | Content |
| --- | --- |
| `field` | the field echoed back, plus `note` about the boundary origin |
| `climate` | `koppen {code, name, explain}`, `annualTempC`, `annualPrecipMm`, `growingSeasonMonths`, `frostFreeMonths`, `monthly {tempC, tempMinC, tempMaxC, precipMm, petMm}` (12 values each, January first, precipitation and PET are monthly totals in mm), `spread {tempC, precipMm}`, `samples` (1..9), `source` |
| `soil` | `wrbGroup {code, name, probability 0..1, explain}`, `properties {organicCarbonGkg, phH2O, sandPct, siltPct, clayPct}` each as `{median, low, high}`, `source` |
| `terrain` | `elevationM`, `slopePct` |
| `stress` | exactly 6 items, see below |
| `recommendation` | `crops[]`, `rotationPlan[]`, `strategies[]`, `tillage[]`, `warnings[]`, `confidence`, `assumptions[]` |
| `dataStatus` | `{climate, soil, terrain}`, each `live`, `cached`, `partial` or `failed` |
| `disclaimer` | always present |

Response rules (all checked by `validateAnalyzeResponse`):

- `stress` has exactly 6 items with ids `drought`, `waterlogging`, `frost`, `heat`, `erosion`, `fertility`.
  `level` is `low`, `moderate` or `high`. `score` is 0..100. `confidence` is `low`, `medium` or `high`.
  Each item has `whyShort` (one sentence, Simple mode), `whyFull` (with numbers, Expert mode),
  `evidence[] {label, value, unit}` and `sources[]`.
- `recommendation.crops[].sharePct` sums to exactly 100 and every share is a multiple of 5.
  The same holds for `blocks` of every year in `rotationPlan`.
- `rotationPlan` covers the three years that follow the last history year.
- `tillage[]` items have `id`, `title`, `simple`, `expert`, `why`.
- `recommendation.strategies` has **at least 3** items: exactly one with `kind: "current"`, exactly one
  with `kind: "recommended"`, the rest `"alternative"`. See "Rotation strategies" below.
- `climate`, `soil` or `terrain` may be `null` **only** when its `dataStatus` is `failed`.
- If any `dataStatus` is not `live`, the frontend shows a warning and never invents numbers.

### Rotation strategies (added in 2.1.0)

The challenge asks to compare at least three rotation strategies, including the existing one, and
for each to explain why it was suggested, the evidence, the benefits, the information gaps and the
risks that need local review. `recommendation.strategies[]` carries exactly that:

| Field | Meaning |
| --- | --- |
| `id` | stable id: `current`, `balanced`, `soil_first`, `water_saving`, ... |
| `kind` | `current` (the farmer repeats the entered history), `recommended` (best score), `alternative` (a different trade-off) |
| `title`, `summary` | name and one plain sentence |
| `rotationPlan` | three years after the last history year, same shape as `recommendation.rotationPlan`; blocks may use `fallow` |
| `score` | 0..100, relative and comparable between strategies; never a yield or money |
| `why`, `evidence[]` | why it fits this very field, with numbers |
| `benefits[]` | what it may improve |
| `risks[]` | what the farmer or a local agronomist must review |
| `dataGaps[]` | where information is missing or coarse |
| `bareSoilMonths` | average months per year with nothing growing; `null` if it cannot be estimated |
| `confidence` | `low`, `medium` or `high` |

- The `recommended` strategy has the same plan as `recommendation.rotationPlan`, and
  `recommendation.crops` is its first year.
- For `current`, past years are projected forward in the same order. Shares inside a past year were
  not entered, so they are split equally (rounded to multiples of 5, sum 100) and this is said in `dataGaps`.
- If the history is entirely `unknown`, the `current` strategy is still returned, with an empty
  `rotationPlan`, `bareSoilMonths: null`, low confidence and the reason in `dataGaps`.

## Errors

Any error has this shape with a fitting HTTP status:

```json
{ "error": { "code": "NO_SOIL_DATA", "message": "No soil data for this location." } }
```

| Code | HTTP | When |
| --- | --- | --- |
| `INVALID_REQUEST` | 400 | body or query failed validation; `message` lists the problems |
| `NOT_FOUND` | 404 | unknown route |
| `NO_SOIL_DATA` | 422 | sea, ice, or outside SoilGrids coverage |
| `NO_CLIMATE_DATA` | 422 | the climate source has no data for the point |
| `RATE_LIMITED` | 429 | too many requests from one IP |
| `UPSTREAM_UNAVAILABLE` | 502 | every source failed and there is no cache |
| `INTERNAL` | 500 | unexpected error |

## Internal boundary: API to logic

Not part of the HTTP API, but `apps/api` and `packages/logic` must agree on it. Types `LogicInput`,
`LogicOutput`, `RawClimate` and `RawSoil` are in `shared/types.ts`.

```ts
import { recommend } from "@field-shift/logic";
const { climate, soil, stress, recommendation } = recommend(input); // LogicInput -> LogicOutput
```

- The API collects raw data: monthly temperature (mean, min, max), monthly precipitation **converted
  to mm per month**, radiation, spread between sample points, soil properties, the WRB group name and
  probability, elevation and slope. A source that failed is passed as `null`.
- The logic computes everything derived: Koppen class, PET, growing season, frost-free months, the
  WRB explanation, six stress items, crop shares, rotation plan, tillage advice, confidence.
- The API then adds `field`, `terrain`, `dataStatus` and `disclaimer` to build the `AnalyzeResponse`.

## Clarifications made by the team lead

These points were open in the planning document and are now fixed:

- `radiusKm` is 1..25 (not 0.5..25).
- `GET /api/crops` and `GET /api/field` return wrapped objects (`{ crops: [...] }`, `{ field: ... }`),
  so fields can be added later without breaking clients.
- Crop ids are lowercase English snake_case (`winter_wheat`, `corn`, `soybean`, ...).
- `climate`, `soil`, `terrain` are nullable for partial answers (see the rule above).
