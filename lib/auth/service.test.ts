import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/test-helpers";
import type { Database } from "@/lib/supabase/database.types";
import { getEmailForUsername, createUserWithInvite } from "./service";

function uniqueSuffix() {
  return `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
}

describe("auth service", () => {
  const admin: SupabaseClient<Database> = createAdminClient();
  const createdUserIds: string[] = [];

  async function seedInvite(code: string, expiresAt?: string) {
    const { error } = await admin.from("invite_codes").insert({ code, expires_at: expiresAt ?? null });
    if (error) throw new Error(error.message);
  }

  function trackCleanup(userId: string) {
    createdUserIds.push(userId);
  }

  beforeAll(() => {
    // no-op; each test seeds its own invite/user
  });

  it("creates a user with a valid invite, resolves username→email, and claims the code", async () => {
    const code = `inv_${uniqueSuffix()}`;
    await seedInvite(code);
    const username = `user_${uniqueSuffix()}`;
    const email = `${username}@example.com`;

    const { userId } = await createUserWithInvite(admin, {
      username,
      email,
      password: "password123",
      inviteCode: code,
    });
    trackCleanup(userId);

    expect(userId).toBeTruthy();
    expect(await getEmailForUsername(admin, username)).toBe(email);

    const { data: invite } = await admin
      .from("invite_codes")
      .select("used_by, used_at")
      .eq("code", code)
      .single();
    expect(invite!.used_by).toBe(userId);
    expect(invite!.used_at).not.toBeNull();
  });

  it("normalizes mixed-case usernames to lowercase and looks them up case-insensitively", async () => {
    const code = `inv_${uniqueSuffix()}`;
    await seedInvite(code);
    const suffix = uniqueSuffix();
    const email = `mixed_${suffix}@example.com`;

    const { userId } = await createUserWithInvite(admin, {
      username: `Mixed_${suffix}`,
      email,
      password: "password123",
      inviteCode: code,
    });
    trackCleanup(userId);

    // Stored lowercased; a lowercased lookup (as the login action does) finds it.
    expect(await getEmailForUsername(admin, `mixed_${suffix}`)).toBe(email);
  });

  it("returns null email for an unknown username", async () => {
    expect(await getEmailForUsername(admin, `nobody_${uniqueSuffix()}`)).toBeNull();
  });

  it("rejects an unknown invite code, creating no user", async () => {
    const username = `user_${uniqueSuffix()}`;
    await expect(
      createUserWithInvite(admin, {
        username,
        email: `${username}@example.com`,
        password: "password123",
        inviteCode: `missing_${uniqueSuffix()}`,
      })
    ).rejects.toThrow(/invite/i);
    expect(await getEmailForUsername(admin, username)).toBeNull();
  });

  it("rejects an expired invite code", async () => {
    const code = `inv_${uniqueSuffix()}`;
    await seedInvite(code, "2000-01-01T00:00:00Z");
    const username = `user_${uniqueSuffix()}`;
    await expect(
      createUserWithInvite(admin, {
        username,
        email: `${username}@example.com`,
        password: "password123",
        inviteCode: code,
      })
    ).rejects.toThrow(/invite/i);
  });

  it("rejects reusing an already-claimed invite code", async () => {
    const code = `inv_${uniqueSuffix()}`;
    await seedInvite(code);
    const first = `user_${uniqueSuffix()}`;
    const r1 = await createUserWithInvite(admin, {
      username: first,
      email: `${first}@example.com`,
      password: "password123",
      inviteCode: code,
    });
    trackCleanup(r1.userId);

    const second = `user_${uniqueSuffix()}`;
    await expect(
      createUserWithInvite(admin, {
        username: second,
        email: `${second}@example.com`,
        password: "password123",
        inviteCode: code,
      })
    ).rejects.toThrow(/invite/i);
    // The rejected signup must not have created an account.
    expect(await getEmailForUsername(admin, second)).toBeNull();
  });

  it("rejects a duplicate username, leaving the original intact", async () => {
    const code1 = `inv_${uniqueSuffix()}`;
    const code2 = `inv_${uniqueSuffix()}`;
    await seedInvite(code1);
    await seedInvite(code2);
    const username = `dup_${uniqueSuffix()}`;

    const r1 = await createUserWithInvite(admin, {
      username,
      email: `${username}_a@example.com`,
      password: "password123",
      inviteCode: code1,
    });
    trackCleanup(r1.userId);

    await expect(
      createUserWithInvite(admin, {
        username,
        email: `${username}_b@example.com`,
        password: "password123",
        inviteCode: code2,
      })
    ).rejects.toThrow(/taken/i);
    // The second invite must remain unused since its signup failed.
    const { data: invite } = await admin
      .from("invite_codes")
      .select("used_by")
      .eq("code", code2)
      .single();
    expect(invite!.used_by).toBeNull();
  });

  it("rejects a duplicate email", async () => {
    const code1 = `inv_${uniqueSuffix()}`;
    const code2 = `inv_${uniqueSuffix()}`;
    await seedInvite(code1);
    await seedInvite(code2);
    const email = `dupemail_${uniqueSuffix()}@example.com`;

    const r1 = await createUserWithInvite(admin, {
      username: `user_${uniqueSuffix()}`,
      email,
      password: "password123",
      inviteCode: code1,
    });
    trackCleanup(r1.userId);

    await expect(
      createUserWithInvite(admin, {
        username: `user_${uniqueSuffix()}`,
        email,
        password: "password123",
        inviteCode: code2,
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
