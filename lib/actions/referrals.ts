"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { regenerateReferralCode } from "@/lib/referrals/service";

export type RegenerateResult = { code: string | null; error: string | null };

// Assigns the current user a fresh referral code (invalidating the old one). Uses getUser() to
// stay revocation-tight on the mutation path, matching the other lib/actions/* wrappers.
export async function regenerateReferralCodeAction(): Promise<RegenerateResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { code: null, error: "Not authenticated" };

  try {
    const code = await regenerateReferralCode(supabase, user.id);
    revalidatePath("/profile");
    return { code, error: null };
  } catch (err) {
    return { code: null, error: err instanceof Error ? err.message : "Could not regenerate code" };
  }
}
