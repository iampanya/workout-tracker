import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "node:path";
import type { Database } from "./database.types";

// Vitest (unlike Next.js) does not auto-load .env.local, so point dotenv at it explicitly.
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

describe("database schema and RLS", () => {
  const admin = createClient<Database>(url, serviceKey);
  let userA: string;
  let userB: string;
  let clientA: ReturnType<typeof createClient<Database>>;

  beforeAll(async () => {
    const a = await admin.auth.admin.createUser({
      email: `a-${Date.now()}@test.local`,
      password: "password123",
      email_confirm: true,
    });
    const b = await admin.auth.admin.createUser({
      email: `b-${Date.now()}@test.local`,
      password: "password123",
      email_confirm: true,
    });
    userA = a.data.user!.id;
    userB = b.data.user!.id;

    clientA = createClient<Database>(url, anonKey);
    await clientA.auth.signInWithPassword({
      email: a.data.user!.email!,
      password: "password123",
    });
  });

  it("seeds preset exercises with user_id null", async () => {
    const { data, error } = await admin
      .from("exercises")
      .select("id")
      .eq("is_preset", true)
      .is("user_id", null);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it("lets a user create a routine owned by them", async () => {
    const { data, error } = await clientA
      .from("routines")
      .insert({ user_id: userA, name: "Push Day" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data!.user_id).toBe(userA);
  });

  it("blocks a user from reading another user's routine (RLS)", async () => {
    const { data: created } = await admin
      .from("routines")
      .insert({ user_id: userB, name: "User B Routine" })
      .select()
      .single();

    const { data, error } = await clientA
      .from("routines")
      .select("*")
      .eq("id", created!.id);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("computes PR live via the exercise_prs view, excluding warmups", async () => {
    const { data: exercise } = await admin
      .from("exercises")
      .select("id")
      .eq("is_preset", true)
      .limit(1)
      .single();

    const { data: session } = await admin
      .from("sessions")
      .insert({ user_id: userA, session_date: "2026-01-05" })
      .select()
      .single();
    const { data: sessionExercise } = await admin
      .from("session_exercises")
      .insert({
        session_id: session!.id,
        user_id: userA,
        exercise_id: exercise!.id,
        position: 0,
      })
      .select()
      .single();
    await admin.from("sets").insert([
      {
        session_exercise_id: sessionExercise!.id,
        user_id: userA,
        exercise_id: exercise!.id,
        set_number: 1,
        weight_kg: 999,
        reps: 5,
        is_warmup: true,
      },
      {
        session_exercise_id: sessionExercise!.id,
        user_id: userA,
        exercise_id: exercise!.id,
        set_number: 2,
        weight_kg: 100,
        reps: 5,
        is_warmup: false,
      },
    ]);

    const { data: pr, error } = await admin
      .from("exercise_prs")
      .select("pr_weight_kg")
      .eq("user_id", userA)
      .eq("exercise_id", exercise!.id)
      .single();

    expect(error).toBeNull();
    expect(Number(pr!.pr_weight_kg)).toBe(100); // the 999 warmup is excluded
  });

  it("blocks a user from reading another user's PRs through the exercise_prs view (RLS through view)", async () => {
    const { data: exercise } = await admin
      .from("exercises")
      .select("id")
      .eq("is_preset", true)
      .limit(1)
      .single();

    const { data: session } = await admin
      .from("sessions")
      .insert({ user_id: userB, session_date: "2026-01-06" })
      .select()
      .single();
    const { data: sessionExercise } = await admin
      .from("session_exercises")
      .insert({
        session_id: session!.id,
        user_id: userB,
        exercise_id: exercise!.id,
        position: 0,
      })
      .select()
      .single();
    await admin.from("sets").insert({
      session_exercise_id: sessionExercise!.id,
      user_id: userB,
      exercise_id: exercise!.id,
      set_number: 1,
      weight_kg: 250,
      reps: 3,
      is_warmup: false,
    });

    // Sanity check: the admin (service_role) client, which bypasses RLS,
    // really does see userB's PR row via the view.
    const { data: adminView } = await admin
      .from("exercise_prs")
      .select("pr_weight_kg")
      .eq("user_id", userB)
      .eq("exercise_id", exercise!.id)
      .single();
    expect(Number(adminView!.pr_weight_kg)).toBe(250);

    // clientA is authenticated as userA. Querying the view for userB's PR
    // must return nothing: without `security_invoker = true` on the view,
    // Postgres would evaluate RLS as the view's owner (a superuser that
    // bypasses RLS), leaking userB's PR to userA.
    const { data, error } = await clientA
      .from("exercise_prs")
      .select("pr_weight_kg")
      .eq("user_id", userB)
      .eq("exercise_id", exercise!.id);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
