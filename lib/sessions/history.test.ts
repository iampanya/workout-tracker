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
import { listCompletedSessions, getSessionDetail } from "./history";

// A finished session needs at least one logged set; seed one on a preset exercise for
// tests that only care about which sessions are completed.
async function seedCompletedSession(userId: string, date: string) {
  const session = await startSessionForUser(prisma, userId, { sessionDate: date });
  const preset = await prisma.exercises.findFirst({
    where: { user_id: null },
    select: { id: true },
  });
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

describe("session history", () => {
  let userId: string;

  beforeAll(async () => {
    userId = (await createTestUser()).userId;
  });

  it("lists only completed sessions, most recent session_date first", async () => {
    const older = await seedCompletedSession(userId, "2026-01-01");
    const newer = await seedCompletedSession(userId, "2026-01-10");
    const unfinished = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-15" });

    const sessions = await listCompletedSessions(prisma, userId);
    const ids = sessions.map((s) => s.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
    expect(ids).not.toContain(unfinished.id);
  });

  it("returns full exercise/set detail for a session", async () => {
    const exercise = await createCustomExerciseForUser(prisma, userId, {
      name: `History Exercise ${Date.now()}`,
      muscleGroup: "Chest",
    });
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-01-20" });
    const sessionExercise = await addExerciseToSessionForUser(prisma, userId, session.id, exercise.id);
    await logSetForUser(prisma, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 60,
      reps: 10,
      isWarmup: false,
    });

    const detail = await getSessionDetail(prisma, userId, session.id);
    expect(detail).not.toBeNull();
    expect(detail!.session.id).toBe(session.id);
    expect(detail!.exercises).toEqual([
      {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        sets: [{ weight_kg: 60, reps: 10, is_warmup: false, set_number: 1 }],
      },
    ]);
  });

  it("attaches per-session stats (warmups count as sets but not volume)", async () => {
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-02-01" });
    const preset = await prisma.exercises.findFirst({ where: { user_id: null }, select: { id: true } });
    const se = await addExerciseToSessionForUser(prisma, userId, session.id, preset!.id);
    await logSetForUser(prisma, userId, { sessionExerciseId: se.id, weightKg: 20, reps: 10, isWarmup: true });
    await logSetForUser(prisma, userId, { sessionExerciseId: se.id, weightKg: 50, reps: 5, isWarmup: false });
    await finishSessionForUser(prisma, userId, session.id);

    const sessions = await listCompletedSessions(prisma, userId);
    const item = sessions.find((s) => s.id === session.id)!;
    expect(item.stats).toMatchObject({ exerciseCount: 1, setCount: 2, volumeKg: 250 });
  });

  it("paginates with take/skip", async () => {
    const all = await listCompletedSessions(prisma, userId);
    const page = await listCompletedSessions(prisma, userId, { take: 1, skip: 1 });
    expect(page.map((s) => s.id)).toEqual([all[1].id]);
  });

  it("never lists another user's sessions", async () => {
    const other = await createTestUser();
    await seedCompletedSession(other.userId, "2026-02-02");
    const mine = await listCompletedSessions(prisma, userId);
    expect(mine.every((s) => s.user_id === userId)).toBe(true);
  });

  it("returns null for a nonexistent session id, so the page can 404 instead of throwing", async () => {
    const detail = await getSessionDetail(prisma, userId, "00000000-0000-0000-0000-000000000000");
    expect(detail).toBeNull();
  });
});
