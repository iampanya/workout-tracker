import type { BodySegments } from "./schema";

export const BODY_REGIONS = ["arms", "trunk", "legs"] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];
export type RegionShare = Record<BodyRegion, number>;

// Where a muscle group's training lands on the scale's five segments. Chest, back, shoulders and
// core all sit on the trunk segment. Sets aren't sided, so there's no left/right mapping.
export function regionForMuscleGroup(group: string | null): BodyRegion | null {
  switch (group) {
    case "Arms":
      return "arms";
    case "Legs":
      return "legs";
    case "Chest":
    case "Back":
    case "Shoulders":
    case "Core":
      return "trunk";
    default:
      return null;
  }
}

function toShares(totals: RegionShare): RegionShare | null {
  const sum = totals.arms + totals.trunk + totals.legs;
  if (sum <= 0) return null;
  const pct = (value: number) => Math.round((value / sum) * 100);
  return { arms: pct(totals.arms), trunk: pct(totals.trunk), legs: pct(totals.legs) };
}

// % of working sets per region. Exercises with no (or an unknown) muscle group are left out.
export function trainingShare(counts: { muscle_group: string | null; sets: number }[]): RegionShare | null {
  const totals: RegionShare = { arms: 0, trunk: 0, legs: 0 };
  for (const { muscle_group, sets } of counts) {
    const region = regionForMuscleGroup(muscle_group);
    if (region) totals[region] += sets;
  }
  return toShares(totals);
}

// % of segmental lean mass per region; null unless all five segments report lean mass.
export function leanShare(segments: BodySegments | null): RegionShare | null {
  const lean = (key: keyof BodySegments) => segments?.[key]?.lean_kg ?? null;
  const parts = [lean("left_arm"), lean("right_arm"), lean("trunk"), lean("left_leg"), lean("right_leg")];
  if (parts.some((part) => part === null)) return null;
  const [leftArm, rightArm, trunk, leftLeg, rightLeg] = parts as number[];
  return toShares({ arms: leftArm + rightArm, trunk, legs: leftLeg + rightLeg });
}

// |left − right| as a % of the larger side, 1 decimal.
export function limbImbalancePct(
  left: number | null | undefined,
  right: number | null | undefined
): number | null {
  if (left === null || left === undefined || right === null || right === undefined) return null;
  const larger = Math.max(left, right);
  if (larger <= 0) return null;
  return Math.round((Math.abs(left - right) / larger) * 1000) / 10;
}
