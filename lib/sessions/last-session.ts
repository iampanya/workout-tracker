// Pure helpers for the "last time" hint on the logging screen: what the user did for an
// exercise in their most recent completed session. DB-free so they run under `npm test`.

export type LastSessionSet = { weight_kg: number; reps: number; is_warmup: boolean };
export type LastSession = { sessionDate: string; sets: LastSessionSet[] };

// Working sets only; falls back to every set when the last session was all warmups.
function relevantSets(sets: LastSessionSet[]): LastSessionSet[] {
  const working = sets.filter((s) => !s.is_warmup);
  return working.length > 0 ? working : sets;
}

// [60×8, 60×8, 62.5×6] -> "60×8, 60×8, 62.5×6"
export function formatLastSets(sets: LastSessionSet[]): string {
  return relevantSets(sets)
    .map((s) => `${s.weight_kg}×${s.reps}`)
    .join(", ");
}

// Starting weight/reps for a new set: the first working set from last time, or null.
export function prefillFromLast(last: LastSession | null): { weight: string; reps: string } | null {
  if (!last) return null;
  const first = relevantSets(last.sets)[0];
  return first ? { weight: String(first.weight_kg), reps: String(first.reps) } : null;
}
