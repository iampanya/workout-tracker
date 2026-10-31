import type { BodyScanInput } from "./schema";

// A synthetic scan shaped like an arboleaf report (not a real person's numbers), for tests.
export function sampleScan(overrides: Partial<BodyScanInput> = {}): BodyScanInput {
  return {
    measured_at: "2026-10-18T09:58:00+07:00",
    weight_kg: 80,
    bmi: 24.7,
    body_fat_pct: 22,
    body_fat_kg: 17.6,
    skeletal_muscle_kg: 35,
    skeletal_muscle_pct: 43.8,
    muscle_mass_pct: 72.5,
    soft_lean_mass_kg: 58,
    fat_free_mass_kg: 62.4,
    body_water_l: 45.5,
    body_water_pct: 56.9,
    protein_kg: 12.4,
    protein_pct: 15.5,
    bone_mass_kg: 4,
    bone_mass_pct: 5,
    visceral_fat: 8,
    subcutaneous_fat_pct: 19.5,
    subcutaneous_fat_kg: 15.6,
    bmr_kcal: 1720,
    smi: 8.4,
    waist_hip_ratio: 0.9,
    fitness_score: 72,
    height_cm: 180,
    age: 35,
    segments: {
      left_arm: { lean_kg: 3.4, lean_pct: 98, lean_eval: "Sufficient", fat_kg: 0.9, fat_pct: 140, fat_eval: "Sufficient", muscle_ratio_pct: 4.3, fat_ratio_pct: 1.1 },
      right_arm: { lean_kg: 3.6, lean_pct: 101, lean_eval: "Sufficient", fat_kg: 0.9, fat_pct: 140, fat_eval: "Sufficient", muscle_ratio_pct: 4.5, fat_ratio_pct: 1.1 },
      trunk: { lean_kg: 28, lean_pct: 99, lean_eval: "Sufficient", fat_kg: 9, fat_pct: 200, fat_eval: "Over", muscle_ratio_pct: 35, fat_ratio_pct: 11.3 },
      left_leg: { lean_kg: 10, lean_pct: 103, lean_eval: "Sufficient", fat_kg: 2.7, fat_pct: 145, fat_eval: "Sufficient", muscle_ratio_pct: 12.5, fat_ratio_pct: 3.4 },
      right_leg: { lean_kg: 10.4, lean_pct: 104, lean_eval: "Sufficient", fat_kg: 2.7, fat_pct: 145, fat_eval: "Sufficient", muscle_ratio_pct: 13, fat_ratio_pct: 3.4 },
    },
    report: {
      ranges: { weight_kg: [60, 81], body_fat_pct: [10, 20], waist_hip_ratio: [null, 0.9] },
      evaluations: { body_fat_pct: "Mild obesity", bmi: "Normal" },
      assessments: { "Lower extremity balance": "Slightly uneven" },
      weight_control: { normal_weight_kg: 74, weight_kg: -6, fat_kg: -7, muscle_kg: 1 },
      advice: "Combine strength training with cardio.",
    },
    ...overrides,
  };
}
