import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import type { Database } from "@/lib/supabase/database.types";
import { generateReferralCode, getReferralInfo, regenerateReferralCode } from "./service";

function uniqueSuffix() {
  return `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
}

describe("referrals service (DB)", () => {
  const admin: SupabaseClient<Database> = createAdminClient();
  const createdUserIds: string[] = [];

  // Creates an auth user + a profile row with a referral code, returning an RLS-scoped client for
  // that user (createTestUser signs in as them). Mirrors how signup provisions a profile.
  async function seedUserWithProfile() {
    const { userId, client } = await createTestUser(admin);
    createdUserIds.push(userId);
    const code = generateReferralCode();
    const { error } = await admin
      .from("profiles")
      .insert({ id: userId, username: `ref_${uniqueSuffix()}`, referral_code: code });
    if (error) throw new Error(error.message);
    return { userId, client, code };
  }

  it("getReferralInfo returns the user's own code and invited count", async () => {
    const inviter = await seedUserWithProfile();

    // No invitees yet.
    const before = await getReferralInfo(inviter.client, inviter.userId);
    expect(before.code).toBe(inviter.code);
    expect(before.invitedCount).toBe(0);

    // Add two invitees referred by this user.
    for (let i = 0; i < 2; i++) {
      const { userId } = await createTestUser(admin);
      createdUserIds.push(userId);
      const { error } = await admin.from("profiles").insert({
        id: userId,
        username: `invitee_${uniqueSuffix()}`,
        referral_code: generateReferralCode(),
        referred_by: inviter.userId,
      });
      if (error) throw new Error(error.message);
    }

    const after = await getReferralInfo(inviter.client, inviter.userId);
    expect(after.invitedCount).toBe(2);
  });

  it("regenerateReferralCode issues a new code and invalidates the old one", async () => {
    const user = await seedUserWithProfile();
    const oldCode = user.code;

    const newCode = await regenerateReferralCode(user.client, user.userId);
    expect(newCode).toHaveLength(8);
    expect(newCode).not.toBe(oldCode);

    // The profile now holds the new code; the old code no longer resolves to anyone.
    const info = await getReferralInfo(user.client, user.userId);
    expect(info.code).toBe(newCode);

    const { data: byOldCode } = await admin
      .from("profiles")
      .select("id")
      .eq("referral_code", oldCode)
      .maybeSingle();
    expect(byOldCode).toBeNull();
  });

  it("cleans up created users", async () => {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id).catch(() => {});
    }
    expect(true).toBe(true);
  });
});
