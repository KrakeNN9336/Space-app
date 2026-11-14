import type { Climate, Lang, LogicInput, LogicOutput, RawClimate, RawSoil, Soil } from "@field-shift/shared";
import mock from "@field-shift/shared/mock-analyze.json";
import koppenCatalog from "../../data/koppen.json";
import { classifyKoppen } from "./koppen";
import { estimateMonthlyPetMm } from "./pet";
import { getWrbGroup } from "./wrb";
import { advise } from "./advise";

/** Mean monthly temperature at which most field crops grow (common agronomic base, °C). */
const GROWING_BASE_C = 5;

const round1 = (value: number): number => Math.round(value * 10) / 10;
const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

const NOT_READY: Record<Lang, string> = {
  en: "The six stress indicators are illustrative sample values: their scoring rules are not connected yet. Crop advice, climate and soil are computed for this location.",
  uk: "Шість показників стресу є ілюстративним прикладом: правила їх оцінювання ще не підключені. Поради щодо культур, клімат і ґрунт розраховано для цієї точки.",
};

type KoppenEntry = { code: string; name: Record<Lang, string>; explain: Record<Lang, string> };

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
 * TODO(Serhii): the six stress indicators are still the illustrative mock; the response says so
 * in `recommendation.warnings`.
 * The signature is the internal contract from shared/types.ts — do not change it.
 */
export function recommend(input: LogicInput): LogicOutput {
  const sample = mock as unknown as LogicOutput;
  const climate = input.climate ? buildClimate(input.climate, input.location.lat, input.lang) : null;
  const soil = input.soil ? buildSoil(input.soil, input.lang) : null;
  const recommendation = advise(input, climate, soil);
  return {
    climate,
    soil,
    stress: sample.stress,
    recommendation: { ...recommendation, warnings: [...recommendation.warnings, NOT_READY[input.lang]] },
  };
}
