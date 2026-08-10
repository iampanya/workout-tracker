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

export const signupSchema = z.object({
  username: usernameSchema,
  email: z.string().trim().email("Enter a valid email"),
  // Matches Supabase's minimum_password_length (config.toml).
  password: z.string().min(6, "Password must be at least 6 characters"),
  inviteCode: z.string().trim().min(1, "Invite code is required"),
});
