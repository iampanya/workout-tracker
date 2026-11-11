import "dotenv/config";
import { describe, it, expect } from "vitest";
import { createTestUser } from "@/lib/test-helpers";
import { prisma } from "@/lib/db";
import { createCustomExerciseForUser } from "./service";
import {
  startSessionForUser,
  addExerciseToSessionForUser,
  logSetForUser,
  finishSessionForUser,
} from "@/lib/sessions/service";
import { getWeightSteps, setWeightStepForUser } from "./settings";

// One session of `exerciseId` with the given working (and warmup) weights; completed unless told not.
async function logSession(
  userId: string,
  exerciseId: string,
  working: number[],
  { warmups = [], finish = true }: { warmups?: number[]; finish?: boolean } = {}
) {
  const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-10-01" });
  const se = await addExerciseToSessionForUser(prisma, userId, session.id, exerciseId);
  for (const weightKg of warmups) {
    await logSetForUser(prisma, userId, { sessionExerciseId: se.id, weightKg, reps: 10, isWarmup: true });
  }
  for (const weightKg of working) {
    await logSetForUser(prisma, userId, { sessionExerciseId: se.id, weightKg, reps: 8, isWarmup: false });
  }
  if (finish) await finishSessionForUser(prisma, userId, session.id);
}

// One completed session per top weight: history that infers the gap between them.
async function logTops(userId: string, exerciseId: string, tops: number[], warmups: number[] = []) {
  for (const top of tops) await logSession(userId, exerciseId, [top], { warmups });
}

async function shoulderPresets() {
  return prisma.exercises.findMany({
    where: { is_preset: true, muscle_group: "Shoulders" },
    orderBy: { name: "asc" },
    take: 2,
  });
}

describe("getWeightSteps", () => {
  it("returns {} for no ids", async () => {
    const { userId } = await createTestUser();
    expect(await getWeightSteps(prisma, userId, [])).toEqual({});
  });

  it("uses the muscle-group default without history", async () => {
    const { userId } = await createTestUser();
    const [preset] = await shoulderPresets();
    expect((await getWeightSteps(prisma, userId, [preset.id]))[preset.id]).toEqual({
      kg: 1.25,
      source: "default",
      autoKg: 1.25,
      autoSource: "default",
    });
  });

  it("infers from per-session top weights, ignoring warmups", async () => {
    const { userId } = await createTestUser();
    const [preset] = await shoulderPresets();
    // A 16 kg warmup is heavier than the first tops; if it counted as the top the gaps would differ.
    await logTops(userId, preset.id, [10, 12, 14], [16]);
    expect((await getWeightSteps(prisma, userId, [preset.id]))[preset.id]).toEqual({
      kg: 2,
      source: "history",
      autoKg: 2,
      autoSource: "history",
    });
  });
});

describe("getWeightSteps history signal", () => {
  const defaulted = { kg: 1.25, source: "default", autoKg: 1.25, autoSource: "default" };

  it("does not read a ramp within one session as a step", async () => {
    const { userId } = await createTestUser();
    const [preset] = await shoulderPresets();
    await logSession(userId, preset.id, [20, 40, 60, 80, 100]);
    expect((await getWeightSteps(prisma, userId, [preset.id]))[preset.id]).toEqual(defaulted);
  });

  it("ignores the top of an unfinished session", async () => {
    const { userId } = await createTestUser();
    const [preset] = await shoulderPresets();
    await logTops(userId, preset.id, [10, 12]);
    await logSession(userId, preset.id, [14], { finish: false });
    // Tops 10, 12 only: one gap is not enough; with 14 counted it would infer 2.
    expect((await getWeightSteps(prisma, userId, [preset.id]))[preset.id]).toEqual(defaulted);
  });

  it("ignores 0 kg sets", async () => {
    const { userId } = await createTestUser();
    const [preset] = await shoulderPresets();
    await logTops(userId, preset.id, [2, 4]);
    // logSetForUser rejects 0 kg, but older/imported rows can hold it: insert one directly.
    const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-10-01" });
    const se = await addExerciseToSessionForUser(prisma, userId, session.id, preset.id);
    await prisma.sets.create({
      data: { user_id: userId, session_exercise_id: se.id, exercise_id: preset.id, set_number: 1, weight_kg: 0, reps: 10 },
    });
    await finishSessionForUser(prisma, userId, session.id);
    // Tops 2, 4 only: one gap is not enough; with 0 counted it would infer 2.
    expect((await getWeightSteps(prisma, userId, [preset.id]))[preset.id]).toEqual(defaulted);
  });
});

describe("setWeightStepForUser", () => {
  it("sets, updates and clears a custom step", async () => {
    const { userId } = await createTestUser();
    const [preset] = await shoulderPresets();
    await logTops(userId, preset.id, [10, 12, 14]);

    expect(await setWeightStepForUser(prisma, userId, preset.id, { weightStepKg: 5 })).toEqual({
      kg: 5,
      source: "custom",
      autoKg: 2,
      autoSource: "history",
    });
    expect((await setWeightStepForUser(prisma, userId, preset.id, { weightStepKg: 2.5 })).kg).toBe(2.5);
    expect((await getWeightSteps(prisma, userId, [preset.id]))[preset.id].kg).toBe(2.5);

    expect(await setWeightStepForUser(prisma, userId, preset.id, { weightStepKg: null })).toEqual({
      kg: 2,
      source: "history",
      autoKg: 2,
      autoSource: "history",
    });
    expect(await prisma.exercise_settings.count({ where: { user_id: userId } })).toBe(0);
  });

  it("rejects invalid steps and unknown exercises", async () => {
    const { userId } = await createTestUser();
    const [preset] = await shoulderPresets();
    for (const weightStepKg of [0, 51, 1.234]) {
      await expect(setWeightStepForUser(prisma, userId, preset.id, { weightStepKg })).rejects.toThrow();
    }
    await expect(
      setWeightStepForUser(prisma, userId, "00000000-0000-0000-0000-000000000000", { weightStepKg: 2 })
    ).rejects.toThrow();
  });

  // Isolation: replaces the RLS guarantee now that queries run on a direct connection.
  it("keeps steps, custom exercises and history per user", async () => {
    const a = (await createTestUser()).userId;
    const b = (await createTestUser()).userId;
    const [p1, p2] = await shoulderPresets();

    // A's custom step on a shared preset is invisible to B.
    await setWeightStepForUser(prisma, a, p1.id, { weightStepKg: 5 });
    expect((await getWeightSteps(prisma, b, [p1.id]))[p1.id].source).toBe("default");

    // B can't read or set a step on A's custom exercise.
    const mine = await createCustomExerciseForUser(prisma, a, { name: "A Machine Press", muscleGroup: "Chest" });
    expect(await getWeightSteps(prisma, b, [mine.id])).toEqual({});
    await expect(setWeightStepForUser(prisma, b, mine.id, { weightStepKg: 2 })).rejects.toThrow();
    expect(await prisma.exercise_settings.count({ where: { exercise_id: mine.id } })).toBe(0);

    // B's history doesn't feed A's inference.
    await logTops(b, p2.id, [20, 25, 30]);
    expect((await getWeightSteps(prisma, a, [p2.id]))[p2.id].source).toBe("default");
    expect((await getWeightSteps(prisma, b, [p2.id]))[p2.id]).toMatchObject({ kg: 5, source: "history" });
  });
});
