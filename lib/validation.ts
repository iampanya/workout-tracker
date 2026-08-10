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
