import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { signupSchema } from "@/lib/validation";

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

// Create a new account behind a single-use invite code. Ordered so that any failure
// leaves no partial state: pre-checks first, then create user → insert profile → claim
// the invite atomically, cleaning up the created user/profile if a later step loses a race.
export async function createUserWithInvite(
  admin: SupabaseClient<Database>,
  input: unknown
): Promise<SignupResult> {
  const { username, email, password, inviteCode } = signupSchema.parse(input);

  // 1. Invite must exist, be unused, and unexpired.
  const { data: invite, error: inviteError } = await admin
    .from("invite_codes")
    .select("code, used_by, expires_at")
    .eq("code", inviteCode)
    .maybeSingle();
  if (inviteError) throw new Error(inviteError.message);
  const inviteUnusable =
    !invite ||
    invite.used_by !== null ||
    (invite.expires_at !== null && new Date(invite.expires_at) < new Date());
  if (inviteUnusable) throw new Error("Invalid or already-used invite code");

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

  // 4. Insert the profile; on failure (e.g. a username race) delete the orphaned user.
  const { error: profileError } = await admin.from("profiles").insert({ id: userId, username });
  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    const isDuplicate = /duplicate|unique/i.test(profileError.message);
    throw new Error(isDuplicate ? "That username is taken" : profileError.message);
  }

  // 5. Atomically claim the invite (guarded by `used_by IS NULL`). If someone claimed it
  // first, roll back the profile and user so the account isn't created without a code.
  const { data: claimed, error: claimError } = await admin
    .from("invite_codes")
    .update({ used_by: userId, used_at: new Date().toISOString() })
    .eq("code", inviteCode)
    .is("used_by", null)
    .select("code");
  if (claimError || !claimed || claimed.length === 0) {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
    throw new Error("Invalid or already-used invite code");
  }

  return { userId, email };
}
