import "dotenv/config";
import { describe, it, expect, beforeAll } from "vitest";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { prisma } from "@/lib/db";
import { createCustomExerciseForUser } from "@/lib/exercises/service";
import { startSessionForUser, addExerciseToSessionForUser, logSetForUser } from "@/lib/sessions/service";
import { getExerciseHistory, getExercisePr } from "./progress";

describe("exercise progress", () => {
  const admin = createAdminClient();
  let userId: string;

  beforeAll(async () => {
    userId = (await createTestUser(admin)).userId;
  });

  it("returns history sorted by when it was logged, with each set's session date", async () => {
    const exercise = await createCustomExerciseForUser(prisma, userId, {
      name: `Progress Exercise ${Date.now()}`,
      muscleGroup: "Chest",
    });
    const sessionA = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-01" });
    const seA = await addExerciseToSessionForUser(prisma, userId, sessionA.id, exercise.id);
    await logSetForUser(prisma, userId, {
      sessionExerciseId: seA.id,
      weightKg: 100,
      reps: 5,
      isWarmup: false,
    });

    const sessionB = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-08" });
    const seB = await addExerciseToSessionForUser(prisma, userId, sessionB.id, exercise.id);
    await logSetForUser(prisma, userId, {
      sessionExerciseId: seB.id,
      weightKg: 110,
      reps: 5,
      isWarmup: false,
    });

    const history = await getExerciseHistory(prisma, userId, exercise.id);
    expect(history.map((s) => ({ date: s.session_date, weight: s.weight_kg }))).toEqual([
      { date: "2026-01-01", weight: 100 },
      { date: "2026-01-08", weight: 110 },
    ]);

    const pr = await getExercisePr(prisma, userId, exercise.id);
    expect(pr).toBe(110);
  });

  it("returns null PR for an exercise with no logged sets", async () => {
    const exercise = await createCustomExerciseForUser(prisma, userId, {
      name: `Untouched Exercise ${Date.now()}`,
      muscleGroup: "Chest",
    });
    const pr = await getExercisePr(prisma, userId, exercise.id);
    expect(pr).toBeNull();
  });
});
