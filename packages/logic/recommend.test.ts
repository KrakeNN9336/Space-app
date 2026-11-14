import { describe, expect, it } from "vitest";
import type { LogicInput } from "@field-shift/shared";
import { STRESS_IDS } from "@field-shift/shared";
import { recommend } from "./recommend";

const input: LogicInput = {
  location: { lat: 49.84, lon: 24.03 },
  field: { source: "point", geometry: { type: "Point", coordinates: [24.03, 49.84] } },
  radiusKm: 5,
  history: [
    { year: 2024, crops: ["winter_wheat"] },
    { year: 2025, crops: ["corn"] },
    { year: 2026, crops: ["fallow"] },
  ],
  priorities: { water: 3, income: 3, soil: 3, erosion: 3 },
  lang: "en",
  climate: null,
  soil: null,
  terrain: null,
  dataStatus: { climate: "failed", soil: "failed", terrain: "failed" },
};

describe("recommend()", () => {
  const out = recommend(input);

  it("returns exactly six stress indicators", () => {
    expect(out.stress.map((s) => s.id).sort()).toEqual([...STRESS_IDS].sort());
  });

  it("returns shares that are multiples of 5 and sum to 100", () => {
    const shares = out.recommendation.crops.map((c) => c.sharePct);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    expect(shares.every((s) => s % 5 === 0)).toBe(true);
  });
});
