import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type Profile = {
  username: string;
  createdAt: string;
};

// Reads the caller's own profile. Allowed by the `profiles_select_own` RLS policy
// (`id = auth.uid()`) using the ordinary server client — no admin client needed.
export async function getProfile(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("username, created_at")
    .eq("id", userId)
    .single();
  if (error) throw new Error(error.message);
  return { username: data.username, createdAt: data.created_at };
}
