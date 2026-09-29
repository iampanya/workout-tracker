import { describe, it, expect } from "vitest";
import { isNewPr, formatPr, estimateOneRepMax } from "./pr";

describe("isNewPr", () => {
  const pr = (weightKg: number, reps: number) => ({ weightKg, reps });

  it("is a PR when there is no prior record", () => {
    expect(isNewPr(pr(60, 5), null)).toBe(true);
  });
  it("is a PR when weight exceeds the prior record, regardless of reps", () => {
    expect(isNewPr(pr(101, 1), pr(100, 8))).toBe(true);
  });
  it("is a PR at the same weight for more reps", () => {
    expect(isNewPr(pr(100, 6), pr(100, 5))).toBe(true);
  });
  it("is not a PR on an exact tie", () => {
    expect(isNewPr(pr(100, 5), pr(100, 5))).toBe(false);
  });
  it("is not a PR at the same weight for fewer reps", () => {
    expect(isNewPr(pr(100, 4), pr(100, 5))).toBe(false);
  });
  it("is not a PR when lighter, even for more reps", () => {
    expect(isNewPr(pr(90, 12), pr(100, 5))).toBe(false);
  });
});

describe("formatPr", () => {
  it("renders weight and reps", () => {
    expect(formatPr({ weightKg: 102.5, reps: 6 })).toBe("102.5 kg × 6");
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
