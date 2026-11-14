/**
 * Contract test against a RUNNING API.
 *
 *   npm run test:contract                                  -> http://127.0.0.1:8787
 *   npm run test:contract -- https://<worker>.workers.dev  -> deployed Worker
 *
 * For each test point it calls POST /api/analyze and validates the answer with shared/validate.ts.
 * Exit code 1 if any point fails.
 */
import type { AnalyzeRequest } from "../shared/types";
import { validateAnalyzeResponse } from "../shared/validate";

const base = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");

const points = [
  { name: "Poland", lat: 52.2, lon: 20.9 },
  { name: "Ukraine", lat: 49.84, lon: 24.03 },
  { name: "Brazil", lat: -12.5, lon: -55.7 },
  { name: "Kenya", lat: -0.3, lon: 36.1 },
  { name: "India", lat: 26.8, lon: 80.9 },
  { name: "USA", lat: 41.6, lon: -93.6 },
  { name: "Australia", lat: -33.9, lon: 147.2 },
];

const lastYear = new Date().getFullYear();

function buildRequest(lat: number, lon: number): AnalyzeRequest {
  return {
    location: { lat, lon },
    field: { source: "point", geometry: { type: "Point", coordinates: [lon, lat] } },
    radiusKm: 5,
    history: [
      { year: lastYear - 2, crops: ["winter_wheat"] },
      { year: lastYear - 1, crops: ["corn", "soybean"] },
      { year: lastYear, crops: ["unknown"] },
    ],
    priorities: { water: 3, income: 3, soil: 3, erosion: 3 },
    lang: "en",
  };
}

async function main(): Promise<number> {
  const health = await fetch(`${base}/api/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`API is not reachable at ${base}. Start it with "npm run dev".`);
    return 1;
  }

  let failed = 0;
  for (const p of points) {
    const started = Date.now();
    try {
      const res = await fetch(`${base}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequest(p.lat, p.lon)),
      });
      const body: any = await res.json();
      const ms = Date.now() - started;

      if (!res.ok) {
        failed++;
        const code = body?.error?.code ?? "(no error code: not a contract error body!)";
        console.log(`FAIL ${p.name}: HTTP ${res.status} ${code} ${body?.error?.message ?? ""} [${ms} ms]`);
        continue;
      }

      const problems = validateAnalyzeResponse(body);
      if (problems.length > 0) {
        failed++;
        console.log(`FAIL ${p.name} [${ms} ms]`);
        for (const line of problems) console.log(`     - ${line}`);
      } else {
        const s = body.dataStatus;
        console.log(
          `ok   ${p.name}: Koppen ${body.climate?.koppen?.code ?? "n/a"}, soil ${body.soil?.wrbGroup?.name ?? "n/a"}, ` +
            `status ${s.climate}/${s.soil}/${s.terrain} [${ms} ms]`,
        );
      }
    } catch (err) {
      failed++;
      console.log(`FAIL ${p.name}: ${(err as Error).message}`);
    }
  }

  console.log(failed === 0 ? "\nAll points match contract v2." : `\n${failed} point(s) failed.`);
  return failed === 0 ? 0 : 1;
}

main().then((code) => process.exit(code));
