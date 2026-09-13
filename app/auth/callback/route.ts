import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// OAuth (Google) redirect target. Supabase sends the user here with a `code` after Google
// sign-in; we exchange it for a session (sets auth cookies) and land them in the app. This
// route must be in PUBLIC_ROUTES (see lib/supabase/middleware.ts) — the user isn't
// authenticated yet when it runs.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // No code, or the exchange failed — send them back to the login page with a flag.
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
