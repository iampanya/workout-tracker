import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { signupSchema } from "@/lib/validation";
import { generateReferralCode } from "@/lib/referrals/service";

const MAX_CODE_ATTEMPTS = 5;

export type SignupResult = { userId: string; email: string };

// Resolve a username to its email using the service-role client (bypasses RLS). Returns
// null for an unknown username. Kept server-side so emails never reach the browser — the
// only sanctioned username→email path (prevents enumeration). `username` must already be
// normalized (lowercased) by the caller via usernameSchema.
export async function getEmailForUsername(
  admin: SupabaseClient<Database>,
  username: string
): Promise<string | null> {
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile) return null;

  const { data, error: userError } = await admin.auth.admin.getUserById(profile.id);
  if (userError) throw new Error(userError.message);
  return data.user?.email ?? null;
}

// Create a new account behind a user's referral code. The `inviteCode` is the referral code of
// the inviter; it's multi-use and never expires. Ordered so that any failure leaves no partial
// state: pre-checks first, then create user → insert profile (with the new user's own referral
// code + `referred_by`), cleaning up the created user if the profile insert loses a race.
export async function createUserWithReferral(
  admin: SupabaseClient<Database>,
  input: unknown
): Promise<SignupResult> {
  const { username, email, password, inviteCode } = signupSchema.parse(input);

  // 1. The referral code must belong to an existing user (its owner becomes `referred_by`).
  const { data: inviter, error: inviterError } = await admin
    .from("profiles")
    .select("id")
    .eq("referral_code", inviteCode)
    .maybeSingle();
  if (inviterError) throw new Error(inviterError.message);
  if (!inviter) throw new Error("Invalid invite code");

  // 2. Username must be free (the unique constraint is the final backstop).
  const { data: existing, error: existingError } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) throw new Error("That username is taken");

  // 3. Create the auth user (GoTrue enforces email uniqueness).
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    const isDuplicateEmail = /already|registered|exists/i.test(createError?.message ?? "");
    throw new Error(isDuplicateEmail ? "That email is already registered" : "Could not create account");
  }
  const userId = created.user.id;

  // 4. Insert the profile with the new user's own referral code + who referred them. Retry the
  // insert on a referral_code collision; on any other failure delete the orphaned auth user.
  let lastError: string | null = null;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      username,
      referral_code: generateReferralCode(),
      referred_by: inviter.id,
    });
    if (!profileError) return { userId, email };

    // A username collision is terminal; a referral_code collision is retryable.
    if (/referral_code/i.test(profileError.message)) {
      lastError = profileError.message;
      continue;
    }
    await admin.auth.admin.deleteUser(userId);
    const isDuplicate = /duplicate|unique/i.test(profileError.message);
    throw new Error(isDuplicate ? "That username is taken" : profileError.message);
  }

  await admin.auth.admin.deleteUser(userId);
  throw new Error(lastError ?? "Could not create account");
}
