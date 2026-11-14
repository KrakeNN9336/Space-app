import { describe, expect, it } from "vitest";
import type { LogicInput, RawClimate, RawSoil } from "@field-shift/shared";
import { validateAnalyzeResponse } from "@field-shift/shared";
import { equalShares, trapezoid } from "./advise";
import { recommend } from "./recommend";

// Rounded NASA POWER climatology near Lviv, used only as a realistic temperate test case.
const tempC = [-4.4, -2.9, 1.8, 8.9, 14.2, 17.8, 20, 19.4, 14.1, 8.5, 3.3, -2.2];
const climate: RawClimate = {
  monthly: {
    tempC,
    tempMinC: tempC.map((t) => t - 5),
    tempMaxC: tempC.map((t) => t + 5),
    precipMm: [40, 38, 42, 50, 78, 92, 98, 72, 62, 48, 44, 46],
    solarMjM2Day: null,
  },
  spread: { tempC: 0.3, precipMm: 20 },
  samples: 9,
  source: "test",
};
const range = (median: number) => ({ median, low: median, high: median });
const soil: RawSoil = {
  wrbGroup: null,
  properties: { organicCarbonGkg: range(30), phH2O: range(6.6), sandPct: range(20), siltPct: range(55), clayPct: range(25) },
  source: "test",
};

const input = (history: string[][], withData = true): LogicInput => ({
  location: { lat: 49.84, lon: 24.03 },
  field: { source: "point", geometry: { type: "Point", coordinates: [24.03, 49.84] } },
  radiusKm: 5,
  history: history.map((crops, i) => ({ year: 2024 + i, crops })),
  priorities: { water: 3, income: 3, soil: 3, erosion: 3 },
  lang: "en",
  climate: withData ? climate : null,
  soil: withData ? soil : null,
  terrain: withData ? { elevationM: 280, slopePct: 3 } : null,
  dataStatus: withData ? { climate: "live", soil: "live", terrain: "live" } : { climate: "failed", soil: "failed", terrain: "failed" },
});

const asResponse = (i: LogicInput) => {
  const out = recommend(i);
  return { field: i.field, ...out, terrain: i.terrain, dataStatus: i.dataStatus, disclaimer: "x" };
};

describe("trapezoid", () => {
  const r = { min: 5, optMin: 15, optMax: 23, max: 27 };
  it("is 0 outside, 1 in the optimum and linear between", () => {
    expect(trapezoid(4, r)).toBe(0);
    expect(trapezoid(10, r)).toBe(0.5);
    expect(trapezoid(20, r)).toBe(1);
    expect(trapezoid(25, r)).toBe(0.5);
    expect(trapezoid(30, r)).toBe(0);
    expect(trapezoid(null, r)).toBeNull();
  });
});

describe("equalShares", () => {
  it("gives multiples of 5 that sum to 100", () => {
    for (const n of [1, 2, 3, 4, 6, 7]) {
      const shares = equalShares(n);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
      expect(shares.every((s) => s % 5 === 0)).toBe(true);
    }
  });
});

describe("crop advice", () => {
  it("matches the response contract for known, unknown and missing data", () => {
    expect(validateAnalyzeResponse(asResponse(input([["winter_wheat"], ["corn", "soybean"], ["fallow"]])))).toEqual([]);
    expect(validateAnalyzeResponse(asResponse(input([["unknown"], ["unknown"], ["unknown"]])))).toEqual([]);
    expect(validateAnalyzeResponse(asResponse(input([["corn"], ["corn"], ["corn"]], false)))).toEqual([]);
  });

  it("does not recommend last year's crop and lists it under avoid", () => {
    const rec = recommend(input([["corn"], ["corn"], ["corn"]])).recommendation;
    expect(rec.crops.map((c) => c.id)).not.toContain("corn");
    expect(rec.avoid?.find((a) => a.id === "corn")?.reason).toBe("rotation");
  });

  it("flags crops the climate cannot support", () => {
    const rec = recommend(input([["winter_wheat"], ["pea"], ["sunflower"]])).recommendation;
    expect(rec.avoid?.find((a) => a.id === "rice")?.reason).toBe("site");
    expect(rec.crops.map((c) => c.id)).not.toContain("rice");
  });

  it("brings a legume in after three cereal years", () => {
    const rec = recommend(input([["winter_wheat"], ["barley"], ["corn"]])).recommendation;
    const legumes = ["soybean", "pea", "clover", "chickpea", "lentil", "groundnut", "common_bean"];
    expect(rec.crops.some((c) => legumes.includes(c.id))).toBe(true);
  });

  it("returns an empty current strategy when the history is unknown", () => {
    const rec = recommend(input([["unknown"], ["unknown"], ["unknown"]])).recommendation;
    const current = rec.strategies.find((s) => s.kind === "current");
    expect(current?.rotationPlan).toEqual([]);
    expect(rec.confidence).toBe("low");
  });
});
