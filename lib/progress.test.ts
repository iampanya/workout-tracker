import { describe, it, expect } from "vitest";
import { aggregateSessionSeries } from "./progress";

describe("aggregateSessionSeries", () => {
  it("groups sets by session_date, taking max weight and summed volume", () => {
    const result = aggregateSessionSeries([
      { session_date: "2026-01-05", weight_kg: 100, reps: 5 },
      { session_date: "2026-01-05", weight_kg: 90, reps: 8 },
      { session_date: "2026-01-12", weight_kg: 105, reps: 5 },
    ]);
    expect(result).toEqual([
      { date: "2026-01-05", maxWeight: 100, volume: 100 * 5 + 90 * 8, e1rm: 116.5 },
      { date: "2026-01-12", maxWeight: 105, volume: 105 * 5, e1rm: 122.5 },
    ]);
  });

  it("returns dates sorted ascending regardless of input order", () => {
    const result = aggregateSessionSeries([
      { session_date: "2026-02-01", weight_kg: 50, reps: 10 },
      { session_date: "2026-01-01", weight_kg: 50, reps: 10 },
    ]);
    expect(result.map((r) => r.date)).toEqual(["2026-01-01", "2026-02-01"]);
  });

  it("returns an empty array for no sets", () => {
    expect(aggregateSessionSeries([])).toEqual([]);
  });

  it("tracks the best estimated 1RM per day, so a heavier set for reps can beat a heavier single", () => {
    const [point] = aggregateSessionSeries([
      { session_date: "2026-03-01", weight_kg: 100, reps: 1 },
      { session_date: "2026-03-01", weight_kg: 90, reps: 8 },
    ]);
    expect(point.maxWeight).toBe(100);
    expect(point.e1rm).toBe(114);
  });
});
