# Field Shift

**Adapting farms with NASA data.** A web app (PWA) for any place on Earth: pick a field on the map,
set a search radius, enter three years of crop history, and get a plain-language plan: which crops
to grow and in what share of the area, a 3-year rotation, and soil tillage advice. Every piece of
advice comes with the numbers behind it and an honest confidence level.

Built for the NASA Space Apps Challenge 2026, challenge "Field Shift: Adapting Farms with NASA Data".

> This tool supports decisions and does not replace a local agronomist. Climate values are long-term
> averages, not a forecast. Field boundaries are approximate, not legal.

## Quick start

You need [Node.js](https://nodejs.org) 22 or newer (20.19+ also works) and Git.

```bash
git clone https://github.com/KrakeNN9336/Space-app.git
cd Space-app
npm install
npm run dev
```

Then open <http://localhost:5173>. One command starts both parts:

| Part | Address | What |
| --- | --- | --- |
| Web (Vite + React) | <http://localhost:5173> | the app; `/api/*` is proxied to the Worker |
| API (Cloudflare Worker, Hono) | <http://127.0.0.1:8787> | `wrangler dev`, no Cloudflare account needed |

Check that it works:

```bash
curl http://127.0.0.1:8787/api/health
```

**Windows:** clone into a short path such as `C:\dev\field-shift`. With a very long path the local
Worker runtime cannot open its state files (`SQLITE_CANTOPEN`).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | web + API locally |
| `npm test` | unit tests (vitest), including the contract check of the mock |
| `npm run typecheck` | TypeScript check of every package |
| `npm run test:contract` | calls the **running** API on 7 points around the world and validates each answer against the contract |
| `npm run build` | production build of the web app into `apps/web/dist` |
| `npm run check` | typecheck + tests + build (run before every push) |
| `npm run deploy` | build and deploy to Cloudflare |

## Repository layout

```
apps/web/         frontend: Vite + React + TypeScript            (Vlad, branch ui)
apps/web/src/map/ map, layers, field boundaries                  (Oleksii, branch map)
apps/web/public/  PWA manifest, icons, service worker            (Oleksii, branch map)
apps/api/         Cloudflare Worker on Hono, data collection     (Yehor, branch backend)
packages/logic/   pure agronomy rules, no network                (Serhii, branch data)
data/             crops, Koppen, WRB soils, thresholds as JSON   (Serhii, branch data)
shared/           API contract: types.ts, validate.ts, mocks     (Nazar, main)
docs/             contract, team rules, integration checklist    (Nazar, main)
wrangler.jsonc    Cloudflare configuration                       (Nazar, main)
```

The API contract lives in [shared/types.ts](shared/types.ts) and is explained in
[docs/api-contract.md](docs/api-contract.md). An example answer is in
[shared/mock-analyze.json](shared/mock-analyze.json). Team rules: [docs/TEAM.md](docs/TEAM.md).

Import the contract from any package:

```ts
import type { AnalyzeRequest, AnalyzeResponse, Field } from "@field-shift/shared";
import { validateAnalyzeResponse } from "@field-shift/shared";
import mock from "@field-shift/shared/mock-analyze.json";
```

## Data sources

All sources are global and need no API keys.

| Source | Used for |
| --- | --- |
| [NASA POWER](https://power.larc.nasa.gov/) | monthly climatology: temperature, precipitation, radiation |
| [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/) | map layers: true colour, soil moisture, floods, precipitation, NDVI |
| [ISRIC SoilGrids](https://www.isric.org/explore/soilgrids) | soil properties and WRB soil group |
| [Fields of the World](https://fieldsofthe.world/) | field boundaries |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) (Overpass) | fallback field boundaries, base map |

The Koppen-Geiger climate class is computed in code from monthly temperature and precipitation.

## Deploy to Cloudflare

One-time setup:

```bash
npx wrangler login
npx wrangler kv namespace create CACHE
```

Copy the printed `id` into `wrangler.jsonc` (replace `REPLACE_WITH_KV_NAMESPACE_ID`), commit, then:

```bash
npm run deploy
```

Wrangler prints the public address (`https://field-shift.<account>.workers.dev`). Verify the deployed API:

```bash
npm run test:contract -- https://field-shift.<account>.workers.dev
```

Secrets never go into the repository: use `.dev.vars` locally (git-ignored) and
`npx wrangler secret put NAME` for production.

## Use of AI

AI assistants were used to help write code and documentation. All data in the app comes from the
sources listed above; the recommendation logic is rule-based and explainable, not a black-box model.
