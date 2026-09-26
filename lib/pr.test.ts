import { describe, it, expect } from "vitest";
import { isNewPr, estimateOneRepMax } from "./pr";

describe("isNewPr", () => {
  it("is a PR when there is no prior max", () => {
    expect(isNewPr(60, null)).toBe(true);
  });
  it("is a PR when weight exceeds the prior max", () => {
    expect(isNewPr(101, 100)).toBe(true);
  });
  it("is not a PR when weight equals the prior max", () => {
    expect(isNewPr(100, 100)).toBe(false);
  });
  it("is not a PR when weight is below the prior max", () => {
    expect(isNewPr(90, 100)).toBe(false);
  });
});

describe("estimateOneRepMax", () => {
  it("returns the weight itself for a single", () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
  });

  it("applies Epley and rounds to the nearest 0.5 kg", () => {
    expect(estimateOneRepMax(100, 5)).toBe(116.5);
    expect(estimateOneRepMax(60, 10)).toBe(80);
  });
});
