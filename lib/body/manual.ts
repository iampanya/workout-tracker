import { z } from "zod";
import { SCAN_METRIC_KEYS, type ScanMetricKey } from "./schema";

// A scan typed in on /body (source "manual") for people without an arboleaf scale. Fat mass is
// derived from weight × fat %, so it isn't a field; everything except weight is optional.

// Shown up front — the same four as the /body snapshot.
export const MANUAL_MAIN_KEYS = [
  "weight_kg",
  "body_fat_pct",
  "skeletal_muscle_kg",
  "visceral_fat",
] as const satisfies readonly ScanMetricKey[];

// Behind "More values", in report order. Together with the main keys this is every metric
// except body_fat_kg (manual.test.ts checks that).
export const MANUAL_MORE_KEYS = [
  "bmi",
  "skeletal_muscle_pct",
  "muscle_mass_pct",
  "soft_lean_mass_kg",
  "fat_free_mass_kg",
  "body_water_l",
  "body_water_pct",
  "protein_kg",
  "protein_pct",
  "bone_mass_kg",
  "bone_mass_pct",
  "subcutaneous_fat_pct",
  "subcutaneous_fat_kg",
  "bmr_kcal",
  "smi",
  "waist_hip_ratio",
  "fitness_score",
  "height_cm",
  "age",
] as const satisfies readonly ScanMetricKey[];

const value = z.number().nonnegative().nullable().optional();
const pct = z.number().nonnegative().max(100).nullable().optional();

export const manualScanInputSchema = z.object({
  // Same rule as the import: the offset is required so the server never guesses the zone.
  measured_at: z.iso.datetime({ offset: true }),
  weight_kg: z.number().positive(),
  ...(Object.fromEntries(
    [...MANUAL_MAIN_KEYS.slice(1), ...MANUAL_MORE_KEYS].map((key) => [key, key.endsWith("_pct") ? pct : value])
  ) as Record<Exclude<(typeof MANUAL_MAIN_KEYS)[number], "weight_kg"> | (typeof MANUAL_MORE_KEYS)[number], typeof value>),
});
export type ManualScanInput = z.infer<typeof manualScanInputSchema>;

const round2 = (value: number) => Math.round(value * 100) / 100;

export type ManualMetrics = Record<ScanMetricKey, number | null> & { weight_kg: number };

// Every metric column (null when blank), with body_fat_kg derived from weight × fat %.
export function deriveManualMetrics(input: ManualScanInput): ManualMetrics {
  const metrics = {} as Record<ScanMetricKey, number | null>;
  for (const key of SCAN_METRIC_KEYS) {
    metrics[key] = key === "body_fat_kg" ? null : (input[key] ?? null);
  }
  if (input.body_fat_pct != null) metrics.body_fat_kg = round2((input.weight_kg * input.body_fat_pct) / 100);
  return { ...metrics, weight_kg: input.weight_kg };
}
