import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  backupFileSchema,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupFile,
} from "@/lib/validation";

export type ImportMode = "merge" | "replace";

// Per-table count of rows actually written by an import (skipped rows aren't counted).
export type ImportSummary = {
  exercises: number;
  routines: number;
  routine_exercises: number;
  sessions: number;
  session_exercises: number;
  sets: number;
};

// Gathers everything a user owns into the backup file shape. Only the columns
// import_backup reads are selected — `user_id` is deliberately omitted (import
// always stamps the caller's id). Presets (user_id IS NULL) are excluded by the
// `.eq("user_id", ...)` filter, which RLS narrows to the caller anyway.
export async function exportUserData(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<BackupFile> {
  const [exercises, routines, routineExercises, sessions, sessionExercises, sets] =
    await Promise.all([
      supabase
        .from("exercises")
        .select("id, name, muscle_group, is_archived, created_at")
        .eq("user_id", userId)
        .order("created_at"),
      supabase
        .from("routines")
        .select("id, name, notes, created_at, updated_at")
        .eq("user_id", userId)
        .order("created_at"),
      supabase
        .from("routine_exercises")
        .select("id, routine_id, exercise_id, position, target_sets")
        .eq("user_id", userId)
        .order("routine_id")
        .order("position"),
      supabase
        .from("sessions")
        .select("id, routine_id, name, session_date, started_at, completed_at, notes")
        .eq("user_id", userId)
        .order("started_at"),
      supabase
        .from("session_exercises")
        .select("id, session_id, exercise_id, position, notes")
        .eq("user_id", userId)
        .order("session_id")
        .order("position"),
      supabase
        .from("sets")
        .select(
          "id, session_exercise_id, exercise_id, set_number, weight_kg, reps, is_warmup, created_at"
        )
        .eq("user_id", userId)
        .order("session_exercise_id")
        .order("set_number"),
    ]);

  for (const result of [
    exercises,
    routines,
    routineExercises,
    sessions,
    sessionExercises,
    sets,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    data: {
      exercises: exercises.data ?? [],
      routines: routines.data ?? [],
      routine_exercises: routineExercises.data ?? [],
      sessions: sessions.data ?? [],
      session_exercises: sessionExercises.data ?? [],
      sets: sets.data ?? [],
    },
  };
}

// Validates the raw file, then hands the whole payload to the atomic
// import_backup RPC (a single transaction — see 0005_backup_import.sql).
export async function importUserData(
  supabase: SupabaseClient<Database>,
  rawFile: unknown,
  mode: ImportMode
): Promise<ImportSummary> {
  const parsed = backupFileSchema.safeParse(rawFile);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid backup file");
  }

  const { data, error } = await supabase.rpc("import_backup", {
    payload: parsed.data as unknown as Json,
    mode,
  });
  if (error) throw new Error(error.message);
  return data as unknown as ImportSummary;
}
