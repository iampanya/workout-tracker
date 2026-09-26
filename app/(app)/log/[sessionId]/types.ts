import type { LastSession } from "@/lib/sessions/last-session";

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
  prWeightKg: number | null;
  lastSession: LastSession | null;
  // Planned working sets when the session came from a routine that sets one (routine_exercises.target_sets).
  targetSets: number | null;
};

export type SetFormInput = { weight: string; reps: string; warmup: boolean };
export type SetValues = { weightKg: number; reps: number; isWarmup: boolean };

export const WEIGHT_STEP = 2.5;
export const REPS_STEP = 1;
