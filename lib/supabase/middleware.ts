import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

// "/" is the public landing page (viewable while logged in — it just adapts its
// CTAs; it does NOT redirect). "/login" and "/signup" are guest-only: an already
// logged-in visitor is bounced off them to /dashboard. Everything else is protected.
const PUBLIC_ROUTES = new Set(["/", "/login", "/signup"]);
const GUEST_ONLY_ROUTES = new Set(["/login", "/signup"]);

export function isProtectedRoute(pathname: string): boolean {
  return !PUBLIC_ROUTES.has(pathname);
}

export function isGuestOnlyRoute(pathname: string): boolean {
  return GUEST_ONLY_ROUTES.has(pathname);
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

  // Logged-in visitor on a guest-only page (/login, /signup) → send to /dashboard.
  // This runs before render, so bookmarking /login and returning while still signed
  // in lands on the dashboard with no flash of the login form.
  if (data && isGuestOnlyRoute(request.nextUrl.pathname)) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    const redirectResponse = NextResponse.redirect(dashboardUrl);
    // Carry over any cookies getClaims just rotated (an expired-but-refreshable
    // token gets refreshed above). Dropping them would leave the client holding a
    // spent, single-use refresh token and could bounce the user back out.
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  if (!data && isProtectedRoute(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
