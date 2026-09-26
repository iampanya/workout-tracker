export function isNewPr(weightKg: number, priorMaxKg: number | null): boolean {
  return priorMaxKg === null || weightKg > priorMaxKg;
}

// Estimated one-rep max (Epley): weight × (1 + reps / 30), a single rep is the weight itself.
// Rounded to the nearest 0.5 kg. Lets a heavy set for reps compare against a true single.
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 2) / 2;
}
