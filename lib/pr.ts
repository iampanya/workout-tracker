// A PR is the heaviest working set, ties at that weight broken by more reps — so it's the pair,
// not just the weight (see CONTEXT.md "PR").
export type PrRecord = { weightKg: number; reps: number };

// Heavier wins; at equal weight, more reps wins. An exact tie is not better.
export function isBetterSet(a: PrRecord, b: PrRecord): boolean {
  return a.weightKg > b.weightKg || (a.weightKg === b.weightKg && a.reps > b.reps);
}

export function isNewPr(candidate: PrRecord, prior: PrRecord | null): boolean {
  return prior === null || isBetterSet(candidate, prior);
}

// "100 kg × 6"
export function formatPr(pr: PrRecord): string {
  return `${pr.weightKg} kg × ${pr.reps}`;
}

// Estimated one-rep max (Epley): weight × (1 + reps / 30), a single rep is the weight itself.
// Rounded to the nearest 0.5 kg. Lets a heavy set for reps compare against a true single.
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 2) / 2;
}
