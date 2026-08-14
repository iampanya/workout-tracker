import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

// "/" is the public landing page (it self-redirects logged-in users to
// /dashboard); auth surfaces are public too. Everything else is protected.
const PUBLIC_ROUTES = new Set(["/", "/login", "/signup"]);

export function isProtectedRoute(pathname: string): boolean {
  return !PUBLIC_ROUTES.has(pathname);
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims() verifies the session JWT locally (asymmetric ECC keys) instead of
  // getUser()'s network round trip. It still calls getSession() under the hood, which
  // refreshes an expired-but-refreshable token and writes rotated cookies through the
  // setAll adapter above — so middleware keeps its refresh-and-propagate duty.
  const { data } = await supabase.auth.getClaims();

  if (!data && isProtectedRoute(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
