import { describe, it, expect } from "vitest";
import { DEFAULT_REP_RANGE, REP_RANGE_PRESETS, parseRepRange, repRangeValue, toRepRange } from "./rep-range";

describe("rep range values", () => {
  it("round-trips through the select value", () => {
    expect(repRangeValue({ min: 6, max: 10 })).toBe("6-10");
    expect(repRangeValue(null)).toBe("");
    expect(parseRepRange("6-10")).toEqual({ min: 6, max: 10 });
    expect(parseRepRange("")).toBeNull();
    expect(parseRepRange("10-6")).toBeNull();
    expect(parseRepRange("x")).toBeNull();
  });

  it("offers the default among the presets", () => {
    expect(REP_RANGE_PRESETS).toContainEqual(DEFAULT_REP_RANGE);
  });
});

describe("toRepRange", () => {
  it("is a range only when both columns are set", () => {
    expect(toRepRange(6, 10)).toEqual({ min: 6, max: 10 });
    expect(toRepRange(null, null)).toBeNull();
    expect(toRepRange(6, null)).toBeNull();
  });
});
