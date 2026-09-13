import { Prisma, type PrismaClient } from "@prisma/client";

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

// Reads the caller's own referral code plus the count of accounts they've invited. The count
// was the SECURITY DEFINER `referral_count()` RPC (needed because RLS hid invitees' rows); with
// RLS gone it's a plain COUNT on referred_by = userId.
export async function getReferralInfo(db: PrismaClient, userId: string): Promise<ReferralInfo> {
  const profile = await db.profiles.findUnique({
    where: { id: userId },
    select: { referral_code: true },
  });
  if (!profile) throw new Error("Profile not found");

  const invitedCount = await db.profiles.count({ where: { referred_by: userId } });

  return { code: profile.referral_code, invitedCount };
}

// Assigns the caller a fresh referral code, invalidating the old one. Retries on the rare
// unique-index collision (P2002).
export async function regenerateReferralCode(db: PrismaClient, userId: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_REGENERATE_ATTEMPTS; attempt++) {
    const code = generateReferralCode();
    try {
      const result = await db.profiles.updateMany({
        where: { id: userId },
        data: { referral_code: code },
      });
      if (result.count === 0) throw new Error("Profile not found");
      return code;
    } catch (err) {
      // Retry only on a unique-constraint collision; surface anything else.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new Error("Could not generate a unique referral code, please try again");
}
