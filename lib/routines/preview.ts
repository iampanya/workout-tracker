// The names part of a routine row's preview, "Bench Press, Squat, Row…" (the count is rendered
// by the caller via the `common.exercises` message). null for an empty routine. Pure (no DB) so
// it runs under `npm test`; the names come from listRoutines' first-N preview.
export function routinePreviewNames(routine: {
  exerciseCount: number;
  exerciseNames: string[];
}): string | null {
  if (routine.exerciseCount === 0) return null;
  const more = routine.exerciseCount > routine.exerciseNames.length ? "…" : "";
  return `${routine.exerciseNames.join(", ")}${more}`;
}
