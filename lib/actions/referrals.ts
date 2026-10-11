"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/session";
import { regenerateReferralCode } from "@/lib/referrals/service";

export type RegenerateErrorCode = "notAuthenticated" | "regenerateFailed";
export type RegenerateResult = { code: string | null; error: RegenerateErrorCode | null };

// Assigns the current user a fresh referral code (invalidating the old one).
export async function regenerateReferralCodeAction(): Promise<RegenerateResult> {
  const user = await getAuthUser();
  if (!user) return { code: null, error: "notAuthenticated" };

  try {
    const code = await regenerateReferralCode(prisma, user.id);
    revalidatePath("/profile");
    return { code, error: null };
  } catch (err) {
    console.error(err);
    return { code: null, error: "regenerateFailed" };
  }
}
