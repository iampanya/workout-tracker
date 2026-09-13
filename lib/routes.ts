// Route gating used by proxy.ts (edge-safe: no imports).
// "/" is the public landing (renders logged-in or out). "/login" is guest-only. Auth.js routes
// under /api/auth/* are excluded by the proxy matcher. Everything else requires a session.
const PUBLIC_ROUTES = new Set(["/", "/login"]);
const GUEST_ONLY_ROUTES = new Set(["/login"]);

export function isProtectedRoute(pathname: string): boolean {
  return !PUBLIC_ROUTES.has(pathname);
}

export function isGuestOnlyRoute(pathname: string): boolean {
  return GUEST_ONLY_ROUTES.has(pathname);
}
