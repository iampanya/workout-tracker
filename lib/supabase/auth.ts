import { cache } from "react";
import { createServerSupabaseClient } from "./server";

export type AuthUser = { id: string; email: string | null };

// Resolves the current user by verifying the session JWT *locally* via getClaims()
// (asymmetric ECC signing keys) instead of getUser()'s network round trip to the
// Supabase Auth server. Wrapped in cache() so layout + page in a single server
// render share one verification rather than each calling it.
//
// NOTE: local dev Supabase uses symmetric HS256 keys, so getClaims() falls back to
// getUser() there — correct behavior, just no latency win locally. The speedup only
// materializes against the production project (asymmetric keys).
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  return {
    id: data.claims.sub,
    email: (data.claims.email as string | undefined) ?? null,
  };
});
