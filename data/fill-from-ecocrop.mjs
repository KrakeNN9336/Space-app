// Fills data/crops.json climate and soil ranges from the FAO EcoCrop table (public copy).
// Usage: node data/fill-from-ecocrop.mjs <EcoCrop_DB.csv> data/crops.json [--write]
// Table: https://github.com/OpenCLIM/ecocrop (EcoCrop_DB.csv)
import { readFileSync, writeFileSync } from "node:fs";

const [csvPath, cropsPath, flag] = process.argv.slice(2);
const text = readFileSync(csvPath, "latin1");

function parse(csv) {
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
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const rows = parse(text);
const head = rows[0];
const col = (name) => head.indexOf(name);
const species = {
  winter_wheat: "Triticum aestivum", spring_wheat: "Triticum aestivum", barley: "Hordeum vulgare",
  corn: "Zea mays", soybean: "Glycine max", pea: "Pisum sativum", sunflower: "Helianthus annuus",
  rapeseed: "Brassica napus", potato: "Solanum tuberosum", clover: "Trifolium pratense",
  rice: "Oryza sativa", sorghum: "Sorghum bicolor", millet: "Panicum miliaceum",
  chickpea: "Cicer arietinum", lentil: "Lens culinaris", oats: "Avena sativa", rye: "Secale cereale",
  buckwheat: "Fagopyrum esculentum", sugar_beet: "Beta vulgaris", cotton: "Gossypium hirsutum",
  groundnut: "Arachis hypogaea", cassava: "Manihot esculenta", sweet_potato: "Ipomoea batatas",
  common_bean: "Phaseolus vulgaris", cover_rye: "Secale cereale",
};
const num = (v) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

const db = JSON.parse(readFileSync(cropsPath, "utf8"));
for (const crop of db.crops) {
  const want = species[crop.id];
  const matches = rows.filter((r) => r[col("ScientificName")]?.startsWith(want));
  const exact = matches.find((r) => r[col("ScientificName")] === want) ?? matches[0];
  if (!exact) { console.log(crop.id, "NOT FOUND", want); continue; }
  const g = (name) => num(exact[col(name)]);
  console.log(crop.id.padEnd(13), exact[col("ScientificName")].padEnd(34),
    "T", g("TMIN"), g("TOPMN"), g("TOPMX"), g("TMAX"), "R", g("RMIN"), g("ROPMN"), g("ROPMX"), g("RMAX"),
    "pH", g("PHMIN"), g("PHOPMN"), g("PHOPMX"), g("PHMAX"), "G", g("GMIN"), g("GMAX"), "kill", g("KTMP"),
    "| candidates:", matches.map((r) => r[col("ScientificName")]).join("; "));
  crop.tempRange = { min: g("TMIN"), optMin: g("TOPMN"), optMax: g("TOPMX"), max: g("TMAX") };
  crop.precipRange = { min: g("RMIN"), optMin: g("ROPMN"), optMax: g("ROPMX"), max: g("RMAX") };
  crop.phRange = { min: g("PHMIN"), optMin: g("PHOPMN"), optMax: g("PHOPMX"), max: g("PHMAX") };
  crop.seasonDays = { min: g("GMIN"), max: g("GMAX") };
  crop.source = `FAO EcoCrop: ${exact[col("ScientificName")]} (EcoPort code ${exact[col("EcoPortCode")]})`;
  crop.verificationStatus = "ecocrop";
}
if (flag === "--write") {
  db._note = "Climate, rainfall, pH and season ranges are from the FAO EcoCrop database (species level, not variety level). precipRange is annual rainfall, mm; tempRange is temperature during growth, C; seasonDays is the crop cycle length. Sensitivities, predecessors and econScore are not filled yet.";
  writeFileSync(cropsPath, JSON.stringify(db, null, 2) + "\n");
  console.log("written");
}
