import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import "dotenv/config";
import type { Database } from "./database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function createAdminClient(): SupabaseClient<Database> {
  return createClient<Database>(url, serviceKey);
}

export async function createTestUser(admin: SupabaseClient<Database>) {
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const password = "password123";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("failed to create test user");

  const client = createClient<Database>(url, anonKey);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { userId: data.user.id, client };
}
