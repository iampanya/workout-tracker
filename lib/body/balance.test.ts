import { describe, it, expect } from "vitest";
import { sampleScan } from "./fixtures";
import { leanShare, limbImbalancePct, regionForMuscleGroup, trainingShare } from "./balance";

describe("regionForMuscleGroup", () => {
  it("maps each muscle group onto the scale's segments", () => {
    expect(regionForMuscleGroup("Arms")).toBe("arms");
    expect(regionForMuscleGroup("Legs")).toBe("legs");
    for (const group of ["Chest", "Back", "Shoulders", "Core"]) expect(regionForMuscleGroup(group)).toBe("trunk");
    expect(regionForMuscleGroup(null)).toBeNull();
    expect(regionForMuscleGroup("Cardio")).toBeNull();
  });
});

describe("trainingShare", () => {
  it("returns % of working sets per region, ignoring unmapped groups", () => {
    expect(
      trainingShare([
        { muscle_group: "Chest", sets: 10 },
        { muscle_group: "Back", sets: 10 },
        { muscle_group: "Arms", sets: 5 },
        { muscle_group: "Legs", sets: 25 },
        { muscle_group: null, sets: 40 },
      ])
    ).toEqual({ arms: 10, trunk: 40, legs: 50 });
  });

  it("is null with no mapped sets", () => {
    expect(trainingShare([])).toBeNull();
    expect(trainingShare([{ muscle_group: null, sets: 3 }])).toBeNull();
  });
});

describe("leanShare", () => {
  it("returns % of segmental lean mass per region", () => {
    // arms 3.4 + 3.6 = 7, trunk 28, legs 10 + 10.4 = 20.4 → of 55.4
    expect(leanShare(sampleScan().segments ?? null)).toEqual({ arms: 13, trunk: 51, legs: 37 });
  });

  it("is null unless all five segments have lean mass", () => {
    expect(leanShare(null)).toBeNull();
    const segments = sampleScan().segments!;
    expect(leanShare({ ...segments, trunk: { ...segments.trunk, lean_kg: null } })).toBeNull();
  });
});

describe("limbImbalancePct", () => {
  it("is |L − R| as % of the larger side", () => {
    expect(limbImbalancePct(3.1, 3.3)).toBe(6.1);
    expect(limbImbalancePct(9.6, 9.6)).toBe(0);
  });

  it("is null when a side is missing or both are zero", () => {
    expect(limbImbalancePct(null, 3)).toBeNull();
    expect(limbImbalancePct(3, undefined)).toBeNull();
    expect(limbImbalancePct(0, 0)).toBeNull();
  });
});
