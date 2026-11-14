/**
 * Crop advice from climate, soil and the three-year field history. Pure functions, no network.
 *
 * Suitability follows the FAO EcoCrop approach: a trapezoid between the absolute and optimal limits
 * for temperature, annual rainfall and soil pH; the weakest factor decides (limits are in
 * data/crops.json, taken from the EcoCrop database).
 * Rotation rules are general agronomy: do not repeat a crop, do not follow a crop with one of the
 * same botanical family, bring a legume in when there was none. The multipliers below are
 * heuristic weights of this tool, not measured values, and the response says so in `assumptions`.
 */
import type {
  Climate,
  Confidence,
  CropAvoid,
  CropShare,
  Evidence,
  HistoryYear,
  Lang,
  LogicInput,
  Recommendation,
  RotationStrategy,
  RotationYear,
  Soil,
  TillageAdvice,
} from "@field-shift/shared";
import cropsFile from "../../data/crops.json";

type Range = { min: number | null; optMin: number | null; optMax: number | null; max: number | null };
interface CropRecord {
  id: string;
  name: Record<Lang, string>;
  group: string;
  family: string;
  tempRange: Range;
  precipRange: Range;
  phRange: Range;
  seasonDays: { min: number | null; max: number | null } | null;
}

const CROPS = cropsFile.crops as unknown as CropRecord[];
const BY_ID = new Map(CROPS.map((crop) => [crop.id, crop]));

/** Heuristic rotation weights (see the file comment). */
const W = { sameCropLastYear: 0.5, sameFamilyLastYear: 0.75, familyTwiceInThree: 0.85, legumeBonus: 1.15 };
const RECOMMEND_MIN_SCORE = 40;
const UNSUITABLE_BELOW = 25;
const LEGUME_FAMILY = "Fabaceae";

const tx = (lang: Lang, en: string, uk: string): string => (lang === "uk" ? uk : en);
const r1 = (value: number): number => Math.round(value * 10) / 10;

/** 0 outside [min, max], 1 inside [optMin, optMax], linear in between. Null when limits are missing. */
export function trapezoid(x: number | null, range: Range): number | null {
  const { min, optMin, optMax, max } = range;
  if (x === null || min === null || optMin === null || optMax === null || max === null) return null;
  if (x <= min || x >= max) return 0;
  if (x < optMin) return (x - min) / (optMin - min);
  if (x > optMax) return (max - x) / (max - optMax);
  return 1;
}

interface Fit {
  score: number | null;
  temp: number | null;
  rain: number | null;
  ph: number | null;
  /** Mean temperature of the best growing window, °C. */
  windowTempC: number | null;
  windowMonths: number;
  limiting: "temp" | "rain" | "ph" | null;
}

/** Best contiguous window of the crop's shortest cycle: every month above the absolute minimum. */
function temperatureFit(crop: CropRecord, monthlyTempC: readonly number[]): { fit: number | null; meanC: number | null; months: number } {
  const months = Math.min(12, Math.max(1, Math.ceil((crop.seasonDays?.min ?? 90) / 30)));
  if (crop.tempRange.min === null) return { fit: null, meanC: null, months };
  let best = -1;
  let bestMean: number | null = null;
  for (let start = 0; start < 12; start++) {
    const window = Array.from({ length: months }, (_, i) => monthlyTempC[(start + i) % 12]);
    const mean = window.reduce((a, b) => a + b, 0) / months;
    const alive = window.every((t) => t > (crop.tempRange.min as number));
    const fit = alive ? (trapezoid(mean, crop.tempRange) ?? 0) : 0;
    if (fit > best || (fit === best && bestMean !== null && mean > bestMean)) {
      best = fit;
      bestMean = mean;
    }
  }
  return { fit: Math.max(0, best), meanC: bestMean, months };
}

export function cropFit(crop: CropRecord, climate: Climate | null, soil: Soil | null): Fit {
  const t = climate ? temperatureFit(crop, climate.monthly.tempC) : { fit: null, meanC: null, months: 0 };
  const rain = climate ? trapezoid(climate.annualPrecipMm, crop.precipRange) : null;
  const ph = soil ? trapezoid(soil.properties.phH2O.median, crop.phRange) : null;
  const parts = ([["temp", t.fit], ["rain", rain], ["ph", ph]] as const).filter((p): p is readonly ["temp" | "rain" | "ph", number] => p[1] !== null);
  if (parts.length === 0) return { score: null, temp: null, rain: null, ph: null, windowTempC: null, windowMonths: t.months, limiting: null };
  const weakest = parts.reduce((a, b) => (b[1] < a[1] ? b : a));
  return {
    score: Math.round(weakest[1] * 100),
    temp: t.fit,
    rain,
    ph,
    windowTempC: t.meanC,
    windowMonths: t.months,
    limiting: weakest[1] < 1 ? weakest[0] : null,
  };
}

const realCrops = (year: string[]): CropRecord[] => year.flatMap((id) => BY_ID.get(id) ?? []);

interface Rotation {
  factor: number;
  notes: string[];
  /** A reason not to sow this crop next year, when there is one. */
  avoid: string | null;
}

/** `past` is oldest first; each item is the list of crop ids grown that year. */
function rotationEffect(crop: CropRecord, past: string[][], lang: Lang): Rotation {
  const last = realCrops(past[past.length - 1] ?? []);
  const all = past.map(realCrops);
  let factor = 1;
  const notes: string[] = [];
  let avoid: string | null = null;
  const name = crop.name[lang];
  if (last.some((c) => c.id === crop.id)) {
    factor *= W.sameCropLastYear;
    avoid = tx(lang, `${name}: it grew here last year. Sown again, its diseases, pests and weeds stay in the soil and get stronger. Give the field a break from it.`,
      `${name}: торік ця культура вже росла на цьому полі. Якщо посіяти її знову, її хвороби, шкідники й бур'яни залишаться в ґрунті та посиляться. Дайте полю від неї перепочити.`);
    notes.push(tx(lang, "It already grew here last year, so the score is lower.", "Торік ця культура вже росла тут, тому оцінка нижча."));
  } else if (last.some((c) => c.family === crop.family)) {
    const prev = last.find((c) => c.family === crop.family) as CropRecord;
    factor *= W.sameFamilyLastYear;
    avoid = tx(lang, `${name}: it is a close relative of last year's crop (${prev.name.en.toLowerCase()}). Relatives share the same diseases and pests, so it is better to wait a year.`,
      `${name}: це близький родич торішньої культури (${prev.name.uk.toLowerCase()}). У родичів спільні хвороби та шкідники, тому краще зачекати рік.`);
    notes.push(tx(lang, `It is a relative of last year's crop (${prev.name.en.toLowerCase()}), so the score is lower.`, `Це родич торішньої культури (${prev.name.uk.toLowerCase()}), тому оцінка нижча.`));
  }
  const familyYears = all.filter((year) => year.some((c) => c.family === crop.family)).length;
  if (familyYears >= 2) {
    factor *= W.familyTwiceInThree;
    notes.push(tx(lang, `Related crops grew here in ${familyYears} of the last 3 years, which is a lot for one field.`, `Споріднені культури росли тут у ${familyYears} з 3 останніх років, а це забагато для одного поля.`));
  }
  const known = all.some((year) => year.length > 0);
  if (known && crop.family === LEGUME_FAMILY && !all.some((year) => year.some((c) => c.family === LEGUME_FAMILY))) {
    factor *= W.legumeBonus;
    notes.push(tx(lang, "No beans or peas grew here for 3 years. Such crops feed the soil with nitrogen, so the next crop needs less fertiliser.", "Бобових тут не було 3 роки. Такі культури самі збагачують ґрунт азотом, тож наступній культурі треба менше добрив."));
  } else if (known && familyYears === 0) {
    notes.push(tx(lang, "Nothing related grew here for 3 years, so its diseases and pests have not built up in the soil.", "Нічого спорідненого тут не росло 3 роки, тому її хвороби та шкідники в ґрунті не накопичились."));
  }
  return { factor, notes, avoid };
}

interface Scored {
  crop: CropRecord;
  fit: Fit;
  rotation: Rotation;
  score: number;
}

function scoreAll(climate: Climate | null, soil: Soil | null, past: string[][], lang: Lang): Scored[] {
  return CROPS.map((crop) => {
    const fit = cropFit(crop, climate, soil);
    const rotation = rotationEffect(crop, past, lang);
    // Without climate and soil only rotation can be judged; 50 is a neutral base, not a measurement.
    const score = Math.max(0, Math.min(100, Math.round((fit.score ?? 50) * rotation.factor)));
    return { crop, fit, rotation, score };
  }).sort((a, b) => b.score - a.score || a.crop.id.localeCompare(b.crop.id));
}

const range = (r: Range, unit: string): string => `${r.optMin}–${r.optMax}${unit ? ` ${unit}` : ""}`;

/** "low" when the value is below the crop's optimum, "high" when above, "ok" inside it. */
function side(x: number | null | undefined, r: Range): "low" | "ok" | "high" {
  if (typeof x !== "number" || r.optMin === null || r.optMax === null) return "ok";
  return x < r.optMin ? "low" : x > r.optMax ? "high" : "ok";
}

/** Plain-language reason for a recommended crop: a verdict, then heat, rain, soil and rotation. */
function explain(s: Scored, climate: Climate | null, soil: Soil | null, lang: Lang): string {
  if (s.fit.score === null) {
    return [tx(lang, "There is no climate or soil data for this place, so only the crop order was checked.", "Для цього місця немає даних про клімат і ґрунт, тому перевірено лише черговість культур."), ...s.rotation.notes].join(" ");
  }
  const out: string[] = [
    s.score >= 80 ? tx(lang, "A good choice for this field.", "Добрий вибір для цього поля.")
      : s.score >= 60 ? tx(lang, "Suitable, though not perfect.", "Підходить, хоч і не ідеально.")
        : tx(lang, "Possible, but conditions are far from the best.", "Можливо, але умови далекі від найкращих."),
  ];
  if (climate && s.fit.windowTempC !== null) {
    const t = r1(s.fit.windowTempC);
    const best = range(s.crop.tempRange, "°C");
    const heat = side(s.fit.windowTempC, s.crop.tempRange);
    out.push(tx(lang,
      `${heat === "ok" ? "Enough warmth" : heat === "low" ? "A little short of warmth" : "A little too hot"}: the warmest ${s.fit.windowMonths} months average ${t} °C, and it grows best at ${best}.`,
      `${heat === "ok" ? "Тепла вистачає" : heat === "low" ? "Тепла трохи бракує" : "Трохи спекотно"}: найтепліші ${s.fit.windowMonths} міс. мають у середньому ${t} °C, а найкраще вона росте при ${best}.`));
    const rain = side(climate.annualPrecipMm, s.crop.precipRange);
    out.push(tx(lang,
      `${rain === "ok" ? "Enough rain" : rain === "low" ? "Rain is a little short" : "A little too much rain"}: ${climate.annualPrecipMm} mm a year, best is ${range(s.crop.precipRange, "mm")}.`,
      `${rain === "ok" ? "Дощів достатньо" : rain === "low" ? "Дощів трохи замало" : "Дощів трохи забагато"}: ${climate.annualPrecipMm} мм на рік, найкраще ${range(s.crop.precipRange, "мм")}.`));
  }
  const ph = soil?.properties.phH2O.median;
  if (typeof ph === "number") {
    const acid = side(ph, s.crop.phRange);
    out.push(tx(lang,
      `${acid === "ok" ? "Soil acidity suits it" : acid === "low" ? "The soil is a little too acid" : "The soil is a little too alkaline"}: pH ${r1(ph)}, best is ${range(s.crop.phRange, "")}.`,
      `${acid === "ok" ? "Кислотність ґрунту підходить" : acid === "low" ? "Ґрунт трохи закислий" : "Ґрунт трохи залужний"}: pH ${r1(ph)}, найкраще ${range(s.crop.phRange, "")}.`));
  }
  return [...out, ...s.rotation.notes].join(" ");
}

/** Plain-language reason why the site does not suit a crop: the one factor that fails most. */
function limitingText(s: Scored, climate: Climate | null, soil: Soil | null, lang: Lang): string {
  const name = s.crop.name[lang];
  if (s.fit.limiting === "rain" && climate) {
    const low = side(climate.annualPrecipMm, s.crop.precipRange) === "low";
    return low
      ? tx(lang, `${name}: too little rain here. The field gets ${climate.annualPrecipMm} mm a year, and it needs at least ${s.crop.precipRange.min} mm (best ${range(s.crop.precipRange, "mm")}). Without irrigation it will not do well.`,
        `${name}: тут замало дощів. Поле отримує ${climate.annualPrecipMm} мм на рік, а їй треба щонайменше ${s.crop.precipRange.min} мм (найкраще ${range(s.crop.precipRange, "мм")}). Без поливу врожаю не буде.`)
      : tx(lang, `${name}: too much rain here. The field gets ${climate.annualPrecipMm} mm a year, and it tolerates at most ${s.crop.precipRange.max} mm (best ${range(s.crop.precipRange, "mm")}).`,
        `${name}: тут забагато дощів. Поле отримує ${climate.annualPrecipMm} мм на рік, а вона витримує щонайбільше ${s.crop.precipRange.max} мм (найкраще ${range(s.crop.precipRange, "мм")}).`);
  }
  if (s.fit.limiting === "ph" && soil) {
    const ph = r1(soil.properties.phH2O.median as number);
    const acid = side(ph, s.crop.phRange) === "low";
    return tx(lang,
      `${name}: the soil is too ${acid ? "acid" : "alkaline"} for it. Soil pH here is ${ph}, and it grows best at ${range(s.crop.phRange, "")}.`,
      `${name}: ґрунт для неї ${acid ? "закислий" : "залужний"}. pH ґрунту тут ${ph}, а найкраще вона росте при ${range(s.crop.phRange, "")}.`);
  }
  const t = s.fit.windowTempC === null ? null : r1(s.fit.windowTempC);
  const cold = side(s.fit.windowTempC, s.crop.tempRange) !== "high";
  return cold
    ? tx(lang, `${name}: not enough warmth here. It needs ${s.fit.windowMonths} warm months in a row at about ${range(s.crop.tempRange, "°C")}, and the warmest ${s.fit.windowMonths} months here average only ${t ?? "?"} °C.`,
      `${name}: тут замало тепла. Їй потрібно ${s.fit.windowMonths} теплих місяців поспіль із температурою близько ${range(s.crop.tempRange, "°C")}, а найтепліші ${s.fit.windowMonths} міс. тут мають у середньому лише ${t ?? "?"} °C.`)
    : tx(lang, `${name}: too hot here. It grows best at ${range(s.crop.tempRange, "°C")}, and even the best ${s.fit.windowMonths} months here average ${t ?? "?"} °C.`,
      `${name}: тут надто спекотно. Найкраще вона росте при ${range(s.crop.tempRange, "°C")}, а навіть найкращі ${s.fit.windowMonths} міс. тут мають у середньому ${t ?? "?"} °C.`);
}

/** Up to `count` best crops of different families. */
function pickDistinct(scored: Scored[], count: number, minScore: number, must: ((s: Scored) => boolean)[] = []): Scored[] {
  const picked: Scored[] = [];
  const add = (s: Scored | undefined) => {
    if (s && !picked.includes(s) && !picked.some((p) => p.crop.family === s.crop.family && p.crop.group === s.crop.group)) picked.push(s);
  };
  for (const rule of must) add(scored.find((s) => rule(s) && s.score >= minScore));
  for (const s of scored) {
    if (picked.length >= count) break;
    if (s.score >= minScore && !picked.some((p) => p.crop.family === s.crop.family)) add(s);
  }
  if (picked.length === 0 && scored.length > 0) picked.push(scored[0]);
  return picked.slice(0, count).sort((a, b) => b.score - a.score);
}

const SHARES: Record<number, number[]> = { 1: [100], 2: [60, 40], 3: [40, 35, 25] };

/** Equal shares as multiples of 5 that sum to 100 (the remainder goes to the first items). */
export function equalShares(n: number): number[] {
  const base = Math.floor(100 / n / 5) * 5;
  const shares = new Array<number>(n).fill(base);
  for (let i = 0, left = 100 - base * n; left > 0; i = (i + 1) % n, left -= 5) shares[i] += 5;
  return shares;
}

interface PlanYear {
  year: number;
  picks: Scored[];
  shares: number[];
}

function planYears(input: LogicInput, climate: Climate | null, soil: Soil | null, must: ((s: Scored) => boolean)[]): PlanYear[] {
  const past = input.history.map((h) => [...h.crops]);
  const lastYear = input.history[input.history.length - 1].year;
  const years: PlanYear[] = [];
  for (let i = 1; i <= 3; i++) {
    const scored = scoreAll(climate, soil, past, input.lang);
    const picks = pickDistinct(scored, 3, RECOMMEND_MIN_SCORE, must);
    years.push({ year: lastYear + i, picks, shares: SHARES[picks.length] });
    past.push(picks.map((p) => p.crop.id));
  }
  return years;
}

const toRotation = (years: PlanYear[]): RotationYear[] =>
  years.map((y) => ({ year: y.year, blocks: y.picks.map((p, i) => ({ cropId: p.crop.id, sharePct: y.shares[i] })) }));

const meanScore = (years: PlanYear[]): number =>
  Math.round(years.reduce((sum, y) => sum + y.picks.reduce((s, p, i) => s + p.score * y.shares[i], 0) / 100, 0) / years.length);

/** Months per year with nothing growing, from the EcoCrop cycle length (midpoint), share-weighted. */
function bareMonths(plan: RotationYear[]): number | null {
  if (plan.length === 0) return null;
  let total = 0;
  for (const year of plan) {
    for (const block of year.blocks) {
      const crop = BY_ID.get(block.cropId);
      const days = crop?.seasonDays?.min != null && crop.seasonDays.max != null ? (crop.seasonDays.min + crop.seasonDays.max) / 2 : null;
      if (block.cropId !== "fallow" && days === null) return null;
      total += (block.sharePct / 100) * (block.cropId === "fallow" ? 12 : 12 - Math.min(12, (days as number) / 30));
    }
  }
  return r1(total / plan.length);
}

function currentStrategy(input: LogicInput, climate: Climate | null, soil: Soil | null, confidence: Confidence): RotationStrategy {
  const { lang, history } = input;
  const lastYear = history[history.length - 1].year;
  const usable = history.every((h) => h.crops.every((id) => id === "fallow" || BY_ID.has(id)));
  const title = tx(lang, "Keep the current rotation", "Залишити поточну сівозміну");
  if (!usable) {
    return {
      id: "current", kind: "current", title,
      summary: tx(lang, "The crops of the last three years are not fully known, so this option cannot be scored.", "Культури за останні три роки відомі не повністю, тому цей варіант неможливо оцінити."),
      rotationPlan: [], score: 0,
      why: tx(lang, "Without the field history there is nothing to project forward.", "Без історії поля немає що продовжувати."),
      evidence: [], benefits: [], risks: [],
      dataGaps: [tx(lang, "Enter the crops of the last three years to compare this option.", "Вкажіть культури за останні три роки, щоб порівняти цей варіант.")],
      bareSoilMonths: null, confidence: "low",
    };
  }
  const past = history.map((h) => [...h.crops]);
  const plan: RotationYear[] = [];
  const yearScores: number[] = [];
  const repeats = new Set<string>();
  history.forEach((h, i) => {
    const scored = scoreAll(climate, soil, past, lang);
    const shares = equalShares(h.crops.length);
    plan.push({ year: lastYear + i + 1, blocks: h.crops.map((id, k) => ({ cropId: id, sharePct: shares[k] })) });
    const grown = h.crops.flatMap((id) => scored.find((s) => s.crop.id === id) ?? []);
    grown.filter((s) => s.rotation.factor < 1).forEach((s) => s.rotation.notes.forEach((n) => repeats.add(`${s.crop.name[lang]}: ${n}`)));
    // A fallow block scores 0: nothing is grown on that share of the field.
    yearScores.push(h.crops.reduce((sum, id, k) => sum + (scored.find((s) => s.crop.id === id)?.score ?? 0) * shares[k], 0) / 100);
    past.push([...h.crops]);
  });
  const names = history.map((h) => h.crops.map((id) => (id === "fallow" ? tx(lang, "fallow", "пар") : (BY_ID.get(id) as CropRecord).name[lang].toLowerCase())).join(" + ")).join(" → ");
  const bare = bareMonths(plan);
  const hasFallow = history.some((h) => h.crops.includes("fallow"));
  const risks = [...repeats].slice(0, 4);
  if (hasFallow) risks.push(tx(lang, "A fallow year leaves the soil bare and unproductive.", "Рік пару залишає ґрунт голим і без урожаю."));
  return {
    id: "current", kind: "current", title,
    summary: tx(lang, `Repeat the last three years in the same order: ${names}.`, `Повторити останні три роки в тому самому порядку: ${names}.`),
    rotationPlan: plan,
    score: Math.round(yearScores.reduce((a, b) => a + b, 0) / yearScores.length),
    why: tx(lang, "The baseline to compare against: the same crops, scored by site fit and by how they follow each other.", "База для порівняння: ті самі культури, оцінені за відповідністю місцю та за тим, як вони йдуть одна за одною."),
    evidence: [{ label: tx(lang, "Crops in three years", "Культур за три роки"), value: new Set(history.flatMap((h) => h.crops.filter((id) => id !== "fallow"))).size, unit: null }],
    benefits: [tx(lang, "No change in machinery, seed or habits.", "Не потрібно змінювати техніку, насіння чи звички.")],
    risks: risks.length ? risks : [tx(lang, "No rotation problem was found in the entered history; review local disease pressure.", "У введеній історії проблем сівозміни не знайдено; перевірте місцевий тиск хвороб.")],
    dataGaps: [tx(lang, "Crop shares inside each past year were not entered, so equal shares are assumed.", "Частки культур у минулих роках не вводилися, тому взято рівні частки.")],
    bareSoilMonths: bare, confidence,
  };
}

function strategyFromPlan(id: string, kind: "recommended" | "alternative", years: PlanYear[], input: LogicInput, climate: Climate | null, confidence: Confidence): RotationStrategy {
  const { lang } = input;
  const plan = toRotation(years);
  const families = new Set(years.flatMap((y) => y.picks.map((p) => p.crop.family))).size;
  const legumeYears = years.filter((y) => y.picks.some((p) => p.crop.family === LEGUME_FAMILY)).length;
  const evidence: Evidence[] = [
    { label: tx(lang, "Botanical families in three years", "Ботанічних родин за три роки"), value: families, unit: null },
    { label: tx(lang, "Years with a legume", "Років із бобовими"), value: legumeYears, unit: null },
  ];
  if (climate?.annualPrecipMm != null) evidence.push({ label: tx(lang, "Annual rainfall", "Опади за рік"), value: climate.annualPrecipMm, unit: "mm" });
  const soilFirst = id === "soil_first";
  return {
    id, kind,
    title: soilFirst ? tx(lang, "Soil-first rotation", "Сівозміна «спершу ґрунт»") : tx(lang, "Balanced rotation", "Збалансована сівозміна"),
    summary: soilFirst
      ? tx(lang, "A legume and a cover crop every year to feed and protect the soil.", "Щороку бобова і покривна культура, щоб живити й захищати ґрунт.")
      : tx(lang, "The best-fitting crops of different families each year, never repeating last year's crop.", "Щороку найвідповідніші культури різних родин, без повтору торішньої."),
    rotationPlan: plan,
    score: meanScore(years),
    why: tx(lang,
      `Each year takes the highest-scoring crops for this site that do not repeat the previous year's crop or family${soilFirst ? ", always keeping a legume and a cover crop" : ""}.`,
      `Щороку беруться культури з найвищою оцінкою для цього місця, які не повторюють торішню культуру чи родину${soilFirst ? ", і завжди лишаються бобова та покривна культура" : ""}.`),
    evidence,
    benefits: [
      tx(lang, `${families} botanical families in three years break disease and pest cycles.`, `${families} ботанічних родин за три роки розривають цикли хвороб і шкідників.`),
      legumeYears > 0
        ? tx(lang, `A legume in ${legumeYears} of 3 years adds nitrogen for the next crop.`, `Бобова у ${legumeYears} з 3 років додає азот для наступної культури.`)
        : tx(lang, "Several crops per year spread weather risk.", "Кілька культур щороку розподіляють погодний ризик."),
    ],
    risks: [
      tx(lang, "New crops may need other machinery, seed and a buyer: check before sowing.", "Нові культури можуть потребувати іншої техніки, насіння і покупця: перевірте до сівби."),
      tx(lang, "Local diseases, pests and herbicide carry-over are not in the data: ask a local agronomist.", "Місцевих хвороб, шкідників і післядії гербіцидів у даних немає: порадьтеся з місцевим агрономом."),
    ],
    dataGaps: [
      tx(lang, "Crop limits are species-level values from FAO EcoCrop, not for a specific variety.", "Межі культур — це видові значення з FAO EcoCrop, а не для конкретного сорту."),
      tx(lang, "Bare-soil months are estimated from the typical crop cycle, not from local sowing dates.", "Місяці голого ґрунту оцінено за типовою тривалістю циклу, а не за місцевими строками сівби."),
    ],
    bareSoilMonths: bareMonths(plan), confidence,
  };
}

function tillage(input: LogicInput, soil: Soil | null): TillageAdvice[] {
  const { lang, terrain } = input;
  const slope = terrain?.slopePct;
  const slopeText = typeof slope === "number" ? tx(lang, `The slope here is about ${r1(slope)} %.`, `Схил тут приблизно ${r1(slope)} %.`) : tx(lang, "The slope of this field is unknown.", "Схил цього поля невідомий.");
  const clay = soil?.properties.clayPct.median;
  const sand = soil?.properties.sandPct.median;
  const texture = typeof clay === "number" && typeof sand === "number"
    ? tx(lang, `Topsoil: about ${r1(clay)} % clay and ${r1(sand)} % sand.`, `Верхній шар: приблизно ${r1(clay)} % глини і ${r1(sand)} % піску.`)
    : tx(lang, "Soil texture for this point is unknown.", "Механічний склад ґрунту в цій точці невідомий.");
  return [
    {
      id: "keep_cover", title: tx(lang, "Keep the soil covered", "Тримайте ґрунт укритим"),
      simple: tx(lang, "Leave crop residue or sow a cover crop between main crops so rain and wind do not carry soil away.", "Залишайте рештки або сійте покривну культуру між основними, щоб дощ і вітер не виносили ґрунт."),
      expert: tx(lang, `Residue retention or a cover crop between cash crops; the steeper the slope, the more it matters. ${slopeText}`, `Залишення решток або покривна культура між основними; що крутіший схил, то це важливіше. ${slopeText}`),
      why: slopeText,
    },
    {
      id: "match_tillage_to_soil", title: tx(lang, "Match tillage to the soil", "Підберіть обробіток під ґрунт"),
      simple: tx(lang, "Work the soil only as much as the crop needs and never when it is wet.", "Обробляйте ґрунт лише настільки, наскільки потрібно культурі, і ніколи не по мокрому."),
      expert: tx(lang, `Choose depth and number of passes by texture and moisture; confirm with a soil test. ${texture}`, `Глибину й кількість проходів обирайте за механічним складом і вологістю; підтвердьте аналізом ґрунту. ${texture}`),
      why: texture,
    },
  ];
}

/** Builds the whole recommendation block of the response. */
export function advise(input: LogicInput, climate: Climate | null, soil: Soil | null): Recommendation {
  const { lang, history } = input;
  const past = history.map((h) => [...h.crops]);
  const historyKnown = history.every((h) => h.crops.every((id) => id === "fallow" || BY_ID.has(id)));
  const confidence: Confidence = !climate ? "low" : historyKnown && soil ? "medium" : "low";

  const scored = scoreAll(climate, soil, past, lang);
  const balanced = planYears(input, climate, soil, []);
  const soilFirst = planYears(input, climate, soil, [(s) => s.crop.family === LEGUME_FAMILY && s.crop.group !== "cover", (s) => s.crop.group === "cover"]);

  const first = balanced[0];
  const crops: CropShare[] = first.picks.map((p, i) => ({
    id: p.crop.id, name: p.crop.name[lang], sharePct: first.shares[i], score: p.score, why: explain(p, climate, soil, lang),
  }));

  const grown = new Set(past.flat());
  const avoid: CropAvoid[] = [];
  // Last year's own crops first, then at most three relatives of them, then crops the site cannot support.
  const lastIds = new Set(past[past.length - 1] ?? []);
  const rotationHits = scored.filter((s) => s.rotation.avoid);
  const repeats = rotationHits.filter((s) => lastIds.has(s.crop.id));
  const relatives = rotationHits.filter((s) => !lastIds.has(s.crop.id)).slice(0, 3);
  for (const s of [...repeats, ...relatives]) avoid.push({ id: s.crop.id, name: s.crop.name[lang], reason: "rotation", why: s.rotation.avoid as string });
  const unsuitable = scored.filter((s) => !s.rotation.avoid && s.fit.score !== null && s.fit.score < UNSUITABLE_BELOW);
  unsuitable.sort((a, b) => Number(grown.has(b.crop.id)) - Number(grown.has(a.crop.id)) || (a.fit.score as number) - (b.fit.score as number));
  for (const s of unsuitable.slice(0, 5)) avoid.push({ id: s.crop.id, name: s.crop.name[lang], reason: "site", why: limitingText(s, climate, soil, lang) });

  const warnings: string[] = [];
  if (first.picks[0].score < RECOMMEND_MIN_SCORE) warnings.push(tx(lang, "No crop in the list fits this site well; the best available one is shown. Ask a local agronomist.", "Жодна культура зі списку не підходить цьому місцю добре; показано найкращу з наявних. Порадьтеся з місцевим агрономом."));
  if (!historyKnown) warnings.push(tx(lang, "The field history is not fully known, so rotation rules could not be applied in full.", "Історія поля відома не повністю, тому правила сівозміни застосовано не повністю."));
  if (!climate) warnings.push(tx(lang, "Climate data is missing: crops were compared by rotation only.", "Немає даних про клімат: культури порівняно лише за сівозміною."));
  if (!soil) warnings.push(tx(lang, "Soil data is missing for this point: soil pH was not checked.", "Немає даних про ґрунт у цій точці: pH ґрунту не перевірявся."));

  return {
    crops,
    rotationPlan: toRotation(balanced),
    strategies: [
      currentStrategy(input, climate, soil, confidence),
      strategyFromPlan("balanced", "recommended", balanced, input, climate, confidence),
      strategyFromPlan("soil_first", "alternative", soilFirst, input, climate, confidence),
    ],
    avoid,
    tillage: tillage(input, soil),
    warnings,
    confidence,
    assumptions: [
      tx(lang, "Climate is a long-term average, not a forecast for next season.", "Клімат — це багаторічне середнє, а не прогноз на наступний сезон."),
      tx(lang, "Soil values are model estimates at about 250 m resolution, not a lab analysis of this field.", "Показники ґрунту — модельні оцінки з роздільністю близько 250 м, а не лабораторний аналіз цього поля."),
      tx(lang, "Site fit uses FAO EcoCrop limits for temperature, annual rainfall and pH; the weakest factor decides. Irrigation is not considered.", "Відповідність місцю рахується за межами FAO EcoCrop для температури, річних опадів і pH; вирішує найслабший чинник. Зрошення не враховано."),
      tx(lang, "Rotation penalties and bonuses are heuristic weights of this tool. Scores are relative, not yields or income.", "Штрафи й бонуси сівозміни — евристичні ваги цього інструмента. Оцінки відносні, це не врожайність і не дохід."),
    ],
  };
}
