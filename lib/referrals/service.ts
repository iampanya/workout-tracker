import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Human-readable 8-char code alphabet, mirroring the SQL `gen_referral_code()` in
// 0004_referral_codes.sql (excludes 0/O, 1/I/L). Keep the two in sync.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const MAX_REGENERATE_ATTEMPTS = 5;

// Generate one candidate referral code. Uniqueness is enforced by the DB unique index; callers
// that insert/update retry on collision.
export function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export type ReferralInfo = { code: string; invitedCount: number };

// Reads the caller's own referral code (allowed by the `profiles_select_own` RLS policy) and the
// count of accounts they've invited (via the SECURITY DEFINER `referral_count()` RPC, since RLS
// otherwise hides other users' rows).
export async function getReferralInfo(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<ReferralInfo> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("referral_code")
    .eq("id", userId)
    .single();
  if (error) throw new Error(error.message);

  const { data: count, error: countError } = await supabase.rpc("referral_count");
  if (countError) throw new Error(countError.message);

  return { code: profile.referral_code, invitedCount: count ?? 0 };
}

// Assigns the caller a fresh referral code, invalidating the old one. Retries on the rare
// unique-index collision. Uses the RLS-scoped client — `profiles_update_own` limits the update to
// the caller's own row.
export async function regenerateReferralCode(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<string> {
  for (let attempt = 0; attempt < MAX_REGENERATE_ATTEMPTS; attempt++) {
    const code = generateReferralCode();
    const { data, error } = await supabase
      .from("profiles")
      .update({ referral_code: code })
      .eq("id", userId)
      .select("referral_code");
    if (!error && data && data.length > 0) return code;
    // Retry only on a unique-constraint collision; surface anything else.
    if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
    if (!error && (!data || data.length === 0)) throw new Error("Profile not found");
  }
  throw new Error("Could not generate a unique referral code, please try again");
}
