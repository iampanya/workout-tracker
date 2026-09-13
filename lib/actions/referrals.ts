"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/session";
import { regenerateReferralCode } from "@/lib/referrals/service";

export type RegenerateResult = { code: string | null; error: string | null };

// Assigns the current user a fresh referral code (invalidating the old one).
export async function regenerateReferralCodeAction(): Promise<RegenerateResult> {
  const user = await getAuthUser();
  if (!user) return { code: null, error: "Not authenticated" };

  try {
    const code = await regenerateReferralCode(prisma, user.id);
    revalidatePath("/profile");
    return { code, error: null };
  } catch (err) {
    return { code: null, error: err instanceof Error ? err.message : "Could not regenerate code" };
  }
}
