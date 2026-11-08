// Next-session target for one exercise (double progression): add reps at the same weight until
// every top set reaches the top of the rep range, then add weight and start again at the
// bottom. Pure and DB-free so it runs under `npm test` and in the browser.
import type { LastSession } from "@/lib/sessions/last-session";

export type RepRange = { min: number; max: number };
export type TargetReason = "addReps" | "addWeight" | "reset" | "repsOnly";
export type NextTarget = { weightKg: number; reps: number; reason: TargetReason };

// Used when the session didn't come from a routine, or the routine entry has no range.
export const DEFAULT_REP_RANGE: RepRange = { min: 8, max: 12 };

// Choices on the routine page.
export const REP_RANGE_PRESETS: RepRange[] = [
  { min: 3, max: 5 },
  { min: 5, max: 8 },
  { min: 6, max: 10 },
  { min: 8, max: 12 },
  { min: 10, max: 15 },
  { min: 12, max: 20 },
  { min: 15, max: 25 },
];

const STEP_BY_GROUP: Record<string, number> = { Legs: 5, Chest: 2.5, Back: 2.5 };

// Muscle-group default weight step, used when an exercise has no custom step and too little
// history (resolveWeightStep). Big lower-body lifts move faster.
export function stepFor(muscleGroup: string | null): number {
  return STEP_BY_GROUP[muscleGroup ?? ""] ?? 1.25;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Where the weight step for an exercise came from. "custom" = set by the user
// (exercise_settings), "history" = inferred from the weights they have logged, "default" = stepFor.
export type WeightStepSource = "custom" | "history" | "default";
// kg = the step in use; autoKg/autoSource = what it would be with no custom value.
export type WeightStep = {
  kg: number;
  source: WeightStepSource;
  autoKg: number;
  autoSource: "history" | "default";
};

// Chips in WeightStepSheet: dumbbell racks (1, 2, 2.5), fractional plates (1.25), lb-based stacks
// (4.5 ≈ 10 lb), plate pairs and stacks (5, 10).
export const WEIGHT_STEP_PRESETS = [1, 1.25, 2, 2.5, 4.5, 5, 10];

// Inference plausibility gate: the most common gap is only believed when it shows up at least
// MIN_GAP_OCCURRENCES times and is no larger than the biggest preset (a 20 kg "step" is a ramp-up
// or a sparse history, not a progression step).
export const MIN_GAP_OCCURRENCES = 2;
export const MAX_INFERRED_STEP = Math.max(...WEIGHT_STEP_PRESETS);

// The most common gap between neighbouring distinct weights (tie → the smaller gap), or null when
// there is none that passes the gate above. The mode rather than the smallest gap, so one typo
// needs to be outvoted rather than winning outright. `weights` should be per-session top weights.
export function inferStepFromWeights(weights: number[]): number | null {
  const distinct = [...new Set(weights.filter((w) => w > 0))].sort((a, b) => a - b);
  if (distinct.length < 2) return null;
  const counts = new Map<number, number>();
  for (let i = 1; i < distinct.length; i++) {
    const gap = round2(distinct[i] - distinct[i - 1]);
    counts.set(gap, (counts.get(gap) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [gap, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && gap < best)) {
      best = gap;
      bestCount = count;
    }
  }
  if (best === null || bestCount < MIN_GAP_OCCURRENCES || best > MAX_INFERRED_STEP) return null;
  return best;
}

// custom → inferred from per-session top weights → muscle-group default.
export function resolveWeightStep({
  customKg,
  loggedWeights,
  muscleGroup,
}: {
  customKg: number | null;
  loggedWeights: number[];
  muscleGroup: string | null;
}): WeightStep {
  const inferred = inferStepFromWeights(loggedWeights);
  const autoKg = inferred ?? stepFor(muscleGroup);
  const autoSource = inferred !== null ? "history" : "default";
  return customKg !== null
    ? { kg: customKg, source: "custom", autoKg, autoSource }
    : { kg: autoKg, source: autoSource, autoKg, autoSource };
}

// A session's working sets at its heaviest working weight, or null when it had none.
function topSets(session: LastSession): { weight: number; lowestReps: number; allReps: number[] } | null {
  const working = session.sets.filter((s) => !s.is_warmup);
  if (working.length === 0) return null;
  const weight = Math.max(...working.map((s) => s.weight_kg));
  const allReps = working.filter((s) => s.weight_kg === weight).map((s) => s.reps);
  return { weight, lowestReps: Math.min(...allReps), allReps };
}

// `recent` = the exercise's last completed sessions, newest first (only the first two matter).
export function nextTarget(recent: LastSession[], range: RepRange, step: number): NextTarget | null {
  const [newest, previous] = recent.map(topSets).filter((t) => t !== null);
  if (!newest) return null;

  if (newest.weight === 0) {
    return { weightKg: 0, reps: newest.lowestReps + 1, reason: "repsOnly" };
  }
  if (newest.allReps.every((reps) => reps >= range.max)) {
    return { weightKg: round2(newest.weight + step), reps: range.min, reason: "addWeight" };
  }
  // Two sessions stuck below the range at the same weight with no rep gained: back off.
  if (
    previous &&
    previous.weight === newest.weight &&
    newest.lowestReps < range.min &&
    previous.lowestReps < range.min &&
    newest.lowestReps <= previous.lowestReps
  ) {
    return { weightKg: Math.max(round2(newest.weight - step), 0), reps: range.min, reason: "reset" };
  }
  return { weightKg: newest.weight, reps: Math.min(newest.lowestReps + 1, range.max), reason: "addReps" };
}

// <select> value for a range ("" = use the default).
export function repRangeValue(range: RepRange | null): string {
  return range ? `${range.min}-${range.max}` : "";
}

export function parseRepRange(value: string): RepRange | null {
  const match = /^(\d+)-(\d+)$/.exec(value);
  if (!match) return null;
  const range = { min: Number(match[1]), max: Number(match[2]) };
  return range.min <= range.max ? range : null;
}
