import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { createCustomExerciseForUser } from "@/lib/exercises/service";
import { startSessionForUser, addExerciseToSessionForUser, logSetForUser } from "@/lib/sessions/service";
import { getExerciseHistory, getExercisePr } from "./progress";
import type { Database } from "@/lib/supabase/database.types";

describe("exercise progress", () => {
  const admin = createAdminClient();
  let userId: string;
  let client: SupabaseClient<Database>;

  beforeAll(async () => {
    const testUser = await createTestUser(admin);
    userId = testUser.userId;
    client = testUser.client;
  });

  it("returns history sorted by when it was logged, with each set's session date", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: `Progress Exercise ${Date.now()}`,
      muscleGroup: "Chest",
    });
    const sessionA = await startSessionForUser(client, userId, { sessionDate: "2026-01-01" });
    const seA = await addExerciseToSessionForUser(client, userId, sessionA.id, exercise.id);
    await logSetForUser(client, userId, {
      sessionExerciseId: seA.id,
      weightKg: 100,
      reps: 5,
      isWarmup: false,
    });

    const sessionB = await startSessionForUser(client, userId, { sessionDate: "2026-01-08" });
    const seB = await addExerciseToSessionForUser(client, userId, sessionB.id, exercise.id);
    await logSetForUser(client, userId, {
      sessionExerciseId: seB.id,
      weightKg: 110,
      reps: 5,
      isWarmup: false,
    });

    const history = await getExerciseHistory(client, exercise.id);
    expect(history.map((s) => ({ date: s.session_date, weight: s.weight_kg }))).toEqual([
      { date: "2026-01-01", weight: 100 },
      { date: "2026-01-08", weight: 110 },
    ]);

    const pr = await getExercisePr(client, userId, exercise.id);
    expect(pr).toBe(110);
  });

  it("returns null PR for an exercise with no logged sets", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: `Untouched Exercise ${Date.now()}`,
      muscleGroup: "Chest",
    });
    const pr = await getExercisePr(client, userId, exercise.id);
    expect(pr).toBeNull();
  });
});
