import type { Climate, Lang, LogicInput, LogicOutput, RawClimate, RawSoil, Soil } from "@field-shift/shared";
import koppenCatalog from "../../data/koppen.json";
import { classifyKoppen } from "./koppen";
import { estimateMonthlyPetMm } from "./pet";
import { getWrbGroup } from "./wrb";
import { advise } from "./advise";
import { computeStress } from "./stress";
import stressCopy from "../../data/stress-copy.json";

/** Mean monthly temperature at which most field crops grow (common agronomic base, °C). */
const GROWING_BASE_C = 5;

const round1 = (value: number): number => Math.round(value * 10) / 10;
const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

const UNASSESSED: Record<Lang, string> = {
  en: "{names} could not be assessed from the available data. Their score 0 means \"no estimate\", not \"no risk\".",
  uk: "{names} неможливо оцінити за наявними даними. Їхня оцінка 0 означає «немає оцінки», а не «немає ризику».",
};
const STRESS_NAMES: Record<Lang, Record<string, string>> = {
  en: { drought: "Drought", waterlogging: "Waterlogging", frost: "Frost", heat: "Heat", erosion: "Erosion", fertility: "Fertility" },
  uk: { drought: "Посуху", waterlogging: "Перезволоження", frost: "Заморозки", heat: "Спеку", erosion: "Ерозію", fertility: "Родючість" },
};

type KoppenEntry = { code: string; name: Record<Lang, string>; explain: Record<Lang, string> };

/** True for the "could not be assessed" items of computeStress (they share one short text). */
function isUnassessed(whyShort: string, lang: Lang): boolean {
  return whyShort === stressCopy[lang].unknownShort;
}

/** Derives the contract `Climate` block from raw monthly data. No network. */
export function buildClimate(raw: RawClimate, lat: number, lang: Lang): Climate {
  const { tempC, tempMinC, tempMaxC, precipMm } = raw.monthly;
  const code = classifyKoppen(tempC, precipMm, lat);
  const entry = code ? (koppenCatalog.classes as Record<string, KoppenEntry>)[code] : undefined;
  const pet = estimateMonthlyPetMm(lat, tempC, tempMinC, tempMaxC);
  return {
    koppen: code && entry ? { code, name: entry.name[lang], explain: entry.explain[lang] } : null,
    annualTempC: round1(sum(tempC) / 12),
    annualPrecipMm: Math.round(sum(precipMm)),
    growingSeasonMonths: tempC.filter((t) => t >= GROWING_BASE_C).length,
    frostFreeMonths: tempMinC.filter((t) => t > 0).length,
    monthly: {
      tempC: tempC.map(round1),
      tempMinC: tempMinC.map(round1),
      tempMaxC: tempMaxC.map(round1),
      precipMm: precipMm.map(round1),
      // TODO(contract): petMm must hold 12 numbers; 0 is a placeholder when the temperature
      // range is invalid (max <= min) and PET cannot be estimated. Not seen with POWER data.
      petMm: pet ? pet.map(round1) : new Array<number>(12).fill(0),
    },
    spread: raw.spread,
    samples: raw.samples,
    source: raw.source,
  } as Climate;
}

/** Attaches the WRB explanation to raw soil properties. No network. */
export function buildSoil(raw: RawSoil, lang: Lang): Soil {
  return { wrbGroup: getWrbGroup(raw.wrbGroup, lang), properties: raw.properties, source: raw.source };
}

/**
 * Climate and soil are computed from the collected data (Koppen, Hargreaves PET, WRB catalog).
 * Crop shares, strategies, crops to avoid and tillage come from advise.ts.
 * The six stress indicators come from stress.ts (computeStress). Indicators without a validated
 * threshold in data/thresholds.json (heat, erosion) are returned as "not assessed": score 0 with
 * low confidence, and the response names them in `recommendation.warnings`.
 * The signature is the internal contract from shared/types.ts — do not change it.
 */
export function recommend(input: LogicInput): LogicOutput {
  const climate = input.climate ? buildClimate(input.climate, input.location.lat, input.lang) : null;
  const soil = input.soil ? buildSoil(input.soil, input.lang) : null;
  const recommendation = advise(input, climate, soil);
  const stress = computeStress(climate, soil, input.terrain, input.lang);
  // computeStress marks an indicator it could not assess with score 0 and low confidence.
  const unassessed = stress.filter((item) => item.score === 0 && item.confidence === "low" && item.level === "low" && isUnassessed(item.whyShort, input.lang));
  const warnings = [...recommendation.warnings];
  if (unassessed.length > 0) {
    warnings.push(UNASSESSED[input.lang].replace("{names}", unassessed.map((item) => STRESS_NAMES[input.lang][item.id]).join(", ")));
  }
  return { climate, soil, stress, recommendation: { ...recommendation, warnings } };
}
