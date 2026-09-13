import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge-safe Auth.js config (no Prisma adapter) shared by middleware and the full server config.
// Google credentials reuse the same env the old GoTrue setup used.
// allowDangerousEmailAccountLinking lets a Google sign-in attach to a pre-existing account with
// the same (verified) email — essential so users migrated from GoTrue keep their data.
export const authConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  pages: { signIn: "/login" },
  callbacks: {
    // JWT strategy: token.sub is the user id. Surface it on the session for the app.
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
