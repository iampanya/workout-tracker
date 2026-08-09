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
import { listInProgressSessions, listPrsFromLastCompletedSession } from "./service";
import type { Database } from "@/lib/supabase/database.types";

describe("dashboard service", () => {
  const admin = createAdminClient();
  let userId: string;
  let client: SupabaseClient<Database>;

  beforeAll(async () => {
    const testUser = await createTestUser(admin);
    userId = testUser.userId;
    client = testUser.client;
  });

  it("lists sessions that have not been finished", async () => {
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-05" });
    const inProgress = await listInProgressSessions(client);
    expect(inProgress.some((s) => s.id === session.id)).toBe(true);
  });

  it("excludes finished sessions from the in-progress list", async () => {
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-06" });
    await finishSessionForUser(client, userId, session.id);
    const inProgress = await listInProgressSessions(client);
    expect(inProgress.some((s) => s.id === session.id)).toBe(false);
  });

  it("surfaces PRs set during the most recently finished session", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: `Dashboard PR Exercise ${Date.now()}`,
    });
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-07" });
    const sessionExercise = await addExerciseToSessionForUser(client, userId, session.id, exercise.id);
    await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 100,
      reps: 5,
      isWarmup: false,
    });
    await finishSessionForUser(client, userId, session.id);

    const prs = await listPrsFromLastCompletedSession(client, userId);
    expect(prs).toContainEqual({ exerciseName: exercise.name, weightKg: 100 });
  });
});
