# apps/web/src/map/

Owner: Oleksii (branch `map`).

Expected exports:

- `<FieldMap onFieldSelected={(field: Field) => void} radiusKm={number} layer={string} />`
- `<ClimateCharts data={climate} />`
- `layers.json`: the list of map layers (id, name en/uk, type, url, legend, needsDate, attribution, description).

`Field` and `Climate` come from `@field-shift/shared`. Do not invent layer names or URLs: take them from GetCapabilities.
