import type { DefaultSession } from "next-auth";

// Add the user id (from token.sub) to the session type.
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
