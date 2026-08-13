// Fixed credentials for the single E2E test user. `global-setup.ts` reset-then-creates
// this user (auth row + `profiles` row) before the suite runs, so specs can log in by
// username deterministically. Login is by username (not email) — see app/login/page.tsx.
export const TEST_USER = {
  username: "e2e_tester",
  email: "e2e-tester@test.local",
  password: "e2e-password-123",
} as const;
