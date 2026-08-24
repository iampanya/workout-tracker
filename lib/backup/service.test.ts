import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import type { Database } from "@/lib/supabase/database.types";
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupFile } from "@/lib/validation";
import { exportUserData, importUserData } from "./service";

type Client = SupabaseClient<Database>;

// Seeds one custom exercise, a routine referencing it, and a completed session
// with two logged sets. Returns the counts so tests can assert round-trips.
async function seedWorkout(client: Client, userId: string) {
  const { data: exercise, error: exErr } = await client
    .from("exercises")
    .insert({ user_id: userId, name: `Cable Fly ${randomUUID().slice(0, 8)}`, muscle_group: "Chest", is_preset: false })
    .select()
    .single();
  if (exErr || !exercise) throw exErr ?? new Error("seed exercise failed");

  const { data: routine, error: rErr } = await client
    .from("routines")
    .insert({ user_id: userId, name: "Push Day" })
    .select()
    .single();
  if (rErr || !routine) throw rErr ?? new Error("seed routine failed");

  const { error: reErr } = await client.from("routine_exercises").insert({
    user_id: userId,
    routine_id: routine.id,
    exercise_id: exercise.id,
    position: 0,
    target_sets: 3,
  });
  if (reErr) throw reErr;

  const { data: session, error: sErr } = await client
    .from("sessions")
    .insert({ user_id: userId, name: "Push Day", session_date: "2026-08-01", completed_at: new Date().toISOString() })
    .select()
    .single();
  if (sErr || !session) throw sErr ?? new Error("seed session failed");

  const { data: sessionExercise, error: seErr } = await client
    .from("session_exercises")
    .insert({ user_id: userId, session_id: session.id, exercise_id: exercise.id, position: 0 })
    .select()
    .single();
  if (seErr || !sessionExercise) throw seErr ?? new Error("seed session_exercise failed");

  const { error: setErr } = await client.from("sets").insert([
    { user_id: userId, session_exercise_id: sessionExercise.id, exercise_id: exercise.id, set_number: 1, weight_kg: 20, reps: 12, is_warmup: false },
    { user_id: userId, session_exercise_id: sessionExercise.id, exercise_id: exercise.id, set_number: 2, weight_kg: 22.5, reps: 10, is_warmup: false },
  ]);
  if (setErr) throw setErr;

  return { exerciseName: exercise.name, exerciseId: exercise.id };
}

describe("backup service", () => {
  const admin = createAdminClient();
  let userA: string;
  let clientA: Client;
  let seeded: { exerciseName: string; exerciseId: string };
  let backup: BackupFile;

  beforeAll(async () => {
    const a = await createTestUser(admin);
    userA = a.userId;
    clientA = a.client;
    seeded = await seedWorkout(clientA, userA);
    backup = await exportUserData(clientA, userA);
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
    // user_id is never written to the file.
    expect(backup.data.sessions[0]).not.toHaveProperty("user_id");
  });

  it("merge-imports another user's backup, reproducing every row", async () => {
    const b = await createTestUser(admin);
    const summary = await importUserData(b.client, backup, "merge");
    expect(summary).toMatchObject({
      exercises: 1,
      routines: 1,
      routine_exercises: 1,
      sessions: 1,
      session_exercises: 1,
      sets: 2,
    });

    // The restored data is owned by user B and reads back identically.
    const roundTrip = await exportUserData(b.client, b.userId);
    expect(roundTrip.data.sets.map((s) => s.weight_kg).sort()).toEqual([20, 22.5]);
    expect(roundTrip.data.exercises[0].name).toBe(seeded.exerciseName);
  });

  it("merge is idempotent — re-importing a backup into its own account inserts nothing", async () => {
    // userA already holds exactly this backup's rows (ids owned by A → skipped;
    // exercises dedupe by name). This is the real backup/restore case: pulling
    // your own backup back in must never duplicate.
    const summary = await importUserData(clientA, backup, "merge");
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
    const b = await createTestUser(admin);
    // Give B some unrelated data of their own first.
    await seedWorkout(b.client, b.userId);
    const before = await exportUserData(b.client, b.userId);
    expect(before.data.sessions).toHaveLength(1);

    await importUserData(b.client, backup, "replace");
    const after = await exportUserData(b.client, b.userId);
    // B's own session is gone; only the file's single session remains.
    expect(after.data.sessions).toHaveLength(1);
    expect(after.data.exercises).toHaveLength(1);
    expect(after.data.exercises[0].name).toBe(seeded.exerciseName);
  });

  it("remaps a file exercise onto an existing preset instead of duplicating it", async () => {
    const b = await createTestUser(admin);
    const { data: preset } = await b.client
      .from("exercises")
      .select("id, name")
      .eq("is_preset", true)
      .limit(1)
      .single();
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

    const summary = await importUserData(b.client, file, "merge");
    expect(summary.exercises).toBe(0); // matched the preset, nothing inserted

    // No custom exercise was created for B, and the child points at the preset.
    const { data: customs } = await b.client
      .from("exercises")
      .select("id")
      .eq("user_id", b.userId);
    expect(customs ?? []).toHaveLength(0);

    const { data: se } = await b.client
      .from("session_exercises")
      .select("exercise_id")
      .eq("id", seId)
      .single();
    expect(se?.exercise_id).toBe(preset.id);
  });

  it("rolls back a failed replace, leaving existing data intact (atomic)", async () => {
    const b = await createTestUser(admin);
    await seedWorkout(b.client, b.userId);

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

    await expect(importUserData(b.client, corrupt, "replace")).rejects.toThrow();

    // The replace's deletes were rolled back — B's original workout survives.
    const after = await exportUserData(b.client, b.userId);
    expect(after.data.sessions).toHaveLength(1);
    expect(after.data.sets).toHaveLength(2);
  });
});
