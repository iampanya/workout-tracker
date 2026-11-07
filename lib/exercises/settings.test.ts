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

// One completed session of `exerciseId` with the given working (and warmup) weights.
async function logWeights(userId: string, exerciseId: string, working: number[], warmups: number[] = []) {
  const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-10-01" });
  const se = await addExerciseToSessionForUser(prisma, userId, session.id, exerciseId);
  for (const weightKg of warmups) {
    await logSetForUser(prisma, userId, { sessionExerciseId: se.id, weightKg, reps: 10, isWarmup: true });
  }
  for (const weightKg of working) {
    await logSetForUser(prisma, userId, { sessionExerciseId: se.id, weightKg, reps: 8, isWarmup: false });
  }
  await finishSessionForUser(prisma, userId, session.id);
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

  it("infers from logged working weights, ignoring warmups", async () => {
    const { userId } = await createTestUser();
    const [preset] = await shoulderPresets();
    // Warmups 11/13 would make the gap 1 if they counted.
    await logWeights(userId, preset.id, [10, 12, 14], [11, 13]);
    expect((await getWeightSteps(prisma, userId, [preset.id]))[preset.id]).toEqual({
      kg: 2,
      source: "history",
      autoKg: 2,
      autoSource: "history",
    });
  });
});

describe("setWeightStepForUser", () => {
  it("sets, updates and clears a custom step", async () => {
    const { userId } = await createTestUser();
    const [preset] = await shoulderPresets();
    await logWeights(userId, preset.id, [10, 12, 14]);

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
    await logWeights(b, p2.id, [20, 25, 30]);
    expect((await getWeightSteps(prisma, a, [p2.id]))[p2.id].source).toBe("default");
    expect((await getWeightSteps(prisma, b, [p2.id]))[p2.id]).toMatchObject({ kg: 5, source: "history" });
  });
});
