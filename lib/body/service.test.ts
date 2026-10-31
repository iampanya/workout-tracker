import "dotenv/config";
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser } from "@/lib/test-helpers";
import { sampleScan } from "./fixtures";
import {
  addExerciseToSessionForUser,
  finishSessionForUser,
  logSetForUser,
  startSessionForUser,
} from "@/lib/sessions/service";
import {
  BodyImportError,
  countWorkingSetsByMuscleGroup,
  deleteBodyScanForUser,
  getBodyScan,
  getLatestBodySummary,
  importBodyScansForUser,
  listBodyGoals,
  listBodyScans,
  replaceBodyGoalsForUser,
} from "./service";

const file = (...scans: unknown[]) => ({ version: 1, source: "arboleaf", scans });

describe("body scans service", () => {
  it("imports scans and lists them oldest first, as numbers with the Bangkok scan date", async () => {
    const { userId } = await createTestUser();
    const result = await importBodyScansForUser(
      prisma,
      userId,
      file(sampleScan(), sampleScan({ measured_at: "2026-10-11T06:30:00+07:00", weight_kg: 81.2 }))
    );
    expect(result).toEqual({ imported: 2, replaced: 0 });

    const scans = await listBodyScans(prisma, userId);
    expect(scans.map((s) => s.weight_kg)).toEqual([81.2, 80]);
    expect(scans[1]).toMatchObject({
      measured_at: "2026-10-18T02:58:00.000Z",
      scan_date: "2026-10-18",
      source: "arboleaf",
      body_fat_pct: 22,
      bmr_kcal: 1720,
    });
    expect(scans[1].segments?.left_arm?.lean_kg).toBe(3.4);
    expect(scans[1].report?.weight_control?.fat_kg).toBe(-7);
  });

  it("dates an early-morning scan by its Bangkok day", async () => {
    const { userId } = await createTestUser();
    await importBodyScansForUser(prisma, userId, file(sampleScan({ measured_at: "2026-10-18T06:00:00+07:00" })));
    const [scan] = await listBodyScans(prisma, userId);
    expect(scan.scan_date).toBe("2026-10-18");
  });

  it("re-importing the same measured_at replaces the scan, clearing fields left out", async () => {
    const { userId } = await createTestUser();
    await importBodyScansForUser(prisma, userId, file(sampleScan()));
    const result = await importBodyScansForUser(
      prisma,
      userId,
      file({ measured_at: "2026-10-18T02:58:00Z", weight_kg: 79.5 })
    );
    expect(result).toEqual({ imported: 1, replaced: 1 });

    const scans = await listBodyScans(prisma, userId);
    expect(scans).toHaveLength(1);
    expect(scans[0]).toMatchObject({ weight_kg: 79.5, bmi: null, segments: null, report: null });
  });

  it("rejects bad files with a translatable code", async () => {
    const { userId } = await createTestUser();
    await expect(importBodyScansForUser(prisma, userId, { version: 2, scans: [] })).rejects.toMatchObject({
      code: "unsupportedVersion",
    });
    await expect(
      importBodyScansForUser(prisma, userId, file({ measured_at: "2026-10-18T09:58:00", weight_kg: 80 }))
    ).rejects.toBeInstanceOf(BodyImportError);
    expect(await listBodyScans(prisma, userId)).toEqual([]);
  });

  it("returns null for a malformed or unknown id", async () => {
    const { userId } = await createTestUser();
    expect(await getBodyScan(prisma, userId, "not-a-uuid")).toBeNull();
    expect(await getBodyScan(prisma, userId, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  // Isolation: replaces the RLS guarantee now that queries run on a direct connection.
  it("never reads, replaces or deletes another user's scan", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await importBodyScansForUser(prisma, b.userId, file(sampleScan()));
    const [theirs] = await listBodyScans(prisma, b.userId);

    expect(await listBodyScans(prisma, a.userId)).toEqual([]);
    expect(await getBodyScan(prisma, a.userId, theirs.id)).toBeNull();
    expect(await getLatestBodySummary(prisma, a.userId)).toBeNull();
    await expect(deleteBodyScanForUser(prisma, a.userId, theirs.id)).rejects.toThrow();

    // Same measured_at from A creates A's own row and leaves B's untouched.
    const result = await importBodyScansForUser(prisma, a.userId, file(sampleScan({ weight_kg: 60 })));
    expect(result.replaced).toBe(0);
    expect((await getBodyScan(prisma, b.userId, theirs.id))?.weight_kg).toBe(80);

    await deleteBodyScanForUser(prisma, b.userId, theirs.id);
    expect(await listBodyScans(prisma, b.userId)).toEqual([]);
    expect(await listBodyScans(prisma, a.userId)).toHaveLength(1);
  });

  it("summarizes the latest scan and the one before it", async () => {
    const { userId } = await createTestUser();
    expect(await getLatestBodySummary(prisma, userId)).toBeNull();

    await importBodyScansForUser(prisma, userId, file(sampleScan({ measured_at: "2026-10-01T07:00:00+07:00", weight_kg: 82 })));
    expect(await getLatestBodySummary(prisma, userId)).toMatchObject({ latest: { weight_kg: 82 }, previous: null });

    await importBodyScansForUser(prisma, userId, file(sampleScan()));
    expect(await getLatestBodySummary(prisma, userId)).toMatchObject({
      latest: { weight_kg: 80 },
      previous: { weight_kg: 82 },
    });
  });
});

describe("body goals", () => {
  it("starts new goals from the latest scan and keeps start_value when only the target changes", async () => {
    const { userId } = await createTestUser();
    await importBodyScansForUser(
      prisma,
      userId,
      file(sampleScan({ measured_at: "2026-10-01T07:00:00+07:00", weight_kg: 82 }), sampleScan())
    );

    expect(
      await replaceBodyGoalsForUser(prisma, userId, [
        { metric: "weight_kg", target: 75 },
        { metric: "skeletal_muscle_kg", target: 37 },
      ])
    ).toEqual([
      { metric: "weight_kg", target: 75, start_value: 80 },
      { metric: "skeletal_muscle_kg", target: 37, start_value: 35 },
    ]);

    await importBodyScansForUser(prisma, userId, file(sampleScan({ measured_at: "2026-10-25T07:00:00+07:00", weight_kg: 78 })));
    // Muscle goal dropped; weight goal keeps its original start.
    expect(await replaceBodyGoalsForUser(prisma, userId, [{ metric: "weight_kg", target: 74 }])).toEqual([
      { metric: "weight_kg", target: 74, start_value: 80 },
    ]);
    expect(await listBodyGoals(prisma, userId)).toEqual([{ metric: "weight_kg", target: 74, start_value: 80 }]);
  });

  it("switching fat goal metric replaces the old fat goal", async () => {
    const { userId } = await createTestUser();
    await importBodyScansForUser(prisma, userId, file(sampleScan()));
    await replaceBodyGoalsForUser(prisma, userId, [{ metric: "body_fat_pct", target: 15 }]);
    expect(await replaceBodyGoalsForUser(prisma, userId, [{ metric: "body_fat_kg", target: 12 }])).toEqual([
      { metric: "body_fat_kg", target: 12, start_value: 17.6 },
    ]);
  });

  it("rejects invalid goal sets and goals with no baseline scan", async () => {
    const { userId } = await createTestUser();
    await expect(replaceBodyGoalsForUser(prisma, userId, [{ metric: "weight_kg", target: 75 }])).rejects.toThrow();
    await importBodyScansForUser(prisma, userId, file(sampleScan()));
    await expect(
      replaceBodyGoalsForUser(prisma, userId, [
        { metric: "body_fat_pct", target: 15 },
        { metric: "body_fat_kg", target: 12 },
      ])
    ).rejects.toThrow();
    expect(await listBodyGoals(prisma, userId)).toEqual([]);
  });

  it("isolation: goals are per user", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await importBodyScansForUser(prisma, a.userId, file(sampleScan()));
    await importBodyScansForUser(prisma, b.userId, file(sampleScan({ weight_kg: 90 })));
    await replaceBodyGoalsForUser(prisma, a.userId, [{ metric: "weight_kg", target: 75 }]);
    await replaceBodyGoalsForUser(prisma, b.userId, [{ metric: "weight_kg", target: 85 }]);

    // Clearing A's goals leaves B's alone.
    await replaceBodyGoalsForUser(prisma, a.userId, []);
    expect(await listBodyGoals(prisma, a.userId)).toEqual([]);
    expect(await listBodyGoals(prisma, b.userId)).toEqual([{ metric: "weight_kg", target: 85, start_value: 90 }]);
  });
});

describe("countWorkingSetsByMuscleGroup", () => {
  it("counts completed working sets per muscle group within the window, for the user only", async () => {
    const { userId } = await createTestUser();
    const other = await createTestUser();
    const legs = await prisma.exercises.findFirstOrThrow({ where: { is_preset: true, muscle_group: "Legs" } });
    const chest = await prisma.exercises.findFirstOrThrow({ where: { is_preset: true, muscle_group: "Chest" } });

    async function logSession(
      ownerId: string,
      date: string,
      sets: { exerciseId: string; isWarmup: boolean }[],
      finish = true
    ) {
      const session = await startSessionForUser(prisma, ownerId, { sessionDate: date });
      const seByExercise = new Map<string, string>();
      for (const { exerciseId, isWarmup } of sets) {
        if (!seByExercise.has(exerciseId)) {
          const se = await addExerciseToSessionForUser(prisma, ownerId, session.id, exerciseId);
          seByExercise.set(exerciseId, se.id);
        }
        await logSetForUser(prisma, ownerId, {
          sessionExerciseId: seByExercise.get(exerciseId),
          weightKg: 50,
          reps: 5,
          isWarmup,
        });
      }
      if (finish) await finishSessionForUser(prisma, ownerId, session.id);
    }

    await logSession(userId, "2026-10-10", [
      { exerciseId: legs.id, isWarmup: true },
      { exerciseId: legs.id, isWarmup: false },
      { exerciseId: legs.id, isWarmup: false },
      { exerciseId: chest.id, isWarmup: false },
    ]);
    await logSession(userId, "2026-09-01", [{ exerciseId: legs.id, isWarmup: false }]); // before the window
    await logSession(userId, "2026-10-12", [{ exerciseId: chest.id, isWarmup: false }], false); // in progress
    await logSession(other.userId, "2026-10-10", [{ exerciseId: legs.id, isWarmup: false }]);

    const counts = await countWorkingSetsByMuscleGroup(prisma, userId, "2026-10-01", "2026-10-28");
    expect([...counts].sort((x, y) => String(x.muscle_group).localeCompare(String(y.muscle_group)))).toEqual([
      { muscle_group: "Chest", sets: 1 },
      { muscle_group: "Legs", sets: 2 },
    ]);
  });
});
