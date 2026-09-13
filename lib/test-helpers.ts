import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

// Creates a user directly in public.users (no GoTrue anymore). The on_public_user_created trigger
// provisions the matching profiles row, mirroring what Auth.js does on a real Google sign-in.
export async function createTestUser(): Promise<{ userId: string }> {
  const email = `test-${Date.now()}-${randomUUID().slice(0, 8)}@test.local`;
  const user = await prisma.user.create({ data: { email } });
  return { userId: user.id };
}
