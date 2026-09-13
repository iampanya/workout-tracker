import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";

// Full server-side Auth.js instance: edge-safe config + the Prisma adapter (persists the User and
// linked Account rows) + JWT sessions (verified locally, no per-request DB session lookup —
// mirrors the perf goal of the old getClaims path).
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
});
