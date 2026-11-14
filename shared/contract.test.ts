import { describe, expect, it } from "vitest";
import mockRequest from "./mock-request.json";
import mockResponse from "./mock-analyze.json";
import { validateAnalyzeRequest, validateAnalyzeResponse } from "./validate";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe("contract v2", () => {
  it("mock-analyze.json matches the response contract", () => {
    expect(validateAnalyzeResponse(mockResponse)).toEqual([]);
  });

  it("mock-request.json matches the request contract", () => {
    expect(validateAnalyzeRequest(mockRequest)).toEqual([]);
  });

  it("rejects shares that do not sum to 100", () => {
    const broken = clone(mockResponse);
    broken.recommendation.crops[0].sharePct = 45;
    expect(validateAnalyzeResponse(broken).join("\n")).toContain("sum to 100");
  });

  it("rejects a missing stress indicator", () => {
    const broken = clone(mockResponse);
    broken.stress.pop();
    expect(validateAnalyzeResponse(broken).join("\n")).toContain("exactly 6");
  });

  it("rejects a radius outside 1..25 km and a wrong history length", () => {
    const broken = { ...clone(mockRequest), radiusKm: 40, history: [] };
    const errors = validateAnalyzeRequest(broken).join("\n");
    expect(errors).toContain("radiusKm");
    expect(errors).toContain("history");
  });

  it("rejects unknown crop ids when the crop list is given", () => {
    const errors = validateAnalyzeRequest(mockRequest, ["corn", "soybean"]);
    expect(errors.join("\n")).toContain('unknown crop id "winter_wheat"');
  });
});
