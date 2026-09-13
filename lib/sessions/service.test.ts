import "dotenv/config";
import { describe, it, expect, beforeAll } from "vitest";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { prisma } from "@/lib/db";
import { createRoutineForUser, addExerciseToRoutineForUser } from "@/lib/routines/service";
import { createCustomExerciseForUser } from "@/lib/exercises/service";
import {
  startSessionForUser,
  addExerciseToSessionForUser,
  removeExerciseFromSessionForUser,
  logSetForUser,
  updateSetForUser,
  deleteSetForUser,
  finishSessionForUser,
  discardSessionForUser,
  getPriorMaxWeights,
} from "./service";

function uniqueExerciseName(label: string) {
  return `${label} ${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe("sessions service", () => {
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

  it("snapshots a routine's exercises into the new session, preserving order", async () => {
    const routine = await createRoutineForUser(prisma, userId, { name: "Snapshot Test" });
    await addExerciseToRoutineForUser(prisma, userId, { routineId: routine.id, exerciseId: benchId });
    await addExerciseToRoutineForUser(prisma, userId, { routineId: routine.id, exerciseId: squatId });

    const session = await startSessionForUser(prisma, userId, {
      routineId: routine.id,
      sessionDate: "2026-01-05",
    });

    const { data: sessionExercises } = await admin
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
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-06" });
    const sessionExercise = await addExerciseToSessionForUser(prisma, userId, session.id, benchId);
    expect(sessionExercise.position).toBe(0);
  });

  it("rejects adding an exercise to another user's session", async () => {
    const victimSession = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-06" });
    const attacker = await createTestUser(admin);

    await expect(
      addExerciseToSessionForUser(prisma, attacker.userId, victimSession.id, benchId)
    ).rejects.toThrow();

    const { data: sessionExercises } = await admin
      .from("session_exercises")
      .select("id")
      .eq("session_id", victimSession.id);
    expect(sessionExercises).toEqual([]);
  });

  it("rejects starting a session with another user's routineId, leaving no orphaned session row", async () => {
    const owner = await createTestUser(admin);
    const routine = await createRoutineForUser(prisma, owner.userId, { name: "Not Yours" });

    await expect(
      startSessionForUser(prisma, userId, { routineId: routine.id, sessionDate: "2026-01-06" })
    ).rejects.toThrow();

    const { data: sessions } = await admin
      .from("sessions")
      .select("id")
      .eq("routine_id", routine.id);
    expect(sessions).toEqual([]);
  });

  it("marks the first logged set for a fresh exercise as a PR", async () => {
    const exercise = await createCustomExerciseForUser(prisma, userId, {
      name: uniqueExerciseName("First Set Exercise"),
      muscleGroup: "Chest",
    });
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-07" });
    const sessionExercise = await addExerciseToSessionForUser(prisma, userId, session.id, exercise.id);

    const { isPr, set } = await logSetForUser(prisma, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 100,
      reps: 5,
      isWarmup: false,
    });

    expect(isPr).toBe(true);
    expect(set.set_number).toBe(1);
  });

  it("does not mark a lighter set as a PR, and increments set_number within the exercise", async () => {
    const exercise = await createCustomExerciseForUser(prisma, userId, {
      name: uniqueExerciseName("Lighter Set Exercise"),
      muscleGroup: "Chest",
    });
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-08" });
    const sessionExercise = await addExerciseToSessionForUser(prisma, userId, session.id, exercise.id);

    await logSetForUser(prisma, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 110,
      reps: 5,
      isWarmup: false,
    });
    const { isPr, set } = await logSetForUser(prisma, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 90,
      reps: 5,
      isWarmup: false,
    });

    expect(isPr).toBe(false);
    expect(set.set_number).toBe(2);
  });

  it("never counts a warmup set as a PR, nor toward future PR comparisons", async () => {
    const exercise = await createCustomExerciseForUser(prisma, userId, {
      name: uniqueExerciseName("Warmup Exercise"),
      muscleGroup: "Chest",
    });
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-09" });
    const sessionExercise = await addExerciseToSessionForUser(prisma, userId, session.id, exercise.id);

    const warmup = await logSetForUser(prisma, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 500,
      reps: 5,
      isWarmup: true,
    });
    expect(warmup.isPr).toBe(false);

    const working = await logSetForUser(prisma, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 150,
      reps: 5,
      isWarmup: false,
    });
    expect(working.isPr).toBe(true); // the 500kg warmup must not suppress this
  });

  it("recomputes PR live after a correction, with no stale cache", async () => {
    const exercise = await createCustomExerciseForUser(prisma, userId, {
      name: uniqueExerciseName("Correction Exercise"),
      muscleGroup: "Chest",
    });
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-10" });
    const sessionExercise = await addExerciseToSessionForUser(prisma, userId, session.id, exercise.id);

    const first = await logSetForUser(prisma, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 120,
      reps: 5,
      isWarmup: false,
    });
    expect(first.isPr).toBe(true);

    await deleteSetForUser(prisma, userId, first.set.id);

    const after = await logSetForUser(prisma, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 95,
      reps: 5,
      isWarmup: false,
    });
    expect(after.isPr).toBe(true); // the 120kg set was deleted, so this exercise has no prior history left
  });

  it("logs a new set after deleting a middle set, without a set_number collision", async () => {
    // Regression test: set_numbers [1,2,3], delete the middle one -> [1,3] remain.
    // A naive count(*)-based set_number calculation would compute set_number 3 for
    // the next insert, colliding with the unique(session_exercise_id, set_number)
    // constraint.
    const exercise = await createCustomExerciseForUser(prisma, userId, {
      name: uniqueExerciseName("Set Number Gap Exercise"),
      muscleGroup: "Chest",
    });
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-13" });
    const sessionExercise = await addExerciseToSessionForUser(prisma, userId, session.id, exercise.id);

    await logSetForUser(prisma, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 60,
      reps: 5,
      isWarmup: false,
    });
    const second = await logSetForUser(prisma, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 70,
      reps: 5,
      isWarmup: false,
    });
    await logSetForUser(prisma, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 80,
      reps: 5,
      isWarmup: false,
    });

    await deleteSetForUser(prisma, userId, second.set.id);

    await expect(
      logSetForUser(prisma, userId, {
        sessionExerciseId: sessionExercise.id,
        weightKg: 90,
        reps: 5,
        isWarmup: false,
      })
    ).resolves.not.toThrow();
  });

  it("finishes a session by setting completed_at", async () => {
    const exercise = await createCustomExerciseForUser(prisma, userId, {
      name: uniqueExerciseName("Finish Complete"),
      muscleGroup: "Chest",
    });
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-11" });
    const sessionExercise = await addExerciseToSessionForUser(prisma, userId, session.id, exercise.id);
    await logSetForUser(prisma, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 80,
      reps: 5,
      isWarmup: false,
    });
    await finishSessionForUser(prisma, userId, session.id);
    const { data } = await admin
      .from("sessions")
      .select("completed_at")
      .eq("id", session.id)
      .single();
    expect(data!.completed_at).not.toBeNull();
  });

  it("refuses to finish a session with no exercises at all", async () => {
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-21" });
    await expect(finishSessionForUser(prisma, userId, session.id)).rejects.toThrow(
      /at least one exercise/i
    );
    const { data } = await admin
      .from("sessions")
      .select("completed_at")
      .eq("id", session.id)
      .single();
    expect(data!.completed_at).toBeNull();
  });

  it("removes an exercise from a session, cascading its sets", async () => {
    const exercise = await createCustomExerciseForUser(prisma, userId, {
      name: uniqueExerciseName("Remove Exercise"),
      muscleGroup: "Chest",
    });
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-19" });
    const sessionExercise = await addExerciseToSessionForUser(prisma, userId, session.id, exercise.id);
    await logSetForUser(prisma, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 70,
      reps: 8,
      isWarmup: false,
    });

    await removeExerciseFromSessionForUser(prisma, userId, sessionExercise.id);

    const { data: remaining } = await admin
      .from("session_exercises")
      .select("id")
      .eq("id", sessionExercise.id);
    expect(remaining).toEqual([]);
    const { data: sets } = await admin
      .from("sets")
      .select("id")
      .eq("session_exercise_id", sessionExercise.id);
    expect(sets).toEqual([]);
  });

  it("rejects removing another user's session exercise", async () => {
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-19" });
    const sessionExercise = await addExerciseToSessionForUser(prisma, userId, session.id, benchId);
    const attacker = await createTestUser(admin);

    await expect(
      removeExerciseFromSessionForUser(prisma, attacker.userId, sessionExercise.id)
    ).rejects.toThrow();

    const { data } = await admin
      .from("session_exercises")
      .select("id")
      .eq("id", sessionExercise.id);
    expect(data).toHaveLength(1);
  });

  it("refuses to finish while an exercise has no sets, and allows it once removed", async () => {
    const withSets = await createCustomExerciseForUser(prisma, userId, {
      name: uniqueExerciseName("Finish Guard With Sets"),
      muscleGroup: "Chest",
    });
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-20" });
    const withSetsSe = await addExerciseToSessionForUser(prisma, userId, session.id, withSets.id);
    await logSetForUser(prisma, userId, {
      sessionExerciseId: withSetsSe.id,
      weightKg: 60,
      reps: 5,
      isWarmup: false,
    });
    const emptySe = await addExerciseToSessionForUser(prisma, userId, session.id, benchId);

    await expect(finishSessionForUser(prisma, userId, session.id)).rejects.toThrow(
      /no sets/i
    );

    await removeExerciseFromSessionForUser(prisma, userId, emptySe.id);
    await expect(finishSessionForUser(prisma, userId, session.id)).resolves.not.toThrow();
  });

  it("discarding a session cascades to remove its sets", async () => {
    const exercise = await createCustomExerciseForUser(prisma, userId, {
      name: uniqueExerciseName("Discard Exercise"),
      muscleGroup: "Chest",
    });
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-12" });
    const sessionExercise = await addExerciseToSessionForUser(prisma, userId, session.id, exercise.id);
    await logSetForUser(prisma, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 80,
      reps: 5,
      isWarmup: false,
    });

    await discardSessionForUser(prisma, userId, session.id);

    const { data } = await admin
      .from("sets")
      .select("id")
      .eq("session_exercise_id", sessionExercise.id);
    expect(data).toEqual([]);
  });

  it("updates a set's weight and reps", async () => {
    const exercise = await createCustomExerciseForUser(prisma, userId, {
      name: uniqueExerciseName("Update Weight Exercise"),
      muscleGroup: "Chest",
    });
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-14" });
    const sessionExercise = await addExerciseToSessionForUser(prisma, userId, session.id, exercise.id);
    const logged = await logSetForUser(prisma, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 60,
      reps: 8,
      isWarmup: false,
    });

    const { set } = await updateSetForUser(prisma, userId, logged.set.id, {
      weightKg: 65,
      reps: 6,
      isWarmup: false,
    });

    expect(Number(set.weight_kg)).toBe(65);
    expect(set.reps).toBe(6);
  });

  it("marks an edited set as a new PR when raised above the prior best", async () => {
    const exercise = await createCustomExerciseForUser(prisma, userId, {
      name: uniqueExerciseName("Edit To PR Exercise"),
      muscleGroup: "Back",
    });
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-15" });
    const sessionExercise = await addExerciseToSessionForUser(prisma, userId, session.id, exercise.id);
    await logSetForUser(prisma, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 100,
      reps: 5,
      isWarmup: false,
    });
    const second = await logSetForUser(prisma, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 90,
      reps: 5,
      isWarmup: false,
    });

    const { isPr } = await updateSetForUser(prisma, userId, second.set.id, {
      weightKg: 120,
      reps: 5,
      isWarmup: false,
    });

    expect(isPr).toBe(true);
  });

  it("batches PR lookups across multiple exercises, omitting exercises with no PR yet", async () => {
    const benchedExercise = await createCustomExerciseForUser(prisma, userId, {
      name: uniqueExerciseName("Batch PR Bench"),
      muscleGroup: "Chest",
    });
    const untouchedExercise = await createCustomExerciseForUser(prisma, userId, {
      name: uniqueExerciseName("Batch PR Untouched"),
      muscleGroup: "Legs",
    });
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-17" });
    const sessionExercise = await addExerciseToSessionForUser(
      prisma,
      userId,
      session.id,
      benchedExercise.id
    );
    await logSetForUser(prisma, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 82.5,
      reps: 5,
      isWarmup: false,
    });

    const prs = await getPriorMaxWeights(prisma, userId, [benchedExercise.id, untouchedExercise.id]);

    expect(prs).toEqual({ [benchedExercise.id]: 82.5 });
  });

  it("returns an empty object when given no exercise ids", async () => {
    const prs = await getPriorMaxWeights(prisma, userId, []);
    expect(prs).toEqual({});
  });

  it("does not leak another user's PR for the same exercise", async () => {
    const attacker = await createTestUser(admin);
    const session = await startSessionForUser(prisma, attacker.userId, {
      sessionDate: "2026-01-18",
    });
    const sessionExercise = await addExerciseToSessionForUser(
      prisma,
      attacker.userId,
      session.id,
      benchId
    );
    await logSetForUser(prisma, attacker.userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 999,
      reps: 1,
      isWarmup: false,
    });

    const prs = await getPriorMaxWeights(prisma, userId, [benchId]);

    expect(prs).toEqual({});
  });

  it("rejects updating another user's set", async () => {
    const exercise = await createCustomExerciseForUser(prisma, userId, {
      name: uniqueExerciseName("Foreign Update Exercise"),
      muscleGroup: "Legs",
    });
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-16" });
    const sessionExercise = await addExerciseToSessionForUser(prisma, userId, session.id, exercise.id);
    const logged = await logSetForUser(prisma, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 50,
      reps: 10,
      isWarmup: false,
    });
    const attacker = await createTestUser(admin);

    await expect(
      updateSetForUser(prisma, attacker.userId, logged.set.id, {
        weightKg: 999,
        reps: 1,
        isWarmup: false,
      })
    ).rejects.toThrow();

    const { data } = await admin.from("sets").select("weight_kg").eq("id", logged.set.id).single();
    expect(Number(data!.weight_kg)).toBe(50);
  });
});
