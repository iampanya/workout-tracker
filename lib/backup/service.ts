import { Prisma, type PrismaClient } from "@prisma/client";
import { toDateOnlyString } from "@/lib/date";
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


// Gathers everything a user owns into the backup file shape. user_id is omitted (import always
// stamps the caller's id). Presets (user_id IS NULL) are excluded by the user_id filter.
// Timestamps are serialized to strings and weight_kg to a number to match backupFileSchema.
export async function exportUserData(db: PrismaClient, userId: string): Promise<BackupFile> {
  const [exercises, routines, routineExercises, sessions, sessionExercises, sets] =
    await Promise.all([
      db.exercises.findMany({
        where: { user_id: userId },
        orderBy: { created_at: "asc" },
        select: { id: true, name: true, muscle_group: true, is_archived: true, created_at: true },
      }),
      db.routines.findMany({
        where: { user_id: userId },
        orderBy: { created_at: "asc" },
        select: { id: true, name: true, notes: true, created_at: true, updated_at: true },
      }),
      db.routine_exercises.findMany({
        where: { user_id: userId },
        orderBy: [{ routine_id: "asc" }, { position: "asc" }],
        select: { id: true, routine_id: true, exercise_id: true, position: true, target_sets: true },
      }),
      db.sessions.findMany({
        where: { user_id: userId },
        orderBy: { started_at: "asc" },
        select: {
          id: true,
          routine_id: true,
          name: true,
          session_date: true,
          started_at: true,
          completed_at: true,
          notes: true,
        },
      }),
      db.session_exercises.findMany({
        where: { user_id: userId },
        orderBy: [{ session_id: "asc" }, { position: "asc" }],
        select: { id: true, session_id: true, exercise_id: true, position: true, notes: true },
      }),
      db.sets.findMany({
        where: { user_id: userId },
        orderBy: [{ session_exercise_id: "asc" }, { set_number: "asc" }],
        select: {
          id: true,
          session_exercise_id: true,
          exercise_id: true,
          set_number: true,
          weight_kg: true,
          reps: true,
          is_warmup: true,
          created_at: true,
        },
      }),
    ]);

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    data: {
      exercises: exercises.map((e) => ({ ...e, created_at: e.created_at.toISOString() })),
      routines: routines.map((r) => ({
        ...r,
        created_at: r.created_at.toISOString(),
        updated_at: r.updated_at.toISOString(),
      })),
      routine_exercises: routineExercises,
      sessions: sessions.map((s) => ({
        ...s,
        session_date: toDateOnlyString(s.session_date),
        started_at: s.started_at.toISOString(),
        completed_at: s.completed_at ? s.completed_at.toISOString() : null,
      })),
      session_exercises: sessionExercises,
      sets: sets.map((s) => ({
        ...s,
        weight_kg: Number(s.weight_kg),
        created_at: s.created_at.toISOString(),
      })),
    },
  };
}

// Validates the raw file, then hands the whole payload to the atomic import_backup function
// (one transaction — see 0009_import_backup_userid_param.sql). The user id is passed explicitly
// since the direct connection has no auth.uid().
export async function importUserData(
  db: PrismaClient,
  userId: string,
  rawFile: unknown,
  mode: ImportMode
): Promise<ImportSummary> {
  const parsed = backupFileSchema.safeParse(rawFile);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid backup file");
  }

  const rows = await db.$queryRaw<{ import_backup: ImportSummary }[]>(Prisma.sql`
    select public.import_backup(${JSON.stringify(parsed.data)}::jsonb, ${mode}, ${userId}::uuid) as import_backup`);
  return rows[0].import_backup;
}
