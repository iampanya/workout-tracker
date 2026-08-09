import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
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
import type { Database } from "@/lib/supabase/database.types";

describe("routines service", () => {
  const admin = createAdminClient();
  let userId: string;
  let client: SupabaseClient<Database>;
  let benchId: string;
  let squatId: string;

  beforeAll(async () => {
    const testUser = await createTestUser(admin);
    userId = testUser.userId;
    client = testUser.client;

    const { data: presets } = await admin.from("exercises").select("id, name").eq("is_preset", true);
    benchId = presets!.find((e) => e.name === "Bench Press")!.id;
    squatId = presets!.find((e) => e.name === "Squat")!.id;
  });

  it("creates and lists a routine", async () => {
    const routine = await createRoutineForUser(client, userId, { name: "Push Day" });
    expect(routine.user_id).toBe(userId);
    const routines = await listRoutines(client, userId);
    expect(routines.some((r) => r.id === routine.id)).toBe(true);
  });

  it("adds exercises to a routine at sequential positions", async () => {
    const routine = await createRoutineForUser(client, userId, { name: "Full Body" });
    const first = await addExerciseToRoutineForUser(client, userId, {
      routineId: routine.id,
      exerciseId: benchId,
    });
    const second = await addExerciseToRoutineForUser(client, userId, {
      routineId: routine.id,
      exerciseId: squatId,
    });
    expect(first.position).toBe(0);
    expect(second.position).toBe(1);

    const { exercises } = await getRoutineWithExercises(client, userId, routine.id);
    expect(exercises.map((e) => e.exercise.name)).toEqual(["Bench Press", "Squat"]);
  });

  it("moves an exercise up, swapping positions with its neighbor", async () => {
    const routine = await createRoutineForUser(client, userId, { name: "Reorder Test" });
    await addExerciseToRoutineForUser(client, userId, { routineId: routine.id, exerciseId: benchId });
    const second = await addExerciseToRoutineForUser(client, userId, {
      routineId: routine.id,
      exerciseId: squatId,
    });

    await moveRoutineExerciseForUser(client, userId, second.id, "up");

    const { exercises } = await getRoutineWithExercises(client, userId, routine.id);
    expect(exercises.map((e) => e.exercise.name)).toEqual(["Squat", "Bench Press"]);
  });

  it("does nothing when moving the first exercise up", async () => {
    const routine = await createRoutineForUser(client, userId, { name: "Edge Case" });
    const first = await addExerciseToRoutineForUser(client, userId, {
      routineId: routine.id,
      exerciseId: benchId,
    });
    await moveRoutineExerciseForUser(client, userId, first.id, "up");
    const { exercises } = await getRoutineWithExercises(client, userId, routine.id);
    expect(exercises[0].id).toBe(first.id);
  });

  it("removes an exercise from a routine", async () => {
    const routine = await createRoutineForUser(client, userId, { name: "Remove Test" });
    const entry = await addExerciseToRoutineForUser(client, userId, {
      routineId: routine.id,
      exerciseId: benchId,
    });
    await removeRoutineExerciseForUser(client, userId, entry.id);
    const { exercises } = await getRoutineWithExercises(client, userId, routine.id);
    expect(exercises).toHaveLength(0);
  });

  it("deleting a routine cascades to its routine_exercises", async () => {
    const routine = await createRoutineForUser(client, userId, { name: "Delete Test" });
    await addExerciseToRoutineForUser(client, userId, { routineId: routine.id, exerciseId: benchId });
    await deleteRoutineForUser(client, userId, routine.id);
    const { data } = await admin.from("routine_exercises").select("id").eq("routine_id", routine.id);
    expect(data).toEqual([]);
  });

  it("adds a new exercise after removing a middle one, without a position collision", async () => {
    // Regression test: positions [0,1,2], remove the middle one -> [0,2] remain.
    // A naive count(*)-based position calculation would compute position 2 for the
    // next insert, colliding with the unique(routine_id, position) constraint.
    const routine = await createRoutineForUser(client, userId, { name: "Position Gap Test" });
    const customExercise = await createCustomExerciseForUser(client, userId, {
      name: `Position Gap Exercise ${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });

    await addExerciseToRoutineForUser(client, userId, {
      routineId: routine.id,
      exerciseId: benchId,
    });
    const second = await addExerciseToRoutineForUser(client, userId, {
      routineId: routine.id,
      exerciseId: squatId,
    });
    await addExerciseToRoutineForUser(client, userId, {
      routineId: routine.id,
      exerciseId: customExercise.id,
    });

    await removeRoutineExerciseForUser(client, userId, second.id);

    await expect(
      addExerciseToRoutineForUser(client, userId, {
        routineId: routine.id,
        exerciseId: squatId,
      })
    ).resolves.not.toThrow();
  });

  it("rejects adding an exercise to another user's routine", async () => {
    const routine = await createRoutineForUser(client, userId, { name: "Owned By Victim" });

    const attacker = await createTestUser(admin);

    await expect(
      addExerciseToRoutineForUser(attacker.client, attacker.userId, {
        routineId: routine.id,
        exerciseId: benchId,
      })
    ).rejects.toThrow();

    const { exercises } = await getRoutineWithExercises(client, userId, routine.id);
    expect(exercises).toHaveLength(0);
  });
});
