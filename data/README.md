# data/

Owner: Serhii (branch `data`). JSON only, no database.

| File | What | Status |
| --- | --- | --- |
| `crops.json` | Crop table (ids, names en/uk, group, icon + agronomic ranges) | seed with 10 crops, to be replaced |
| `koppen.json` | Plain-language explanation of every Koppen-Geiger class (en/uk) | TODO |
| `soil-wrb.json` | WRB reference soil groups explained for farmer and agronomist (en/uk) | TODO |
| `thresholds.json` | Stress level thresholds, editable without code changes | TODO |
| `demo-cache/` | Saved real responses for 5-6 demo points (owner: Yehor) | TODO |

`crops.json` must stay an object with a `crops` array, and every crop must keep `id`, `name.en`,
`name.uk`, `group` and `icon`: `GET /api/crops` reads exactly these fields. Add any other fields freely.

Every number needs a source. If a value is not verified, mark the row with `"verify": true`.
