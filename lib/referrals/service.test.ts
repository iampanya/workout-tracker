import "dotenv/config";
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { prisma } from "@/lib/db";
import type { Database } from "@/lib/supabase/database.types";
import { generateReferralCode, getReferralInfo, regenerateReferralCode } from "./service";

function uniqueSuffix() {
  return `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
}

describe("referrals service (DB)", () => {
  const admin: SupabaseClient<Database> = createAdminClient();
  const createdUserIds: string[] = [];

  // Creates an auth user (via GoTrue). The on_auth_user_created trigger already provisioned a
  // profiles row, so we update it to the username + referral_code this test wants. The update is
  // done with the admin client purely as test setup; the code under test runs through prisma.
  async function seedUserWithProfile() {
    const { userId } = await createTestUser(admin);
    createdUserIds.push(userId);
    const code = generateReferralCode();
    const { error } = await admin
      .from("profiles")
      .update({ username: `ref_${uniqueSuffix()}`, referral_code: code })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { userId, code };
  }

  it("getReferralInfo returns the user's own code and invited count", async () => {
    const inviter = await seedUserWithProfile();

    // No invitees yet.
    const before = await getReferralInfo(prisma, inviter.userId);
    expect(before.code).toBe(inviter.code);
    expect(before.invitedCount).toBe(0);

    // Add two invitees referred by this user.
    for (let i = 0; i < 2; i++) {
      const { userId } = await createTestUser(admin);
      createdUserIds.push(userId);
      const { error } = await admin
        .from("profiles")
        .update({
          username: `invitee_${uniqueSuffix()}`,
          referral_code: generateReferralCode(),
          referred_by: inviter.userId,
        })
        .eq("id", userId);
      if (error) throw new Error(error.message);
    }

    const after = await getReferralInfo(prisma, inviter.userId);
    expect(after.invitedCount).toBe(2);
  });

  it("regenerateReferralCode issues a new code and invalidates the old one", async () => {
    const user = await seedUserWithProfile();
    const oldCode = user.code;

    const newCode = await regenerateReferralCode(prisma, user.userId);
    expect(newCode).toHaveLength(8);
    expect(newCode).not.toBe(oldCode);

    // The profile now holds the new code; the old code no longer resolves to anyone.
    const info = await getReferralInfo(prisma, user.userId);
    expect(info.code).toBe(newCode);

    const stillOld = await prisma.profiles.findFirst({ where: { referral_code: oldCode } });
    expect(stillOld).toBeNull();
  });

  it("cleans up created users", async () => {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id).catch(() => {});
    }
    expect(true).toBe(true);
  });
});
