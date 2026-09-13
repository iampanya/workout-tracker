import "dotenv/config";
import { describe, it, expect, beforeAll } from "vitest";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { prisma } from "@/lib/db";
import { createCustomExerciseForUser } from "@/lib/exercises/service";
import {
  listRoutines,
  createRoutineForUser,
  deleteRoutineForUser,
  getRoutineWithExercises,
  addExerciseToRoutineForUser,
  removeRoutineExerciseForUser,
  moveRoutineExerciseForUser,
} from "./service";

describe("routines service", () => {
  const admin = createAdminClient();
  let userId: string;
  let benchId: string;
  let squatId: string;

  beforeAll(async () => {
    userId = (await createTestUser(admin)).userId;

    const { data: presets } = await admin.from("exercises").select("id, name").eq("is_preset", true);
    benchId = presets!.find((e) => e.name === "Bench Press")!.id;
    squatId = presets!.find((e) => e.name === "Squat")!.id;
  });

  it("creates and lists a routine", async () => {
    const routine = await createRoutineForUser(prisma, userId, { name: "Push Day" });
    expect(routine.user_id).toBe(userId);
    const routines = await listRoutines(prisma, userId);
    expect(routines.some((r) => r.id === routine.id)).toBe(true);
  });

  it("adds exercises to a routine at sequential positions", async () => {
    const routine = await createRoutineForUser(prisma, userId, { name: "Full Body" });
    const first = await addExerciseToRoutineForUser(prisma, userId, {
      routineId: routine.id,
      exerciseId: benchId,
    });
    const second = await addExerciseToRoutineForUser(prisma, userId, {
      routineId: routine.id,
      exerciseId: squatId,
    });
    expect(first.position).toBe(0);
    expect(second.position).toBe(1);

    const { exercises } = await getRoutineWithExercises(prisma, userId, routine.id);
    expect(exercises.map((e) => e.exercise.name)).toEqual(["Bench Press", "Squat"]);
  });

  it("moves an exercise up, swapping positions with its neighbor", async () => {
    const routine = await createRoutineForUser(prisma, userId, { name: "Reorder Test" });
    await addExerciseToRoutineForUser(prisma, userId, { routineId: routine.id, exerciseId: benchId });
    const second = await addExerciseToRoutineForUser(prisma, userId, {
      routineId: routine.id,
      exerciseId: squatId,
    });

    await moveRoutineExerciseForUser(prisma, userId, second.id, "up");

    const { exercises } = await getRoutineWithExercises(prisma, userId, routine.id);
    expect(exercises.map((e) => e.exercise.name)).toEqual(["Squat", "Bench Press"]);
  });

  it("does nothing when moving the first exercise up", async () => {
    const routine = await createRoutineForUser(prisma, userId, { name: "Edge Case" });
    const first = await addExerciseToRoutineForUser(prisma, userId, {
      routineId: routine.id,
      exerciseId: benchId,
    });
    await moveRoutineExerciseForUser(prisma, userId, first.id, "up");
    const { exercises } = await getRoutineWithExercises(prisma, userId, routine.id);
    expect(exercises[0].id).toBe(first.id);
  });

  it("removes an exercise from a routine", async () => {
    const routine = await createRoutineForUser(prisma, userId, { name: "Remove Test" });
    const entry = await addExerciseToRoutineForUser(prisma, userId, {
      routineId: routine.id,
      exerciseId: benchId,
    });
    await removeRoutineExerciseForUser(prisma, userId, entry.id);
    const { exercises } = await getRoutineWithExercises(prisma, userId, routine.id);
    expect(exercises).toHaveLength(0);
  });

  it("deleting a routine cascades to its routine_exercises", async () => {
    const routine = await createRoutineForUser(prisma, userId, { name: "Delete Test" });
    await addExerciseToRoutineForUser(prisma, userId, { routineId: routine.id, exerciseId: benchId });
    await deleteRoutineForUser(prisma, userId, routine.id);
    const { data } = await admin.from("routine_exercises").select("id").eq("routine_id", routine.id);
    expect(data).toEqual([]);
  });

  it("adds a new exercise after removing a middle one, without a position collision", async () => {
    // Regression test: positions [0,1,2], remove the middle one -> [0,2] remain.
    // A naive count(*)-based position calculation would compute position 2 for the
    // next insert, colliding with the unique(routine_id, position) constraint.
    const routine = await createRoutineForUser(prisma, userId, { name: "Position Gap Test" });
    const customExercise = await createCustomExerciseForUser(prisma, userId, {
      name: `Position Gap Exercise ${Date.now()}-${Math.random().toString(36).slice(2)}`,
      muscleGroup: "Chest",
    });

    await addExerciseToRoutineForUser(prisma, userId, {
      routineId: routine.id,
      exerciseId: benchId,
    });
    const second = await addExerciseToRoutineForUser(prisma, userId, {
      routineId: routine.id,
      exerciseId: squatId,
    });
    await addExerciseToRoutineForUser(prisma, userId, {
      routineId: routine.id,
      exerciseId: customExercise.id,
    });

    await removeRoutineExerciseForUser(prisma, userId, second.id);

    await expect(
      addExerciseToRoutineForUser(prisma, userId, {
        routineId: routine.id,
        exerciseId: squatId,
      })
    ).resolves.not.toThrow();
  });

  it("rejects adding an exercise to another user's routine", async () => {
    const routine = await createRoutineForUser(prisma, userId, { name: "Owned By Victim" });

    const attacker = await createTestUser(admin);

    await expect(
      addExerciseToRoutineForUser(prisma, attacker.userId, {
        routineId: routine.id,
        exerciseId: benchId,
      })
    ).rejects.toThrow();

    const { exercises } = await getRoutineWithExercises(prisma, userId, routine.id);
    expect(exercises).toHaveLength(0);
  });
});
