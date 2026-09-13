import "dotenv/config";
import { describe, it, expect, beforeAll } from "vitest";
import { createTestUser } from "@/lib/test-helpers";
import { prisma } from "@/lib/db";
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

type SetSeed = { weightKg: number; reps: number; isWarmup: boolean };

// A finished session requires at least one logged set, so seed a single working set on a preset.
async function seedCompletedSession(userId: string, date: string) {
  const session = await startSessionForUser(prisma, userId, { sessionDate: date });
  const preset = await prisma.exercises.findFirst({ where: { user_id: null }, select: { id: true } });
  const sessionExercise = await addExerciseToSessionForUser(prisma, userId, session.id, preset!.id);
  await logSetForUser(prisma, userId, {
    sessionExerciseId: sessionExercise.id,
    weightKg: 50,
    reps: 5,
    isWarmup: false,
  });
  await finishSessionForUser(prisma, userId, session.id);
  return session;
}

async function seedCompletedSessionWithSets(
  userId: string,
  date: string,
  exerciseId: string,
  sets: SetSeed[]
) {
  const session = await startSessionForUser(prisma, userId, { sessionDate: date });
  const sessionExercise = await addExerciseToSessionForUser(prisma, userId, session.id, exerciseId);
  for (const set of sets) {
    await logSetForUser(prisma, userId, { sessionExerciseId: sessionExercise.id, ...set });
  }
  await finishSessionForUser(prisma, userId, session.id);
  return session;
}

describe("dashboard service", () => {
  let userId: string;

  beforeAll(async () => {
    userId = (await createTestUser()).userId;
  });

  it("lists sessions that have not been finished", async () => {
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-05" });
    const inProgress = await listInProgressSessions(prisma, userId);
    expect(inProgress.some((s) => s.id === session.id)).toBe(true);
  });

  it("excludes finished sessions from the in-progress list", async () => {
    const session = await seedCompletedSession(userId, "2026-01-06");
    const inProgress = await listInProgressSessions(prisma, userId);
    expect(inProgress.some((s) => s.id === session.id)).toBe(false);
  });

  it("surfaces PRs set during the most recently finished session", async () => {
    const exercise = await createCustomExerciseForUser(prisma, userId, {
      name: `Dashboard PR Exercise ${Date.now()}`,
      muscleGroup: "Chest",
    });
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-07" });
    const sessionExercise = await addExerciseToSessionForUser(prisma, userId, session.id, exercise.id);
    await logSetForUser(prisma, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 100,
      reps: 5,
      isWarmup: false,
    });
    await finishSessionForUser(prisma, userId, session.id);

    const prs = await listPrsFromLastCompletedSession(prisma, userId);
    expect(prs).toContainEqual({ exerciseName: exercise.name, weightKg: 100 });
  });
});

describe("getOverviewStats", () => {
  let userId: string;

  beforeAll(async () => {
    userId = (await createTestUser()).userId;
  });

  it("counts a day streak that survives today-not-yet-logged, then extends", async () => {
    await seedCompletedSession(userId, "2026-01-01");
    await seedCompletedSession(userId, "2026-01-05");
    await seedCompletedSession(userId, "2026-01-06");
    await seedCompletedSession(userId, "2026-01-07");

    const before = await getOverviewStats(prisma, userId, new Date(2026, 0, 8));
    expect(before.streakDays).toBe(3);

    await seedCompletedSession(userId, "2026-01-08");
    const after = await getOverviewStats(prisma, userId, new Date(2026, 0, 8));
    expect(after.streakDays).toBe(4);
  });

  it("counts only completed sessions within the current Mon–Sun week", async () => {
    await seedCompletedSession(userId, "2026-05-04"); // Mon, in
    await seedCompletedSession(userId, "2026-05-10"); // Sun, in
    await seedCompletedSession(userId, "2026-05-03"); // prev week, out
    await startSessionForUser(prisma, userId, { sessionDate: "2026-05-06" }); // not finished

    const stats = await getOverviewStats(prisma, userId, new Date(2026, 4, 10));
    expect(stats.sessionsThisWeek).toBe(2);
  });

  it("sums non-warmup volume for the current week only", async () => {
    const exercise = await createCustomExerciseForUser(prisma, userId, {
      name: `Overview Volume ${Date.now()}`,
      muscleGroup: "Legs",
    });
    await seedCompletedSessionWithSets(userId, "2026-09-08", exercise.id, [
      { weightKg: 40, reps: 10, isWarmup: true }, // excluded
      { weightKg: 100, reps: 5, isWarmup: false }, // 500
      { weightKg: 90, reps: 8, isWarmup: false }, // 720
    ]);
    await seedCompletedSessionWithSets(userId, "2026-09-14", exercise.id, [
      { weightKg: 999, reps: 1, isWarmup: false }, // next week + after "now", excluded
    ]);

    const stats = await getOverviewStats(prisma, userId, new Date(2026, 8, 8));
    expect(stats.volumeThisWeekKg).toBe(1220);
    expect(stats.sessionsThisWeek).toBe(1);
  });
});

describe("getWeeklyVolume", () => {
  let userId: string;

  beforeAll(async () => {
    userId = (await createTestUser()).userId;
  });

  it("buckets non-warmup volume by week and zero-fills the rest of the window", async () => {
    const exercise = await createCustomExerciseForUser(prisma, userId, {
      name: `Weekly Volume ${Date.now()}`,
      muscleGroup: "Back",
    });
    const now = new Date(2026, 2, 25); // Wed Mar 25, 2026

    await seedCompletedSessionWithSets(userId, "2026-03-24", exercise.id, [
      { weightKg: 50, reps: 10, isWarmup: false }, // 500 (current week)
      { weightKg: 20, reps: 5, isWarmup: true }, // excluded
    ]);
    await seedCompletedSessionWithSets(userId, "2026-03-16", exercise.id, [
      { weightKg: 60, reps: 5, isWarmup: false }, // 300 (previous week)
    ]);

    const result = await getWeeklyVolume(prisma, userId, 8, now);
    expect(result).toHaveLength(8);

    const current = result.find((b) => b.weekStart === getWeekStart(new Date(2026, 2, 24)));
    expect(current?.volumeKg).toBe(500);
    const previous = result.find((b) => b.weekStart === getWeekStart(new Date(2026, 2, 16)));
    expect(previous?.volumeKg).toBe(300);
    expect(result.reduce((sum, b) => sum + b.volumeKg, 0)).toBe(800);
  });
});

describe("listTopPrs", () => {
  let userId: string;

  beforeAll(async () => {
    userId = (await createTestUser()).userId;
  });

  it("returns all-time top non-warmup lifts, heaviest first", async () => {
    const heavy = await createCustomExerciseForUser(prisma, userId, {
      name: `Top PR Heavy ${Date.now()}`,
      muscleGroup: "Legs",
    });
    const light = await createCustomExerciseForUser(prisma, userId, {
      name: `Top PR Light ${Date.now()}`,
      muscleGroup: "Chest",
    });
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-02-02" });
    const heavySe = await addExerciseToSessionForUser(prisma, userId, session.id, heavy.id);
    await logSetForUser(prisma, userId, {
      sessionExerciseId: heavySe.id,
      weightKg: 200,
      reps: 1,
      isWarmup: true, // excluded from PR
    });
    await logSetForUser(prisma, userId, {
      sessionExerciseId: heavySe.id,
      weightKg: 120,
      reps: 3,
      isWarmup: false,
    });
    const lightSe = await addExerciseToSessionForUser(prisma, userId, session.id, light.id);
    await logSetForUser(prisma, userId, {
      sessionExerciseId: lightSe.id,
      weightKg: 80,
      reps: 5,
      isWarmup: false,
    });

    const top = await listTopPrs(prisma, userId, 6);
    expect(top).toEqual([
      { exerciseName: heavy.name, weightKg: 120 },
      { exerciseName: light.name, weightKg: 80 },
    ]);
  });
});
