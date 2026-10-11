import type { LastSession } from "@/lib/sessions/last-session";
import type { PrRecord } from "@/lib/pr";

export type SetEntry = {
  id: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  is_warmup: boolean;
  pending?: boolean;
};

export type ExerciseEntry = {
  sessionExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  sets: SetEntry[];
  pr: PrRecord | null;
  // dateLabel is formatted on the server (ICU differs between Node and the browser, which would
  // break hydration); it is absent for exercises added client-side after load.
  lastSession: (LastSession & { dateLabel?: string }) | null;
  // Planned working sets when the session came from a routine that sets one (routine_exercises.target_sets).
  targetSets: number | null;
};

export type SetFormInput = { weight: string; reps: string; warmup: boolean };
export type SetValues = { weightKg: number; reps: number; isWarmup: boolean };

export const WEIGHT_STEP = 2.5;
export const REPS_STEP = 1;
