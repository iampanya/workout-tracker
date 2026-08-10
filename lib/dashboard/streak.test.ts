import { describe, it, expect } from "vitest";
import { computeStreakDays } from "./streak";

const TODAY = "2026-01-08";

describe("computeStreakDays", () => {
  it("returns 0 for no sessions", () => {
    expect(computeStreakDays([], TODAY)).toBe(0);
  });

  it("counts a streak that includes today", () => {
    expect(computeStreakDays(["2026-01-08", "2026-01-07", "2026-01-06"], TODAY)).toBe(3);
  });

  it("does not zero out when today has no session yet", () => {
    expect(computeStreakDays(["2026-01-07", "2026-01-06"], TODAY)).toBe(2);
  });

  it("returns 0 when today and yesterday are both missing", () => {
    expect(computeStreakDays(["2026-01-06"], TODAY)).toBe(0);
  });

  it("stops at the first gap", () => {
    expect(computeStreakDays(["2026-01-08", "2026-01-07", "2026-01-04"], TODAY)).toBe(2);
  });

  it("treats duplicate dates as one day", () => {
    expect(computeStreakDays(["2026-01-08", "2026-01-08", "2026-01-07"], TODAY)).toBe(2);
  });
});
