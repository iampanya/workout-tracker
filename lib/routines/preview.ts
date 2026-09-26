// "5 exercises · Bench Press, Squat, Row…" for routine list rows. Pure (no DB) so it runs
// under `npm test`; the names come from listRoutines' first-N preview.
export function routinePreview(routine: { exerciseCount: number; exerciseNames: string[] }): string {
  if (routine.exerciseCount === 0) return "No exercises yet";
  const count = `${routine.exerciseCount} ${routine.exerciseCount === 1 ? "exercise" : "exercises"}`;
  const more = routine.exerciseCount > routine.exerciseNames.length ? "…" : "";
  return `${count} · ${routine.exerciseNames.join(", ")}${more}`;
}
