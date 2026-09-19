import "dotenv/config";
import { describe, it, expect, beforeAll } from "vitest";
import { createTestUser } from "@/lib/test-helpers";
import { prisma } from "@/lib/db";
import { listExercises, createCustomExerciseForUser, archiveExerciseForUser } from "./service";

describe("exercises service", () => {
  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    // Users are created directly in public.users via Prisma; the trigger provisions the profile.
    userId = (await createTestUser()).userId;
    otherUserId = (await createTestUser()).userId;
  });

  it("lists preset exercises for a fresh user", async () => {
    const exercises = await listExercises(prisma, userId);
    expect(exercises.some((e) => e.is_preset)).toBe(true);
  });

  it("creates a custom exercise owned by the user", async () => {
    const exercise = await createCustomExerciseForUser(prisma, userId, {
      name: "Cable Fly",
      muscleGroup: "Chest",
    });
    expect(exercise.user_id).toBe(userId);
    expect(exercise.is_preset).toBe(false);
  });

  it("rejects an invalid exercise name", async () => {
    await expect(createCustomExerciseForUser(prisma, userId, { name: "" })).rejects.toThrow();
  });

  it("archives a custom exercise so it's excluded from the default list", async () => {
    const exercise = await createCustomExerciseForUser(prisma, userId, {
      name: "Temp Exercise",
      muscleGroup: "Legs",
    });
    await archiveExerciseForUser(prisma, userId, exercise.id);
    const exercises = await listExercises(prisma, userId);
    expect(exercises.find((e) => e.id === exercise.id)).toBeUndefined();
  });

  it("rejects a duplicate exercise name that differs only by case", async () => {
    await createCustomExerciseForUser(prisma, userId, { name: "Incline Press", muscleGroup: "Chest" });
    await expect(
      createCustomExerciseForUser(prisma, userId, { name: "incline press", muscleGroup: "Chest" })
    ).rejects.toThrow();
  });

  it("throws when archiving an exercise that doesn't exist or isn't owned by the user", async () => {
    await expect(
      archiveExerciseForUser(prisma, userId, "00000000-0000-0000-0000-000000000000")
    ).rejects.toThrow();
  });

  // Isolation: replaces the RLS guarantee now that queries run on a direct connection.
  it("does not leak or let a user mutate another user's exercise", async () => {
    const theirs = await createCustomExerciseForUser(prisma, otherUserId, {
      name: "Their Secret Lift",
      muscleGroup: "Back",
    });
    // A's list must not include B's custom exercise.
    const mine = await listExercises(prisma, userId);
    expect(mine.find((e) => e.id === theirs.id)).toBeUndefined();
    // A cannot archive B's exercise...
    await expect(archiveExerciseForUser(prisma, userId, theirs.id)).rejects.toThrow();
    // ...and it stays unarchived for B.
    const stillTheirs = await listExercises(prisma, otherUserId);
    expect(stillTheirs.find((e) => e.id === theirs.id)).toBeDefined();
  });
});
