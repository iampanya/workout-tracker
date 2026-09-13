import type { PrismaClient } from "@prisma/client";

export type Profile = {
  username: string;
  createdAt: string;
};

// Reads the caller's own profile. Scoped by id (the caller's userId) now that RLS no longer
// applies on the direct connection.
export async function getProfile(db: PrismaClient, userId: string): Promise<Profile> {
  const row = await db.profiles.findUnique({
    where: { id: userId },
    select: { username: true, created_at: true },
  });
  if (!row) throw new Error("Profile not found");
  return { username: row.username, createdAt: row.created_at.toISOString() };
}
