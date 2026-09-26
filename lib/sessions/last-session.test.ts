import { describe, it, expect } from "vitest";
import { formatLastSets, prefillFromLast, type LastSession } from "./last-session";

const set = (weight_kg: number, reps: number, is_warmup = false) => ({ weight_kg, reps, is_warmup });

describe("formatLastSets", () => {
  it("lists working sets and skips warmups", () => {
    expect(formatLastSets([set(40, 10, true), set(60, 8), set(62.5, 6)])).toBe("60×8, 62.5×6");
  });

  it("falls back to warmups when there were no working sets", () => {
    expect(formatLastSets([set(40, 10, true)])).toBe("40×10");
  });
});

describe("prefillFromLast", () => {
  it("uses the first working set", () => {
    const last: LastSession = { sessionDate: "2026-09-20", sets: [set(40, 10, true), set(60, 8)] };
    expect(prefillFromLast(last)).toEqual({ weight: "60", reps: "8" });
  });

  it("returns null without a previous session", () => {
    expect(prefillFromLast(null)).toBeNull();
    expect(prefillFromLast({ sessionDate: "2026-09-20", sets: [] })).toBeNull();
  });
});
