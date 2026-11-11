import { describe, it, expect } from "vitest";
import type { LastSession } from "@/lib/sessions/last-session";
import { DEFAULT_REP_RANGE } from "@/lib/routines/rep-range";
import {
  WEIGHT_STEP_PRESETS,
  defaultWeightStep,
  inferStepFromWeights,
  nextTarget,
  resolveWeightStep,
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

describe("defaultWeightStep", () => {
  it("is the muscle-group default with no custom value or history", () => {
    expect(defaultWeightStep("Legs")).toEqual({ kg: 5, source: "default", autoKg: 5, autoSource: "default" });
    expect(defaultWeightStep(null)).toEqual({ kg: 1.25, source: "default", autoKg: 1.25, autoSource: "default" });
  });
});

describe("inferStepFromWeights", () => {
  it("returns the most common gap between neighbouring weights", () => {
    expect(inferStepFromWeights([10, 12, 14, 16])).toBe(2);
    expect(inferStepFromWeights([40, 45, 50, 52.5])).toBe(5);
  });

  it("ignores duplicates, order and non-positive weights", () => {
    expect(inferStepFromWeights([14, 10, 12, 12, 0, 10])).toBe(2);
  });

  it("is not dragged down by a single typo once there is enough history", () => {
    expect(inferStepFromWeights([60, 61, 65, 70, 75])).toBe(5);
  });

  it("breaks a tie with the smaller gap", () => {
    expect(inferStepFromWeights([20, 22.5, 25, 30, 35])).toBe(2.5); // gaps 2.5, 2.5, 5, 5
  });

  it("needs the gap to repeat and be a plausible step", () => {
    expect(inferStepFromWeights([50, 60])).toBeNull(); // a single gap
    expect(inferStepFromWeights([20, 60])).toBeNull(); // single gap, too large anyway
    expect(inferStepFromWeights([20, 40, 60, 80, 100])).toBeNull(); // mode 20 kg > 10
    expect(inferStepFromWeights([20, 30, 40])).toBe(10); // the largest accepted step
  });

  it("handles fractional machine and plate steps", () => {
    expect(inferStepFromWeights([4.5, 9, 13.5, 18])).toBe(4.5);
    expect(inferStepFromWeights([20, 21.25, 22.5])).toBe(1.25);
  });

  it("returns null with fewer than two distinct weights", () => {
    expect(inferStepFromWeights([])).toBeNull();
    expect(inferStepFromWeights([60, 60])).toBeNull();
    expect(inferStepFromWeights([0, 60])).toBeNull();
    expect(inferStepFromWeights([10, 12])).toBeNull(); // one gap is not enough evidence
  });
});

describe("resolveWeightStep", () => {
  it("prefers the custom step but still reports the automatic one", () => {
    expect(resolveWeightStep({ customKg: 5, loggedWeights: [10, 12, 14], muscleGroup: "Shoulders" })).toEqual({
      kg: 5,
      source: "custom",
      autoKg: 2,
      autoSource: "history",
    });
  });

  it("falls back to the history inference", () => {
    expect(resolveWeightStep({ customKg: null, loggedWeights: [10, 12, 14], muscleGroup: "Legs" })).toEqual({
      kg: 2,
      source: "history",
      autoKg: 2,
      autoSource: "history",
    });
  });

  it("falls back to the muscle-group default without history", () => {
    expect(resolveWeightStep({ customKg: null, loggedWeights: [60], muscleGroup: "Legs" })).toEqual({
      kg: 5,
      source: "default",
      autoKg: 5,
      autoSource: "default",
    });
    expect(resolveWeightStep({ customKg: 2, loggedWeights: [], muscleGroup: null })).toEqual({
      kg: 2,
      source: "custom",
      autoKg: 1.25,
      autoSource: "default",
    });
  });
});

describe("nextTarget with a per-exercise step", () => {
  it("adds and removes exactly the step it is given", () => {
    expect(nextTarget([session([set(12, 12), set(12, 12)])], R, 2)).toEqual({
      weightKg: 14,
      reps: 8,
      reason: "addWeight",
    });
    const stalled = [session([set(50, 6)]), session([set(50, 6)], "2026-09-24")];
    expect(nextTarget(stalled, R, 5)).toEqual({ weightKg: 45, reps: 8, reason: "reset" });
  });
});

describe("WEIGHT_STEP_PRESETS", () => {
  it("is sorted and every value is a positive 2-decimal step", () => {
    expect([...WEIGHT_STEP_PRESETS].sort((a, b) => a - b)).toEqual(WEIGHT_STEP_PRESETS);
    for (const kg of WEIGHT_STEP_PRESETS) expect(Math.round(kg * 100) / 100).toBe(kg);
  });
});
