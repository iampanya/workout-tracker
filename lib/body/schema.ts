import { z } from "zod";

// Import format for body-composition scans. Claude Code reads a scale's PDF export and writes
// this JSON (see .claude/skills/arboleaf-to-json); the /body page validates it with this schema
// on the client (preview) and again in the server action. Keys are the body_scans column names.

export const BODY_IMPORT_VERSION = 1;

// Every numeric metric column on body_scans, in report order.
export const SCAN_METRIC_KEYS = [
  "weight_kg",
  "bmi",
  "body_fat_pct",
  "body_fat_kg",
  "skeletal_muscle_kg",
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
  "visceral_fat",
  "subcutaneous_fat_pct",
  "subcutaneous_fat_kg",
  "bmr_kcal",
  "smi",
  "waist_hip_ratio",
  "fitness_score",
  "height_cm",
  "age",
] as const;
export type ScanMetricKey = (typeof SCAN_METRIC_KEYS)[number];

export const SEGMENT_KEYS = ["left_arm", "right_arm", "trunk", "left_leg", "right_leg"] as const;
export type SegmentKey = (typeof SEGMENT_KEYS)[number];

// Metrics a goal can target. A user has at most one of the two fat metrics as a goal.
export const GOAL_METRICS = ["weight_kg", "body_fat_pct", "body_fat_kg", "skeletal_muscle_kg"] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];
export const FAT_GOAL_METRICS: readonly GoalMetric[] = ["body_fat_pct", "body_fat_kg"];

const num = z.number();
// Missing and null both mean "the scale didn't report it".
const optNum = num.nullable().optional();
const optText = z.string().nullable().optional();

const segmentSchema = z.object({
  lean_kg: optNum,
  lean_pct: optNum,
  lean_eval: optText,
  fat_kg: optNum,
  fat_pct: optNum,
  fat_eval: optText,
  muscle_ratio_pct: optNum,
  fat_ratio_pct: optNum,
});
export type BodySegment = z.infer<typeof segmentSchema>;

const segmentsSchema = z.object({
  left_arm: segmentSchema.optional(),
  right_arm: segmentSchema.optional(),
  trunk: segmentSchema.optional(),
  left_leg: segmentSchema.optional(),
  right_leg: segmentSchema.optional(),
});
export type BodySegments = z.infer<typeof segmentsSchema>;

const reportSchema = z.object({
  // Normal range per metric key; an open end is null ("<=0.9" -> [null, 0.9]).
  ranges: z.record(z.string(), z.tuple([num.nullable(), num.nullable()])).optional(),
  // The report's verdict per metric key, verbatim (e.g. { body_fat_pct: "Mild obesity" }).
  evaluations: z.record(z.string(), z.string()).optional(),
  // The report's other checklist rows, its own label -> verdict (e.g. body balance/strength).
  assessments: z.record(z.string(), z.string()).optional(),
  // arboleaf "Weight Control": the signed change it suggests for each.
  weight_control: z
    .object({ normal_weight_kg: optNum, weight_kg: optNum, fat_kg: optNum, muscle_kg: optNum })
    .optional(),
  advice: z.string().optional(),
});
export type BodyReport = z.infer<typeof reportSchema>;

export const bodyScanInputSchema = z.object({
  // Scan time with its UTC offset ("2026-10-18T09:58:00+07:00") or Z; naive times are rejected
  // because they'd be read in whatever zone the server runs in.
  measured_at: z.iso.datetime({ offset: true }),
  weight_kg: num.positive(),
  bmi: optNum,
  body_fat_pct: optNum,
  body_fat_kg: optNum,
  skeletal_muscle_kg: optNum,
  skeletal_muscle_pct: optNum,
  muscle_mass_pct: optNum,
  soft_lean_mass_kg: optNum,
  fat_free_mass_kg: optNum,
  body_water_l: optNum,
  body_water_pct: optNum,
  protein_kg: optNum,
  protein_pct: optNum,
  bone_mass_kg: optNum,
  bone_mass_pct: optNum,
  visceral_fat: optNum,
  subcutaneous_fat_pct: optNum,
  subcutaneous_fat_kg: optNum,
  bmr_kcal: optNum,
  smi: optNum,
  waist_hip_ratio: optNum,
  fitness_score: optNum,
  height_cm: optNum,
  age: optNum,
  segments: segmentsSchema.nullable().optional(),
  report: reportSchema.nullable().optional(),
});
export type BodyScanInput = z.infer<typeof bodyScanInputSchema>;

export const bodyImportFileSchema = z.object({
  version: z.literal(BODY_IMPORT_VERSION),
  source: z.string().trim().min(1).max(50).default("arboleaf"),
  scans: z.array(bodyScanInputSchema).min(1).max(500),
});
export type BodyImportFile = z.infer<typeof bodyImportFileSchema>;

export type BodyImportErrorCode = "invalidJson" | "invalidFile" | "unsupportedVersion";
export type BodyImportParse = { ok: true; data: BodyImportFile } | { ok: false; code: BodyImportErrorCode };

export function parseBodyImport(raw: unknown): BodyImportParse {
  // Only a version that's present but different is "unsupported"; a file with no version at all
  // isn't one of ours.
  const version = typeof raw === "object" && raw !== null ? (raw as { version?: unknown }).version : undefined;
  if (version !== undefined && version !== BODY_IMPORT_VERSION) return { ok: false, code: "unsupportedVersion" };
  const parsed = bodyImportFileSchema.safeParse(raw);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, code: "invalidFile" };
}

export function parseBodyImportText(text: string): BodyImportParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, code: "invalidJson" };
  }
  return parseBodyImport(raw);
}

export const bodyGoalsInputSchema = z
  .array(z.object({ metric: z.enum(GOAL_METRICS), target: num.positive() }))
  .max(3)
  .refine((goals) => new Set(goals.map((g) => g.metric)).size === goals.length, "duplicateMetric")
  .refine((goals) => goals.filter((g) => FAT_GOAL_METRICS.includes(g.metric)).length <= 1, "oneFatGoal");
export type BodyGoalInput = z.infer<typeof bodyGoalsInputSchema>[number];
