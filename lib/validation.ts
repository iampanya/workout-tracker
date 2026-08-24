import { z } from "zod";

export const createExerciseSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  muscleGroup: z.enum(["Chest", "Back", "Legs", "Shoulders", "Arms", "Core"]),
});

export const createRoutineSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  notes: z.string().trim().max(500).optional(),
});

export const addRoutineExerciseSchema = z.object({
  routineId: z.string().uuid(),
  exerciseId: z.string().uuid(),
  position: z.number().int().min(0),
  targetSets: z.number().int().min(1).optional(),
});

export const startSessionSchema = z.object({
  routineId: z.string().uuid().optional(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  name: z.string().trim().max(100).optional(),
});

export const logSetSchema = z.object({
  sessionExerciseId: z.string().uuid(),
  weightKg: z.number().positive().max(999.99),
  reps: z.number().int().positive().max(999),
  isWarmup: z.boolean(),
});

export const updateSetSchema = z.object({
  weightKg: z.number().positive().max(999.99),
  reps: z.number().int().positive().max(999),
  isWarmup: z.boolean(),
});

// Usernames are the login handle: 3–30 chars, letters/digits/underscore, stored and
// compared lowercased (accept mixed-case input, normalize to lowercase).
export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be at most 30 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Use only letters, numbers, and underscores")
  .transform((value) => value.toLowerCase());

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "Password is required"),
});

// --- Backup file (Export/Import) ---------------------------------------------
// Shape of the JSON produced by the Export button and accepted by Import. Row
// schemas stay permissive on the exact column set (extra keys are stripped by
// default) but strict on the identifiers/types the import RPC relies on, so a
// truncated or foreign file is rejected with a clear message before it reaches
// the database. `user_id` is intentionally absent — import always stamps the
// caller's id (see import_backup in 0005_backup_import.sql).
const backupExercise = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  muscle_group: z.string().nullable(),
  is_archived: z.boolean(),
  created_at: z.string(),
});

const backupRoutine = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const backupRoutineExercise = z.object({
  id: z.string().uuid(),
  routine_id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  position: z.number().int(),
  target_sets: z.number().int().nullable(),
});

const backupSession = z.object({
  id: z.string().uuid(),
  routine_id: z.string().uuid().nullable(),
  name: z.string().nullable(),
  session_date: z.string(),
  started_at: z.string(),
  completed_at: z.string().nullable(),
  notes: z.string().nullable(),
});

const backupSessionExercise = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  position: z.number().int(),
  notes: z.string().nullable(),
});

const backupSet = z.object({
  id: z.string().uuid(),
  session_exercise_id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  set_number: z.number().int(),
  weight_kg: z.number(),
  reps: z.number().int(),
  is_warmup: z.boolean(),
  created_at: z.string(),
});

export const BACKUP_FORMAT = "workout-tracker-backup";
export const BACKUP_VERSION = 1;

export const backupFileSchema = z.object({
  format: z.literal(BACKUP_FORMAT, { message: "This file isn't a workout-tracker backup" }),
  version: z.literal(BACKUP_VERSION, { message: "Unsupported backup version" }),
  exported_at: z.string(),
  data: z.object({
    exercises: z.array(backupExercise),
    routines: z.array(backupRoutine),
    routine_exercises: z.array(backupRoutineExercise),
    sessions: z.array(backupSession),
    session_exercises: z.array(backupSessionExercise),
    sets: z.array(backupSet),
  }),
});

export type BackupFile = z.infer<typeof backupFileSchema>;

export const signupSchema = z.object({
  username: usernameSchema,
  email: z.string().trim().email("Enter a valid email"),
  // Matches Supabase's minimum_password_length (config.toml).
  password: z.string().min(6, "Password must be at least 6 characters"),
  inviteCode: z.string().trim().min(1, "Invite code is required"),
});
