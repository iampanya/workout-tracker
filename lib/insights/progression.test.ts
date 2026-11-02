import { describe, it, expect } from "vitest";
import type { LastSession } from "@/lib/sessions/last-session";
import {
  DEFAULT_REP_RANGE,
  REP_RANGE_PRESETS,
  nextTarget,
  parseRepRange,
  repRangeValue,
  stepFor,
} from "./progression";

const set = (weight_kg: number, reps: number, is_warmup = false) => ({ weight_kg, reps, is_warmup });
const session = (sets: LastSession["sets"], sessionDate = "2026-10-01"): LastSession => ({ sessionDate, sets });
const R = DEFAULT_REP_RANGE;

describe("nextTarget", () => {
  it("returns null without usable history", () => {
    expect(nextTarget([], R, 2.5)).toBeNull();
    expect(nextTarget([session([set(40, 10, true)])], R, 2.5)).toBeNull();
  });

  it("adds weight and drops to the bottom of the range once every top set hits the top", () => {
    expect(nextTarget([session([set(60, 12), set(60, 12), set(60, 13)])], R, 2.5)).toEqual({
      weightKg: 62.5,
      reps: 8,
      reason: "addWeight",
    });
  });

  it("otherwise adds a rep to the weakest top set, capped at the top of the range", () => {
    expect(nextTarget([session([set(60, 10), set(60, 9), set(60, 8)])], R, 2.5)).toEqual({
      weightKg: 60,
      reps: 9,
      reason: "addReps",
    });
    expect(nextTarget([session([set(60, 12), set(60, 11)])], R, 2.5)).toEqual({
      weightKg: 60,
      reps: 12,
      reason: "addReps",
    });
  });

  it("only looks at sets at the session's heaviest working weight, ignoring warmups", () => {
    expect(nextTarget([session([set(55, 12), set(60, 9), set(60, 8)])], R, 2.5)).toMatchObject({
      weightKg: 60,
      reps: 9,
    });
    expect(nextTarget([session([set(50, 6), set(60, 12), set(60, 12)])], R, 2.5)?.reason).toBe("addWeight");
    expect(nextTarget([session([set(40, 5, true), set(60, 12), set(60, 12)])], R, 2.5)?.reason).toBe("addWeight");
  });

  it("resets the weight after two stalled sessions below the range at the same weight", () => {
    const newest = session([set(60, 6), set(60, 6)], "2026-10-08");
    const previous = session([set(60, 7), set(60, 6)], "2026-10-01");
    expect(nextTarget([newest, previous], R, 2.5)).toEqual({ weightKg: 57.5, reps: 8, reason: "reset" });
  });

  it("does not reset while reps are still improving, after a weight change, or with one session", () => {
    const improving = [session([set(60, 7), set(60, 7)]), session([set(60, 6), set(60, 6)])];
    expect(nextTarget(improving, R, 2.5)).toEqual({ weightKg: 60, reps: 8, reason: "addReps" });

    const weightChanged = [session([set(60, 6)]), session([set(57.5, 6)])];
    expect(nextTarget(weightChanged, R, 2.5)).toEqual({ weightKg: 60, reps: 7, reason: "addReps" });

    expect(nextTarget([session([set(60, 6)])], R, 2.5)).toEqual({ weightKg: 60, reps: 7, reason: "addReps" });
  });

  it("never resets below zero", () => {
    const stalled = [session([set(1.25, 5)]), session([set(1.25, 5)])];
    expect(nextTarget(stalled, R, 2.5)).toEqual({ weightKg: 0, reps: 8, reason: "reset" });
  });

  it("progresses bodyweight work by reps only, with no cap", () => {
    expect(nextTarget([session([set(0, 12), set(0, 15)])], R, 2.5)).toEqual({
      weightKg: 0,
      reps: 13,
      reason: "repsOnly",
    });
  });

  it("honours a custom range and rounds to 2 decimals", () => {
    expect(nextTarget([session([set(100, 8), set(100, 8)])], { min: 5, max: 8 }, 5)).toEqual({
      weightKg: 105,
      reps: 5,
      reason: "addWeight",
    });
    expect(nextTarget([session([set(20.1, 12)])], R, 1.25)?.weightKg).toBe(21.35);
  });
});

describe("stepFor", () => {
  it("steps by muscle group", () => {
    expect(stepFor("Legs")).toBe(5);
    expect(stepFor("Chest")).toBe(2.5);
    expect(stepFor("Back")).toBe(2.5);
    expect(stepFor("Shoulders")).toBe(1.25);
    expect(stepFor("Arms")).toBe(1.25);
    expect(stepFor("Core")).toBe(1.25);
    expect(stepFor(null)).toBe(1.25);
  });
});

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
