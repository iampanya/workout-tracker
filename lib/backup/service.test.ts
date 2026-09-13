import "dotenv/config";
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestUser } from "@/lib/test-helpers";
import { prisma } from "@/lib/db";
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupFile } from "@/lib/validation";
import { exportUserData, importUserData } from "./service";

// Seeds one custom exercise, a routine referencing it, and a completed session with two sets.
async function seedWorkout(userId: string) {
  const exercise = await prisma.exercises.create({
    data: { user_id: userId, name: `Cable Fly ${randomUUID().slice(0, 8)}`, muscle_group: "Chest", is_preset: false },
  });
  const routine = await prisma.routines.create({ data: { user_id: userId, name: "Push Day" } });
  await prisma.routine_exercises.create({
    data: { user_id: userId, routine_id: routine.id, exercise_id: exercise.id, position: 0, target_sets: 3 },
  });
  const session = await prisma.sessions.create({
    data: { user_id: userId, name: "Push Day", session_date: new Date("2026-08-01"), completed_at: new Date() },
  });
  const sessionExercise = await prisma.session_exercises.create({
    data: { user_id: userId, session_id: session.id, exercise_id: exercise.id, position: 0 },
  });
  await prisma.sets.createMany({
    data: [
      { user_id: userId, session_exercise_id: sessionExercise.id, exercise_id: exercise.id, set_number: 1, weight_kg: 20, reps: 12, is_warmup: false },
      { user_id: userId, session_exercise_id: sessionExercise.id, exercise_id: exercise.id, set_number: 2, weight_kg: 22.5, reps: 10, is_warmup: false },
    ],
  });
  return { exerciseName: exercise.name, exerciseId: exercise.id };
}

describe("backup service", () => {
  let userA: string;
  let seeded: { exerciseName: string; exerciseId: string };
  let backup: BackupFile;

  beforeAll(async () => {
    userA = (await createTestUser()).userId;
    seeded = await seedWorkout(userA);
    backup = await exportUserData(prisma, userA);
  });

  it("exports all of the user's data in the backup file shape", () => {
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.data.exercises).toHaveLength(1);
    expect(backup.data.routines).toHaveLength(1);
    expect(backup.data.routine_exercises).toHaveLength(1);
    expect(backup.data.sessions).toHaveLength(1);
    expect(backup.data.session_exercises).toHaveLength(1);
    expect(backup.data.sets).toHaveLength(2);
    expect(backup.data.sessions[0]).not.toHaveProperty("user_id");
  });

  it("merge-imports another user's backup, reproducing every row", async () => {
    const b = (await createTestUser()).userId;
    const summary = await importUserData(prisma, b, backup, "merge");
    expect(summary).toMatchObject({
      exercises: 1,
      routines: 1,
      routine_exercises: 1,
      sessions: 1,
      session_exercises: 1,
      sets: 2,
    });

    const roundTrip = await exportUserData(prisma, b);
    expect(roundTrip.data.sets.map((s) => s.weight_kg).sort()).toEqual([20, 22.5]);
    expect(roundTrip.data.exercises[0].name).toBe(seeded.exerciseName);
  });

  it("merge is idempotent — re-importing a backup into its own account inserts nothing", async () => {
    const summary = await importUserData(prisma, userA, backup, "merge");
    expect(summary).toMatchObject({
      exercises: 0,
      routines: 0,
      routine_exercises: 0,
      sessions: 0,
      session_exercises: 0,
      sets: 0,
    });
  });

  it("replace wipes existing data before restoring from the file", async () => {
    const b = (await createTestUser()).userId;
    await seedWorkout(b);
    const before = await exportUserData(prisma, b);
    expect(before.data.sessions).toHaveLength(1);

    await importUserData(prisma, b, backup, "replace");
    const after = await exportUserData(prisma, b);
    expect(after.data.sessions).toHaveLength(1);
    expect(after.data.exercises).toHaveLength(1);
    expect(after.data.exercises[0].name).toBe(seeded.exerciseName);
  });

  it("remaps a file exercise onto an existing preset instead of duplicating it", async () => {
    const b = (await createTestUser()).userId;
    const preset = await prisma.exercises.findFirst({
      where: { is_preset: true },
      select: { id: true, name: true },
    });
    if (!preset) throw new Error("expected a preset exercise to exist");

    const sessionId = randomUUID();
    const seId = randomUUID();
    const fileExId = randomUUID();
    const file: BackupFile = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exported_at: new Date().toISOString(),
      data: {
        exercises: [
          { id: fileExId, name: preset.name, muscle_group: null, is_archived: false, created_at: new Date().toISOString() },
        ],
        routines: [],
        routine_exercises: [],
        sessions: [
          { id: sessionId, routine_id: null, name: "T", session_date: "2026-08-02", started_at: new Date().toISOString(), completed_at: null, notes: null },
        ],
        session_exercises: [
          { id: seId, session_id: sessionId, exercise_id: fileExId, position: 0, notes: null },
        ],
        sets: [],
      },
    };

    const summary = await importUserData(prisma, b, file, "merge");
    expect(summary.exercises).toBe(0); // matched the preset, nothing inserted

    const customs = await prisma.exercises.findMany({ where: { user_id: b }, select: { id: true } });
    expect(customs).toHaveLength(0);

    const se = await prisma.session_exercises.findUnique({
      where: { id: seId },
      select: { exercise_id: true },
    });
    expect(se?.exercise_id).toBe(preset.id);
  });

  it("rolls back a failed replace, leaving existing data intact (atomic)", async () => {
    const b = (await createTestUser()).userId;
    await seedWorkout(b);

    // A structurally valid file whose two sets collide on (session_exercise_id, set_number),
    // which trips the unique constraint mid-insert — after the replace deletes have run.
    const sessionId = randomUUID();
    const seId = randomUUID();
    const exId = randomUUID();
    const corrupt: BackupFile = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exported_at: new Date().toISOString(),
      data: {
        exercises: [{ id: exId, name: `Broken ${randomUUID().slice(0, 8)}`, muscle_group: null, is_archived: false, created_at: new Date().toISOString() }],
        routines: [],
        routine_exercises: [],
        sessions: [{ id: sessionId, routine_id: null, name: "X", session_date: "2026-08-03", started_at: new Date().toISOString(), completed_at: null, notes: null }],
        session_exercises: [{ id: seId, session_id: sessionId, exercise_id: exId, position: 0, notes: null }],
        sets: [
          { id: randomUUID(), session_exercise_id: seId, exercise_id: exId, set_number: 1, weight_kg: 10, reps: 5, is_warmup: false, created_at: new Date().toISOString() },
          { id: randomUUID(), session_exercise_id: seId, exercise_id: exId, set_number: 1, weight_kg: 12, reps: 5, is_warmup: false, created_at: new Date().toISOString() },
        ],
      },
    };

    await expect(importUserData(prisma, b, corrupt, "replace")).rejects.toThrow();

    const after = await exportUserData(prisma, b);
    expect(after.data.sessions).toHaveLength(1);
    expect(after.data.sets).toHaveLength(2);
  });
});
