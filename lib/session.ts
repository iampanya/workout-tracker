import { cache } from "react";
import { auth } from "@/auth";

export type AuthUser = { id: string; email: string | null };

// Current user from the Auth.js session (JWT verified locally). cache()-wrapped so layout + page
// share one verification per render. Replaces the old Supabase getAuthUser.
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return { id: session.user.id, email: session.user.email ?? null };
});

// For mutations/actions: resolve the user id or throw.
export async function requireUserId(): Promise<string> {
  const user = await getAuthUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}
