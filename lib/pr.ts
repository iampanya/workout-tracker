export function isNewPr(weightKg: number, priorMaxKg: number | null): boolean {
  return priorMaxKg === null || weightKg > priorMaxKg;
}
