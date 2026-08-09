import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { createRoutineForUser, addExerciseToRoutineForUser } from "@/lib/routines/service";
import { createCustomExerciseForUser } from "@/lib/exercises/service";
import {
  startSessionForUser,
  addExerciseToSessionForUser,
  logSetForUser,
  deleteSetForUser,
  finishSessionForUser,
  discardSessionForUser,
} from "./service";
import type { Database } from "@/lib/supabase/database.types";

function uniqueExerciseName(label: string) {
  return `${label} ${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe("sessions service", () => {
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

  it("snapshots a routine's exercises into the new session, preserving order", async () => {
    const routine = await createRoutineForUser(client, userId, { name: "Snapshot Test" });
    await addExerciseToRoutineForUser(client, userId, { routineId: routine.id, exerciseId: benchId });
    await addExerciseToRoutineForUser(client, userId, { routineId: routine.id, exerciseId: squatId });

    const session = await startSessionForUser(client, userId, {
      routineId: routine.id,
      sessionDate: "2026-01-05",
    });

    const { data: sessionExercises } = await client
      .from("session_exercises")
      .select("exercise_id, position")
      .eq("session_id", session.id)
      .order("position");

    expect(sessionExercises).toEqual([
      { exercise_id: benchId, position: 0 },
      { exercise_id: squatId, position: 1 },
    ]);
  });

  it("starts a freeform session with no exercises, and allows adding one ad hoc", async () => {
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-06" });
    const sessionExercise = await addExerciseToSessionForUser(client, userId, session.id, benchId);
    expect(sessionExercise.position).toBe(0);
  });

  it("rejects adding an exercise to another user's session", async () => {
    const victimSession = await startSessionForUser(client, userId, { sessionDate: "2026-01-06" });
    const attacker = await createTestUser(admin);

    await expect(
      addExerciseToSessionForUser(attacker.client, attacker.userId, victimSession.id, benchId)
    ).rejects.toThrow();

    const { data: sessionExercises } = await admin
      .from("session_exercises")
      .select("id")
      .eq("session_id", victimSession.id);
    expect(sessionExercises).toEqual([]);
  });

  it("marks the first logged set for a fresh exercise as a PR", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: uniqueExerciseName("First Set Exercise"),
    });
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-07" });
    const sessionExercise = await addExerciseToSessionForUser(client, userId, session.id, exercise.id);

    const { isPr, set } = await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 100,
      reps: 5,
      isWarmup: false,
    });

    expect(isPr).toBe(true);
    expect(set.set_number).toBe(1);
  });

  it("does not mark a lighter set as a PR, and increments set_number within the exercise", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: uniqueExerciseName("Lighter Set Exercise"),
    });
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-08" });
    const sessionExercise = await addExerciseToSessionForUser(client, userId, session.id, exercise.id);

    await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 110,
      reps: 5,
      isWarmup: false,
    });
    const { isPr, set } = await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 90,
      reps: 5,
      isWarmup: false,
    });

    expect(isPr).toBe(false);
    expect(set.set_number).toBe(2);
  });

  it("never counts a warmup set as a PR, nor toward future PR comparisons", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: uniqueExerciseName("Warmup Exercise"),
    });
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-09" });
    const sessionExercise = await addExerciseToSessionForUser(client, userId, session.id, exercise.id);

    const warmup = await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 500,
      reps: 5,
      isWarmup: true,
    });
    expect(warmup.isPr).toBe(false);

    const working = await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 150,
      reps: 5,
      isWarmup: false,
    });
    expect(working.isPr).toBe(true); // the 500kg warmup must not suppress this
  });

  it("recomputes PR live after a correction, with no stale cache", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: uniqueExerciseName("Correction Exercise"),
    });
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-10" });
    const sessionExercise = await addExerciseToSessionForUser(client, userId, session.id, exercise.id);

    const first = await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 120,
      reps: 5,
      isWarmup: false,
    });
    expect(first.isPr).toBe(true);

    await deleteSetForUser(client, userId, first.set.id);

    const after = await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 95,
      reps: 5,
      isWarmup: false,
    });
    expect(after.isPr).toBe(true); // the 120kg set was deleted, so this exercise has no prior history left
  });

  it("finishes a session by setting completed_at", async () => {
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-11" });
    await finishSessionForUser(client, userId, session.id);
    const { data } = await client
      .from("sessions")
      .select("completed_at")
      .eq("id", session.id)
      .single();
    expect(data!.completed_at).not.toBeNull();
  });

  it("discarding a session cascades to remove its sets", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: uniqueExerciseName("Discard Exercise"),
    });
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-12" });
    const sessionExercise = await addExerciseToSessionForUser(client, userId, session.id, exercise.id);
    await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 80,
      reps: 5,
      isWarmup: false,
    });

    await discardSessionForUser(client, userId, session.id);

    const { data } = await admin
      .from("sets")
      .select("id")
      .eq("session_exercise_id", sessionExercise.id);
    expect(data).toEqual([]);
  });
});
