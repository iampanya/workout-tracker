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
import {
  listInProgressSessions,
  listPrsFromLastCompletedSession,
  getOverviewStats,
  getWeeklyVolume,
  listTopPrs,
} from "./service";
import { getWeekStart } from "@/lib/date";
import type { Database } from "@/lib/supabase/database.types";

type SetSeed = { weightKg: number; reps: number; isWarmup: boolean };

// A finished session now requires at least one logged set, so seed a single working
// set on a preset exercise. Callers that only care about completion dates (streak /
// weekly counts) are unaffected by the set's weight.
async function seedCompletedSession(
  client: SupabaseClient<Database>,
  userId: string,
  date: string
) {
  const session = await startSessionForUser(client, userId, { sessionDate: date });
  const { data: presets } = await client
    .from("exercises")
    .select("id")
    .is("user_id", null)
    .limit(1);
  const sessionExercise = await addExerciseToSessionForUser(
    client,
    userId,
    session.id,
    presets![0].id
  );
  await logSetForUser(client, userId, {
    sessionExerciseId: sessionExercise.id,
    weightKg: 50,
    reps: 5,
    isWarmup: false,
  });
  await finishSessionForUser(client, userId, session.id);
  return session;
}

async function seedCompletedSessionWithSets(
  client: SupabaseClient<Database>,
  userId: string,
  date: string,
  exerciseId: string,
  sets: SetSeed[]
) {
  const session = await startSessionForUser(client, userId, { sessionDate: date });
  const sessionExercise = await addExerciseToSessionForUser(client, userId, session.id, exerciseId);
  for (const set of sets) {
    await logSetForUser(client, userId, { sessionExerciseId: sessionExercise.id, ...set });
  }
  await finishSessionForUser(client, userId, session.id);
  return session;
}

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
    const session = await seedCompletedSession(client, userId, "2026-01-06");
    const inProgress = await listInProgressSessions(client);
    expect(inProgress.some((s) => s.id === session.id)).toBe(false);
  });

  it("surfaces PRs set during the most recently finished session", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: `Dashboard PR Exercise ${Date.now()}`,
      muscleGroup: "Chest",
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

describe("getOverviewStats", () => {
  // Own fresh user so the top-level describe's seeded 2026-01-06/07 sessions can't
  // pollute streak/week aggregation. Jan/May/Sep are >90 days apart so each call's
  // 90-day lookback window can't see the other months' sessions.
  const admin = createAdminClient();
  let userId: string;
  let client: SupabaseClient<Database>;

  beforeAll(async () => {
    const testUser = await createTestUser(admin);
    userId = testUser.userId;
    client = testUser.client;
  });

  it("counts a day streak that survives today-not-yet-logged, then extends", async () => {
    await seedCompletedSession(client, userId, "2026-01-01"); // isolated
    await seedCompletedSession(client, userId, "2026-01-05");
    await seedCompletedSession(client, userId, "2026-01-06");
    await seedCompletedSession(client, userId, "2026-01-07");

    const before = await getOverviewStats(client, userId, new Date(2026, 0, 8));
    expect(before.streakDays).toBe(3); // today (01-08) not logged, counts back 07/06/05

    await seedCompletedSession(client, userId, "2026-01-08");
    const after = await getOverviewStats(client, userId, new Date(2026, 0, 8));
    expect(after.streakDays).toBe(4);
  });

  it("counts only completed sessions within the current Mon–Sun week", async () => {
    await seedCompletedSession(client, userId, "2026-05-04"); // Mon, in
    await seedCompletedSession(client, userId, "2026-05-10"); // Sun, in
    await seedCompletedSession(client, userId, "2026-05-03"); // prev week, out
    await startSessionForUser(client, userId, { sessionDate: "2026-05-06" }); // in week but not finished

    const stats = await getOverviewStats(client, userId, new Date(2026, 4, 10));
    expect(stats.sessionsThisWeek).toBe(2);
  });

  it("sums non-warmup volume for the current week only", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: `Overview Volume ${Date.now()}`,
      muscleGroup: "Legs",
    });
    await seedCompletedSessionWithSets(client, userId, "2026-09-08", exercise.id, [
      { weightKg: 40, reps: 10, isWarmup: true }, // excluded
      { weightKg: 100, reps: 5, isWarmup: false }, // 500
      { weightKg: 90, reps: 8, isWarmup: false }, // 720
    ]);
    await seedCompletedSessionWithSets(client, userId, "2026-09-14", exercise.id, [
      { weightKg: 999, reps: 1, isWarmup: false }, // next week + after "now", excluded
    ]);

    const stats = await getOverviewStats(client, userId, new Date(2026, 8, 8));
    expect(stats.volumeThisWeekKg).toBe(1220);
    expect(stats.sessionsThisWeek).toBe(1);
  });
});

describe("getWeeklyVolume", () => {
  const admin = createAdminClient();
  let userId: string;
  let client: SupabaseClient<Database>;

  beforeAll(async () => {
    const testUser = await createTestUser(admin);
    userId = testUser.userId;
    client = testUser.client;
  });

  it("buckets non-warmup volume by week and zero-fills the rest of the window", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: `Weekly Volume ${Date.now()}`,
      muscleGroup: "Back",
    });
    const now = new Date(2026, 2, 25); // Wed Mar 25, 2026

    await seedCompletedSessionWithSets(client, userId, "2026-03-24", exercise.id, [
      { weightKg: 50, reps: 10, isWarmup: false }, // 500 (current week)
      { weightKg: 20, reps: 5, isWarmup: true }, // excluded
    ]);
    await seedCompletedSessionWithSets(client, userId, "2026-03-16", exercise.id, [
      { weightKg: 60, reps: 5, isWarmup: false }, // 300 (previous week)
    ]);

    const result = await getWeeklyVolume(client, userId, 8, now);
    expect(result).toHaveLength(8);

    const current = result.find((b) => b.weekStart === getWeekStart(new Date(2026, 2, 24)));
    expect(current?.volumeKg).toBe(500);
    const previous = result.find((b) => b.weekStart === getWeekStart(new Date(2026, 2, 16)));
    expect(previous?.volumeKg).toBe(300);
    expect(result.reduce((sum, b) => sum + b.volumeKg, 0)).toBe(800);
  });
});

describe("listTopPrs", () => {
  const admin = createAdminClient();
  let userId: string;
  let client: SupabaseClient<Database>;

  beforeAll(async () => {
    const testUser = await createTestUser(admin);
    userId = testUser.userId;
    client = testUser.client;
  });

  it("returns all-time top non-warmup lifts, heaviest first", async () => {
    const heavy = await createCustomExerciseForUser(client, userId, {
      name: `Top PR Heavy ${Date.now()}`,
      muscleGroup: "Legs",
    });
    const light = await createCustomExerciseForUser(client, userId, {
      name: `Top PR Light ${Date.now()}`,
      muscleGroup: "Chest",
    });
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-02-02" });
    const heavySe = await addExerciseToSessionForUser(client, userId, session.id, heavy.id);
    await logSetForUser(client, userId, {
      sessionExerciseId: heavySe.id,
      weightKg: 200,
      reps: 1,
      isWarmup: true, // excluded from PR
    });
    await logSetForUser(client, userId, {
      sessionExerciseId: heavySe.id,
      weightKg: 120,
      reps: 3,
      isWarmup: false,
    });
    const lightSe = await addExerciseToSessionForUser(client, userId, session.id, light.id);
    await logSetForUser(client, userId, {
      sessionExerciseId: lightSe.id,
      weightKg: 80,
      reps: 5,
      isWarmup: false,
    });

    const top = await listTopPrs(client, userId, 6);
    expect(top).toEqual([
      { exerciseName: heavy.name, weightKg: 120 },
      { exerciseName: light.name, weightKg: 80 },
    ]);
  });
});
