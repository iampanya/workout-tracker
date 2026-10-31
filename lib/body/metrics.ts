import { getTodayString } from "@/lib/date";
import type { BodyReport, GoalMetric, ScanMetricKey } from "./schema";

// Unit symbol shown after each metric's value (symbols, so not translated). Empty = unitless.
export const METRIC_UNITS: Record<ScanMetricKey, string> = {
  weight_kg: "kg",
  bmi: "",
  body_fat_pct: "%",
  body_fat_kg: "kg",
  skeletal_muscle_kg: "kg",
  skeletal_muscle_pct: "%",
  muscle_mass_pct: "%",
  soft_lean_mass_kg: "kg",
  fat_free_mass_kg: "kg",
  body_water_l: "L",
  body_water_pct: "%",
  protein_kg: "kg",
  protein_pct: "%",
  bone_mass_kg: "kg",
  bone_mass_pct: "%",
  visceral_fat: "",
  subcutaneous_fat_pct: "%",
  subcutaneous_fat_kg: "kg",
  bmr_kcal: "kcal",
  smi: "",
  waist_hip_ratio: "",
  fitness_score: "",
  height_cm: "cm",
  age: "",
};

export type Direction = "up" | "down";

const LOWER_IS_BETTER = new Set<ScanMetricKey>([
  "body_fat_pct",
  "body_fat_kg",
  "visceral_fat",
  "subcutaneous_fat_pct",
  "subcutaneous_fat_kg",
  "waist_hip_ratio",
]);
const HIGHER_IS_BETTER = new Set<ScanMetricKey>([
  "skeletal_muscle_kg",
  "skeletal_muscle_pct",
  "muscle_mass_pct",
  "soft_lean_mass_kg",
  "fat_free_mass_kg",
  "smi",
  "fitness_score",
]);

// Which way a change counts as progress. Weight (and descriptive values like height) has no
// inherent direction — the user's goal decides — so it's null.
export function goodDirection(metric: ScanMetricKey): Direction | null {
  if (LOWER_IS_BETTER.has(metric)) return "down";
  if (HIGHER_IS_BETTER.has(metric)) return "up";
  return null;
}

export type DeltaTone = "success" | "danger" | "neutral";

export function deltaTone(metric: ScanMetricKey, delta: number | null): DeltaTone {
  const direction = goodDirection(metric);
  if (delta === null || delta === 0 || direction === null) return "neutral";
  return delta > 0 === (direction === "up") ? "success" : "danger";
}

const round2 = (value: number) => Math.round(value * 100) / 100;

// current − previous, rounded to 2 decimals; null when either side is missing.
export function scanDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return round2(current - previous);
}

// How far from start to target the current value is, 0–100 (overshooting counts as 100, moving
// the wrong way as 0). Works for goals in either direction.
export function goalProgress(start: number, target: number, current: number): number {
  if (target === start) return 100;
  const pct = ((current - start) / (target - start)) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)));
}

// The calendar day (YYYY-MM-DD) a scan was taken on, in the app's TIME_ZONE.
export function toScanDateString(measuredAt: Date): string {
  return getTodayString(measuredAt);
}

// arboleaf's "Weight Control" applied to the scan's own values, as goal targets. Its muscle
// figure is applied to skeletal muscle (the report doesn't say which muscle measure it means).
export function suggestedGoalTargets(scan: {
  weight_kg: number | null;
  body_fat_kg: number | null;
  skeletal_muscle_kg: number | null;
  report: BodyReport | null;
}): Partial<Record<GoalMetric, number>> {
  const control = scan.report?.weight_control;
  const targets: Partial<Record<GoalMetric, number>> = {};
  if (!control) return targets;
  const add = (metric: GoalMetric, base: number | null, change: number | null | undefined) => {
    if (base !== null && change !== null && change !== undefined) targets[metric] = round2(base + change);
  };
  add("weight_kg", scan.weight_kg, control.weight_kg);
  add("body_fat_kg", scan.body_fat_kg, control.fat_kg);
  add("skeletal_muscle_kg", scan.skeletal_muscle_kg, control.muscle_kg);
  return targets;
}
