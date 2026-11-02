import "dotenv/config";
import { describe, it, expect } from "vitest";
import { createTestUser } from "@/lib/test-helpers";
import { prisma } from "@/lib/db";
import { createCustomExerciseForUser } from "@/lib/exercises/service";
import { addExerciseToRoutineForUser, createRoutineForUser } from "@/lib/routines/service";
import {
  addExerciseToSessionForUser,
  finishSessionForUser,
  logSetForUser,
  removeExerciseFromSessionForUser,
  startSessionForUser,
} from "@/lib/sessions/service";
import { getInsights } from "./service";

const TODAY = "2026-11-04"; // window starts 2026-09-14, 28-day volume from 2026-10-08

const uniqueName = (label: string) => `${label} ${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function seed(
  userId: string,
  exerciseId: string,
  date: string,
  sets: { weightKg: number; reps: number; isWarmup?: boolean }[],
  finish = true
) {
  const session = await startSessionForUser(prisma, userId, { sessionDate: date });
  const se = await addExerciseToSessionForUser(prisma, userId, session.id, exerciseId);
  for (const s of sets) {
    await logSetForUser(prisma, userId, {
      sessionExerciseId: se.id,
      weightKg: s.weightKg,
      reps: s.reps,
      isWarmup: s.isWarmup ?? false,
    });
  }
  if (finish) await finishSessionForUser(prisma, userId, session.id);
}

describe("getInsights", () => {
  it("analyses completed sessions inside the window only, working sets only", async () => {
    const { userId } = await createTestUser();
    const bench = await createCustomExerciseForUser(prisma, userId, { name: uniqueName("Bench"), muscleGroup: "Chest" });
    await seed(userId, bench.id, "2026-09-01", [{ weightKg: 60, reps: 10 }]); // before the window
    await seed(userId, bench.id, "2026-10-20", [
      { weightKg: 30, reps: 10, isWarmup: true },
      { weightKg: 60, reps: 10 },
      { weightKg: 60, reps: 10 },
    ]);
    await seed(userId, bench.id, "2026-10-27", [{ weightKg: 60, reps: 10 }, { weightKg: 60, reps: 10 }]);
    await seed(userId, bench.id, "2026-11-03", [{ weightKg: 99, reps: 1 }], false); // unfinished

    const insights = await getInsights(prisma, userId, TODAY);
    expect(insights.hasEnoughData).toBe(true);
    expect(insights.consistency.weeks.reduce((n, w) => n + w.sessions, 0)).toBe(2);
    expect(insights.muscleVolume.find((v) => v.group === "Chest")?.setsPerWeek).toBe(1);
    expect(insights.consistency.weeks.find((w) => w.weekStart === "2026-10-19")?.volumeKg).toBe(1200);
  });

  it("flags routine exercises the user keeps skipping", async () => {
    const { userId } = await createTestUser();
    const a = await createCustomExerciseForUser(prisma, userId, { name: uniqueName("A"), muscleGroup: "Back" });
    const b = await createCustomExerciseForUser(prisma, userId, { name: uniqueName("B"), muscleGroup: "Back" });
    const routine = await createRoutineForUser(prisma, userId, { name: "Pull" });
    await addExerciseToRoutineForUser(prisma, userId, { routineId: routine.id, exerciseId: a.id });
    await addExerciseToRoutineForUser(prisma, userId, { routineId: routine.id, exerciseId: b.id });

    for (const date of ["2026-10-20", "2026-10-27"]) {
      const session = await startSessionForUser(prisma, userId, { routineId: routine.id, sessionDate: date });
      const entries = await prisma.session_exercises.findMany({ where: { session_id: session.id } });
      const entryA = entries.find((e) => e.exercise_id === a.id)!;
      const entryB = entries.find((e) => e.exercise_id === b.id)!;
      await logSetForUser(prisma, userId, { sessionExerciseId: entryA.id, weightKg: 50, reps: 10, isWarmup: false });
      await removeExerciseFromSessionForUser(prisma, userId, entryB.id);
      await finishSessionForUser(prisma, userId, session.id);
    }

    const insights = await getInsights(prisma, userId, TODAY);
    expect(insights.consistency.skipped).toEqual([
      { routineId: routine.id, routineName: "Pull", exerciseId: b.id, exerciseName: b.name, skipped: 2, sessions: 2 },
    ]);
  });

  it("never includes another user's training", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const bench = await createCustomExerciseForUser(prisma, owner.userId, { name: uniqueName("Bench"), muscleGroup: "Chest" });
    await seed(owner.userId, bench.id, "2026-10-20", [{ weightKg: 60, reps: 10 }]);
    await seed(owner.userId, bench.id, "2026-10-27", [{ weightKg: 60, reps: 10 }]);

    const insights = await getInsights(prisma, other.userId, TODAY);
    expect(insights.hasEnoughData).toBe(false);
    expect(insights.consistency.weeks.every((w) => w.sessions === 0)).toBe(true);
    expect(insights.trends).toEqual([]);
  });
});
