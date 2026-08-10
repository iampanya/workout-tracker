import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Service-role client that bypasses RLS. It must NEVER be imported into client code:
// import it ONLY from `"use server"` modules (currently just lib/actions/auth.ts). Reading
// SUPABASE_SERVICE_ROLE_KEY (a server-only env var, never NEXT_PUBLIC_*) in a Client
// Component would both leak the key and fail at runtime. Used solely by the auth server
// actions (username→email lookup, invite-gated user creation).
export function createAdminSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
