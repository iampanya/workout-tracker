import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import type { Database } from "@/lib/supabase/database.types";
import { TEST_USER } from "./helpers/test-user";

// Loaded already by playwright.config.ts, but load again so this file also works if run
// standalone. dotenv won't overwrite vars that are already set.
dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Find an auth user by email, paging through GoTrue's admin list. */
async function findUserIdByEmail(
  admin: SupabaseClient<Database>,
  email: string
): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email === email);
    if (match) return match.id;
    if (data.users.length < 200) break; // last page
  }
  return null;
}

/**
 * Reset-then-create the single E2E test user before the suite runs. Deleting the auth
 * user cascades to `profiles` and all workout data (every table FKs auth.users(id) ON
 * DELETE CASCADE — see supabase/migrations/0001_init.sql & 0003), so each run starts from
 * a clean, deterministic state. Login is by username, which requires a matching `profiles`
 * row that createUser alone does not make — so we insert it explicitly (service role
 * bypasses RLS, mirroring the real signup action).
 */
export default async function globalSetup() {
  if (!url || !serviceKey) {
    throw new Error(
      "E2E setup: missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. " +
        "Start Supabase locally (`supabase start`) and populate .env.local."
    );
  }

  const admin = createClient<Database>(url, serviceKey);

  const existingId = await findUserIdByEmail(admin, TEST_USER.email);
  if (existingId) {
    const { error } = await admin.auth.admin.deleteUser(existingId);
    if (error) throw error;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: TEST_USER.email,
    password: TEST_USER.password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("E2E setup: failed to create test user");

  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: data.user.id, username: TEST_USER.username, referral_code: "E2ETESTR" });
  if (profileError) throw profileError;
}
