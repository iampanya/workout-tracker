import { describe, it, expect } from "vitest";
import {
  deltaTone,
  goalProgress,
  goodDirection,
  scanDelta,
  suggestedGoalTargets,
  toScanDateString,
} from "./metrics";

describe("goodDirection / deltaTone", () => {
  it("treats fat going down and muscle going up as progress", () => {
    expect(goodDirection("body_fat_pct")).toBe("down");
    expect(goodDirection("skeletal_muscle_kg")).toBe("up");
    expect(deltaTone("body_fat_pct", -0.5)).toBe("success");
    expect(deltaTone("body_fat_pct", 0.5)).toBe("danger");
    expect(deltaTone("skeletal_muscle_kg", 0.3)).toBe("success");
  });

  it("is neutral for weight (the goal decides), zero and missing deltas", () => {
    expect(goodDirection("weight_kg")).toBeNull();
    expect(deltaTone("weight_kg", -1)).toBe("neutral");
    expect(deltaTone("body_fat_pct", 0)).toBe("neutral");
    expect(deltaTone("body_fat_pct", null)).toBe("neutral");
  });
});

describe("scanDelta", () => {
  it("rounds to 2 decimals and is null when a side is missing", () => {
    expect(scanDelta(74.15, 74.6)).toBe(-0.45);
    expect(scanDelta(32.11, 31.9)).toBe(0.21);
    expect(scanDelta(null, 70)).toBeNull();
    expect(scanDelta(70, null)).toBeNull();
  });
});

describe("goalProgress", () => {
  it("works for goals in either direction", () => {
    expect(goalProgress(80, 70, 75)).toBe(50); // losing weight
    expect(goalProgress(32, 34, 33)).toBe(50); // gaining muscle
  });

  it("clamps to 0–100", () => {
    expect(goalProgress(80, 70, 82)).toBe(0);
    expect(goalProgress(80, 70, 68)).toBe(100);
  });

  it("is 100 when start already equals target", () => {
    expect(goalProgress(70, 70, 71)).toBe(100);
  });
});

describe("toScanDateString", () => {
  it("returns the Bangkok calendar day, not the UTC one", () => {
    expect(toScanDateString(new Date("2026-10-17T23:00:00Z"))).toBe("2026-10-18");
    expect(toScanDateString(new Date("2026-10-18T09:58:00+07:00"))).toBe("2026-10-18");
  });
});

describe("suggestedGoalTargets", () => {
  it("applies arboleaf's weight control to the current values", () => {
    expect(
      suggestedGoalTargets({
        weight_kg: 74.15,
        body_fat_kg: 17.2,
        skeletal_muscle_kg: 32.11,
        report: { weight_control: { normal_weight_kg: 69.59, weight_kg: -4.56, fat_kg: -6.77, muscle_kg: 2.2 } },
      })
    ).toEqual({ weight_kg: 69.59, body_fat_kg: 10.43, skeletal_muscle_kg: 34.31 });
  });

  it("skips targets it can't compute", () => {
    expect(suggestedGoalTargets({ weight_kg: 80, body_fat_kg: null, skeletal_muscle_kg: 35, report: null })).toEqual({});
    expect(
      suggestedGoalTargets({ weight_kg: 80, body_fat_kg: null, skeletal_muscle_kg: 35, report: { weight_control: { weight_kg: -2 } } })
    ).toEqual({ weight_kg: 78 });
  });
});
