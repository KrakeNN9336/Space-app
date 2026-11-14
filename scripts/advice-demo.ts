/**
 * Prints the crop advice for a point and a three-year history, using the running API.
 * Usage: npx tsx scripts/advice-demo.ts <lat> <lon> <crop2024> <crop2025> <crop2026> [lang] [baseUrl]
 */
import type { AnalyzeResponse } from "@field-shift/shared";

const [lat, lon, a, b, c, lang = "en", base = "http://127.0.0.1:8787"] = process.argv.slice(2);
const year = new Date().getFullYear();
const res = await fetch(`${base}/api/analyze`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    location: { lat: Number(lat), lon: Number(lon) },
    field: { source: "point", geometry: { type: "Point", coordinates: [Number(lon), Number(lat)] } },
    radiusKm: 5,
    history: [a, b, c].map((crops, i) => ({ year: year - 2 + i, crops: crops.split("+") })),
    lang,
  }),
});
const body = (await res.json()) as AnalyzeResponse;
if (!res.ok) {
  console.log(res.status, JSON.stringify(body));
  process.exit(1);
}
const rec = body.recommendation;
console.log(`Climate ${body.climate?.koppen?.code}, ${body.climate?.annualTempC} C, ${body.climate?.annualPrecipMm} mm; pH ${body.soil?.properties.phH2O.median}`);
console.log("SOW:");
for (const crop of rec.crops) console.log(`  ${crop.sharePct}% ${crop.name} [${crop.score}] ${crop.why}`);
console.log("AVOID:");
for (const crop of rec.avoid ?? []) console.log(`  ${crop.name} (${crop.reason}): ${crop.why}`);
console.log("STRATEGIES:");
for (const s of rec.strategies)
  console.log(`  ${s.kind} ${s.score}/100 bare ${s.bareSoilMonths}: ${s.rotationPlan.map((y) => y.blocks.map((x) => `${x.sharePct}% ${x.cropId}`).join(", ")).join(" | ")}`);
console.log("WARNINGS:", rec.warnings.join(" / "));
