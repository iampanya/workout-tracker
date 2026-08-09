import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { listExercises, createCustomExerciseForUser, archiveExerciseForUser } from "./service";
import type { Database } from "@/lib/supabase/database.types";

describe("exercises service", () => {
  const admin = createAdminClient();
  let userId: string;
  let client: SupabaseClient<Database>;

  beforeAll(async () => {
    const testUser = await createTestUser(admin);
    userId = testUser.userId;
    client = testUser.client;
  });

  it("lists preset exercises for a fresh user", async () => {
    const exercises = await listExercises(client);
    expect(exercises.some((e) => e.is_preset)).toBe(true);
  });

  it("creates a custom exercise owned by the user", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: "Cable Fly",
      muscleGroup: "Chest",
    });
    expect(exercise.user_id).toBe(userId);
    expect(exercise.is_preset).toBe(false);
  });

  it("rejects an invalid exercise name", async () => {
    await expect(createCustomExerciseForUser(client, userId, { name: "" })).rejects.toThrow();
  });

  it("archives a custom exercise so it's excluded from the default list", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, { name: "Temp Exercise" });
    await archiveExerciseForUser(client, userId, exercise.id);
    const exercises = await listExercises(client);
    expect(exercises.find((e) => e.id === exercise.id)).toBeUndefined();
  });
});
