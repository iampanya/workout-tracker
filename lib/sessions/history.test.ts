import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { createCustomExerciseForUser } from "@/lib/exercises/service";
import {
  startSessionForUser,
  addExerciseToSessionForUser,
  logSetForUser,
  finishSessionForUser,
} from "@/lib/sessions/service";
import { listCompletedSessions, getSessionDetail } from "./history";
import type { Database } from "@/lib/supabase/database.types";

describe("session history", () => {
  const admin = createAdminClient();
  let userId: string;
  let client: SupabaseClient<Database>;

  beforeAll(async () => {
    const testUser = await createTestUser(admin);
    userId = testUser.userId;
    client = testUser.client;
  });

  it("lists only completed sessions, most recent session_date first", async () => {
    const older = await startSessionForUser(client, userId, { sessionDate: "2026-01-01" });
    await finishSessionForUser(client, userId, older.id);
    const newer = await startSessionForUser(client, userId, { sessionDate: "2026-01-10" });
    await finishSessionForUser(client, userId, newer.id);
    const unfinished = await startSessionForUser(client, userId, { sessionDate: "2026-01-15" });

    const sessions = await listCompletedSessions(client);
    const ids = sessions.map((s) => s.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
    expect(ids).not.toContain(unfinished.id);
  });

  it("returns full exercise/set detail for a session", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: `History Exercise ${Date.now()}`,
    });
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-20" });
    const sessionExercise = await addExerciseToSessionForUser(client, userId, session.id, exercise.id);
    await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 60,
      reps: 10,
      isWarmup: false,
    });

    const detail = await getSessionDetail(client, session.id);
    expect(detail.session.id).toBe(session.id);
    expect(detail.exercises).toEqual([
      {
        exerciseName: exercise.name,
        sets: [{ weight_kg: 60, reps: 10, is_warmup: false, set_number: 1 }],
      },
    ]);
  });
});
