"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getEmailForUsername, createUserWithReferral } from "@/lib/auth/service";
import { loginSchema, signupSchema } from "@/lib/validation";

export type AuthActionResult = { error: string | null };

const GENERIC_LOGIN_ERROR = "Incorrect username or password";

export async function loginWithUsername(input: {
  username: string;
  password: string;
}): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(input);
  // A malformed username can't match any account — fold into the generic error so login
  // never reveals whether a username exists.
  if (!parsed.success) return { error: GENERIC_LOGIN_ERROR };

  const admin = createAdminSupabaseClient();
  const email = await getEmailForUsername(admin, parsed.data.username);
  if (!email) return { error: GENERIC_LOGIN_ERROR };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });
  if (error) return { error: GENERIC_LOGIN_ERROR };
  return { error: null };
}

export async function signup(input: {
  username: string;
  email: string;
  password: string;
  inviteCode: string;
}): Promise<AuthActionResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form and try again" };
  }

  const admin = createAdminSupabaseClient();
  try {
    await createUserWithReferral(admin, parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create account" };
  }

  // Sign the new user in so they land straight in the app.
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { error: "Account created — please log in." };
  return { error: null };
}
