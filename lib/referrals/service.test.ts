import "dotenv/config";
import { describe, it, expect } from "vitest";
import { createTestUser } from "@/lib/test-helpers";
import { prisma } from "@/lib/db";
import { generateReferralCode, getReferralInfo, regenerateReferralCode } from "./service";

function uniqueSuffix() {
  return `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
}

describe("referrals service (DB)", () => {
  const createdUserIds: string[] = [];

  // Creates a user (the on_public_user_created trigger provisions the profile), then updates it to
  // the username + referral_code this test wants. The code under test runs through prisma.
  async function seedUserWithProfile() {
    const { userId } = await createTestUser();
    createdUserIds.push(userId);
    const code = generateReferralCode();
    await prisma.profiles.update({
      where: { id: userId },
      data: { username: `ref_${uniqueSuffix()}`, referral_code: code },
    });
    return { userId, code };
  }

  it("getReferralInfo returns the user's own code and invited count", async () => {
    const inviter = await seedUserWithProfile();

    const before = await getReferralInfo(prisma, inviter.userId);
    expect(before.code).toBe(inviter.code);
    expect(before.invitedCount).toBe(0);

    for (let i = 0; i < 2; i++) {
      const { userId } = await createTestUser();
      createdUserIds.push(userId);
      await prisma.profiles.update({
        where: { id: userId },
        data: {
          username: `invitee_${uniqueSuffix()}`,
          referral_code: generateReferralCode(),
          referred_by: inviter.userId,
        },
      });
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

    const info = await getReferralInfo(prisma, user.userId);
    expect(info.code).toBe(newCode);

    const stillOld = await prisma.profiles.findFirst({ where: { referral_code: oldCode } });
    expect(stillOld).toBeNull();
  });

  it("cleans up created users", async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    expect(true).toBe(true);
  });
});
