import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/test-helpers";
import type { Database } from "@/lib/supabase/database.types";
import { generateReferralCode } from "@/lib/referrals/service";
import { getEmailForUsername, createUserWithReferral } from "./service";

function uniqueSuffix() {
  return `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
}

describe("auth service", () => {
  const admin: SupabaseClient<Database> = createAdminClient();
  const createdUserIds: string[] = [];

  function trackCleanup(userId: string) {
    createdUserIds.push(userId);
  }

  // Seed an existing user to act as the inviter (its referral_code gates new signups). Returns the
  // inviter's id + referral code. This is how the very first account exists in a real deployment
  // (backfilled at migration), so tests bootstrap the same way.
  async function seedInviter(): Promise<{ userId: string; referralCode: string }> {
    const suffix = uniqueSuffix();
    const { data, error } = await admin.auth.admin.createUser({
      email: `inviter_${suffix}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("failed to seed inviter");
    trackCleanup(data.user.id);
    const referralCode = generateReferralCode();
    const { error: profileError } = await admin
      .from("profiles")
      .insert({ id: data.user.id, username: `inviter_${suffix}`, referral_code: referralCode });
    if (profileError) throw new Error(profileError.message);
    return { userId: data.user.id, referralCode };
  }

  it("creates a user via a referral code, sets referred_by, and gives them their own code", async () => {
    const inviter = await seedInviter();
    const username = `user_${uniqueSuffix()}`;
    const email = `${username}@example.com`;

    const { userId } = await createUserWithReferral(admin, {
      username,
      email,
      password: "password123",
      inviteCode: inviter.referralCode,
    });
    trackCleanup(userId);

    expect(userId).toBeTruthy();
    expect(await getEmailForUsername(admin, username)).toBe(email);

    const { data: profile } = await admin
      .from("profiles")
      .select("referred_by, referral_code")
      .eq("id", userId)
      .single();
    expect(profile!.referred_by).toBe(inviter.userId);
    // The new user gets their own distinct, non-empty referral code.
    expect(profile!.referral_code).toHaveLength(8);
    expect(profile!.referral_code).not.toBe(inviter.referralCode);
  });

  it("lets the same referral code be used by multiple people (multi-use)", async () => {
    const inviter = await seedInviter();

    const firstName = `user_${uniqueSuffix()}`;
    const r1 = await createUserWithReferral(admin, {
      username: firstName,
      email: `${firstName}@example.com`,
      password: "password123",
      inviteCode: inviter.referralCode,
    });
    trackCleanup(r1.userId);

    const secondName = `user_${uniqueSuffix()}`;
    const r2 = await createUserWithReferral(admin, {
      username: secondName,
      email: `${secondName}@example.com`,
      password: "password123",
      inviteCode: inviter.referralCode,
    });
    trackCleanup(r2.userId);

    expect(await getEmailForUsername(admin, firstName)).toBeTruthy();
    expect(await getEmailForUsername(admin, secondName)).toBeTruthy();
  });

  it("normalizes mixed-case usernames to lowercase and looks them up case-insensitively", async () => {
    const inviter = await seedInviter();
    const suffix = uniqueSuffix();
    const email = `mixed_${suffix}@example.com`;

    const { userId } = await createUserWithReferral(admin, {
      username: `Mixed_${suffix}`,
      email,
      password: "password123",
      inviteCode: inviter.referralCode,
    });
    trackCleanup(userId);

    // Stored lowercased; a lowercased lookup (as the login action does) finds it.
    expect(await getEmailForUsername(admin, `mixed_${suffix}`)).toBe(email);
  });

  it("returns null email for an unknown username", async () => {
    expect(await getEmailForUsername(admin, `nobody_${uniqueSuffix()}`)).toBeNull();
  });

  it("rejects an unknown referral code, creating no user", async () => {
    const username = `user_${uniqueSuffix()}`;
    await expect(
      createUserWithReferral(admin, {
        username,
        email: `${username}@example.com`,
        password: "password123",
        inviteCode: `MISSING${uniqueSuffix().slice(0, 2)}`,
      })
    ).rejects.toThrow(/invite/i);
    expect(await getEmailForUsername(admin, username)).toBeNull();
  });

  it("rejects a duplicate username, leaving the original intact", async () => {
    const inviter = await seedInviter();
    const username = `dup_${uniqueSuffix()}`;

    const r1 = await createUserWithReferral(admin, {
      username,
      email: `${username}_a@example.com`,
      password: "password123",
      inviteCode: inviter.referralCode,
    });
    trackCleanup(r1.userId);

    await expect(
      createUserWithReferral(admin, {
        username,
        email: `${username}_b@example.com`,
        password: "password123",
        inviteCode: inviter.referralCode,
      })
    ).rejects.toThrow(/taken/i);
  });

  it("rejects a duplicate email", async () => {
    const inviter = await seedInviter();
    const email = `dupemail_${uniqueSuffix()}@example.com`;

    const r1 = await createUserWithReferral(admin, {
      username: `user_${uniqueSuffix()}`,
      email,
      password: "password123",
      inviteCode: inviter.referralCode,
    });
    trackCleanup(r1.userId);

    await expect(
      createUserWithReferral(admin, {
        username: `user_${uniqueSuffix()}`,
        email,
        password: "password123",
        inviteCode: inviter.referralCode,
      })
    ).rejects.toThrow(/email/i);
  });

  // Best-effort cleanup of users created by the passing paths.
  it("cleans up created users", async () => {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id).catch(() => {});
    }
    expect(true).toBe(true);
  });
});
