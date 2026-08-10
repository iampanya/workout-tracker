import { describe, it, expect } from "vitest";
import {
  createExerciseSchema,
  createRoutineSchema,
  addRoutineExerciseSchema,
  startSessionSchema,
  logSetSchema,
} from "./validation";

describe("createExerciseSchema", () => {
  it("accepts a valid custom exercise", () => {
    const result = createExerciseSchema.safeParse({ name: "Cable Fly", muscleGroup: "Chest" });
    expect(result.success).toBe(true);
  });
  it("rejects an empty name", () => {
    const result = createExerciseSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
  it("rejects a missing muscle group", () => {
    const result = createExerciseSchema.safeParse({ name: "Cable Fly" });
    expect(result.success).toBe(false);
  });
  it("rejects a muscle group outside the fixed set", () => {
    const result = createExerciseSchema.safeParse({ name: "Cable Fly", muscleGroup: "Cardio" });
    expect(result.success).toBe(false);
  });
});

describe("createRoutineSchema", () => {
  it("accepts a name-only routine", () => {
    expect(createRoutineSchema.safeParse({ name: "Push Day" }).success).toBe(true);
  });
  it("rejects a missing name", () => {
    expect(createRoutineSchema.safeParse({}).success).toBe(false);
  });
});

describe("addRoutineExerciseSchema", () => {
  it("accepts a valid entry", () => {
    const result = addRoutineExerciseSchema.safeParse({
      routineId: "11111111-1111-4111-b111-111111111111",
      exerciseId: "22222222-2222-4222-b222-222222222222",
      position: 0,
    });
    expect(result.success).toBe(true);
  });
  it("rejects a negative position", () => {
    const result = addRoutineExerciseSchema.safeParse({
      routineId: "11111111-1111-4111-b111-111111111111",
      exerciseId: "22222222-2222-4222-b222-222222222222",
      position: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("startSessionSchema", () => {
  it("accepts a freeform session with a date", () => {
    expect(startSessionSchema.safeParse({ sessionDate: "2026-01-05" }).success).toBe(true);
  });
  it("rejects a malformed date", () => {
    expect(startSessionSchema.safeParse({ sessionDate: "01/05/2026" }).success).toBe(false);
  });
});

describe("logSetSchema", () => {
  it("accepts a valid set", () => {
    const result = logSetSchema.safeParse({
      sessionExerciseId: "11111111-1111-4111-b111-111111111111",
      weightKg: 100,
      reps: 5,
      isWarmup: false,
    });
    expect(result.success).toBe(true);
  });
  it("rejects zero or negative weight", () => {
    const result = logSetSchema.safeParse({
      sessionExerciseId: "11111111-1111-4111-b111-111111111111",
      weightKg: 0,
      reps: 5,
      isWarmup: false,
    });
    expect(result.success).toBe(false);
  });
  it("rejects zero or negative reps", () => {
    const result = logSetSchema.safeParse({
      sessionExerciseId: "11111111-1111-4111-b111-111111111111",
      weightKg: 100,
      reps: 0,
      isWarmup: false,
    });
    expect(result.success).toBe(false);
  });
});
