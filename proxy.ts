import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { isProtectedRoute, isGuestOnlyRoute } from "@/lib/routes";

// Edge auth instance from the adapter-less config (JWT is verified locally, no DB needed here).
const { auth } = NextAuth(authConfig);

export const proxy = auth((req) => {
  const isAuthed = !!req.auth;
  const { pathname } = req.nextUrl;

  // Logged-in visitor on /login → send to the dashboard.
  if (isAuthed && isGuestOnlyRoute(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }
  // Logged-out visitor on a protected route → send to login.
  if (!isAuthed && isProtectedRoute(pathname)) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  return NextResponse.next();
});

// Exclude Auth.js API routes (/api/auth/*), static assets, and images so the OAuth flow and
// framework internals are reachable without a session.
export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
