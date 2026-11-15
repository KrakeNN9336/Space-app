// Independent check of data/crops.json against the FAO EcoCrop table.
// It re-reads the table with its own parser and compares every temperature, rainfall, pH and
// cycle-length value, so it does not depend on the import scripts.
//
// Usage: node data/verify-ecocrop.mjs <EcoCrop_DB.csv> [--write]
// Table: https://github.com/OpenCLIM/ecocrop (EcoCrop_DB.csv)
// With --write, crops that match the table exactly get verificationStatus "source_matched" and a
// `verification` note; data/ecocrop-audit.json is updated to match. Exit code 1 on any mismatch.
import { readFileSync, writeFileSync } from "node:fs";

const [csvPath, flag] = process.argv.slice(2);
if (!csvPath) throw new Error("Usage: node data/verify-ecocrop.mjs <EcoCrop_DB.csv> [--write]");
const cropsUrl = new URL("./crops.json", import.meta.url);
const auditUrl = new URL("./ecocrop-audit.json", import.meta.url);

const csv = readFileSync(csvPath, "latin1");
const rows = [];
let row = [], cell = "", quoted = false;
for (let i = 0; i < csv.length; i++) {
  const ch = csv[i];
  if (quoted) {
    if (ch === '"' && csv[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = false;
    else cell += ch;
  } else if (ch === '"') quoted = true;
  else if (ch === ",") { row.push(cell); cell = ""; }
  else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
  else cell += ch;
}
const head = rows[0];
const col = (name) => head.indexOf(name);
const num = (v) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

const RANGES = [
  ["tempRange", ["TMIN", "TOPMN", "TOPMX", "TMAX"]],
  ["precipRange", ["RMIN", "ROPMN", "ROPMX", "RMAX"]],
  ["phRange", ["PHMIN", "PHOPMN", "PHOPMX", "PHMAX"]],
];
const SCOPE = "Values equal the FAO EcoCrop record for the species. Species level only: not validated for a cultivar, a winter or spring form, or a region.";
const today = new Date().toISOString().slice(0, 10);

const db = JSON.parse(readFileSync(cropsUrl, "utf8"));
const audit = [];
let mismatches = 0;
for (const crop of db.crops) {
  const species = /species=([^;]+)/.exec(crop.source ?? "")?.[1]?.trim();
  const code = /EcoPort=(\d+)/.exec(crop.source ?? "")?.[1];
  const rec = rows.find((r) => r[col("EcoPortCode")] === code);
  const problems = [];
  if (!rec) problems.push(`no EcoCrop record for code ${code}`);
  else {
    if (rec[col("ScientificName")] !== species) problems.push(`species "${species}" but the record is "${rec[col("ScientificName")]}"`);
    for (const [key, cols] of RANGES) {
      const want = cols.map((c) => num(rec[col(c)]));
      const have = [crop[key].min, crop[key].optMin, crop[key].optMax, crop[key].max];
      if (want.join() !== have.join()) problems.push(`${key}: json ${have} vs table ${want}`);
      if (have.some((v) => v === null) || !(have[0] <= have[1] && have[1] <= have[2] && have[2] <= have[3])) problems.push(`${key}: not ordered ${have}`);
    }
    const cycle = [num(rec[col("GMIN")]), num(rec[col("GMAX")])];
    if (cycle.join() !== [crop.seasonDays?.min, crop.seasonDays?.max].join()) problems.push(`seasonDays: json ${JSON.stringify(crop.seasonDays)} vs table ${cycle}`);
    if (JSON.stringify(crop.seasonDays) !== JSON.stringify(crop.seasonDaysRange)) problems.push("seasonDays and seasonDaysRange differ");
  }
  const ok = problems.length === 0;
  if (!ok) mismatches++;
  console.log(`${ok ? "ok  " : "DIFF"} ${crop.id.padEnd(13)} ${species ?? "?"} ${problems.join(" | ")}`);
  if (ok) {
    crop.verificationStatus = "source_matched";
    crop.verification = { method: "all range and cycle values compared with the EcoCrop table by data/verify-ecocrop.mjs", date: crop.verification?.date ?? today, scope: SCOPE, ...(crop.verification?.note ? { note: crop.verification.note } : {}) };
  } else {
    crop.verificationStatus = "verify";
    delete crop.verification;
  }
  audit.push({ id: crop.id, species: species ?? null, ecoPortCode: code ? Number(code) : null, status: ok ? "matched_to_source" : "mismatch", temperature: ok, rainfall: ok, ph: ok, problems });
}
console.log(`${db.crops.length - mismatches} of ${db.crops.length} crops match the EcoCrop table`);
if (flag === "--write") {
  writeFileSync(cropsUrl, JSON.stringify(db, null, 2) + "\n");
  writeFileSync(auditUrl, JSON.stringify(audit, null, 2) + "\n");
  console.log("written");
}
process.exit(mismatches ? 1 : 0);
