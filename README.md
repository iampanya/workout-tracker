# Weight Training Tracker

A weight-training log: routines, per-set weight/reps tracking, progressive-overload charts, and all-time PRs. Built with Next.js 16.3, **Postgres via [Prisma](https://www.prisma.io/)**, **[Auth.js](https://authjs.dev/) (NextAuth v5) with Google sign-in**, Tailwind CSS, and Recharts.

**Google sign-in.** Anyone can sign in with a Google account; a profile (username derived from the
email, plus a personal referral code) is provisioned automatically on first login. Each user's data is
isolated **at the application layer** — every query is scoped by `user_id` in the service layer
(`lib/*/service.ts`), not by Postgres row-level security.

**Portable data layer.** The app talks to Postgres directly through Prisma over `DATABASE_URL`. Nothing
is tied to a specific host — point `DATABASE_URL` at any Postgres (local, Supabase, Neon, RDS, self-hosted)
and the app runs unchanged. Locally we use the Supabase CLI purely as a convenient way to run Postgres in
Docker and apply the SQL migrations.

## Local Development

1. **Install the Supabase CLI** (used only to run a local Postgres in Docker and apply migrations):
   `brew install supabase/tap/supabase`
2. **Start local Postgres** (requires Docker running): `supabase start`
3. **Create a Google OAuth client** — [Google Cloud Console](https://console.cloud.google.com) →
   *APIs & Services → Credentials → Create credentials → OAuth client ID → Web application*. Add the
   authorized redirect URI:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
   Note the **Client ID** and **Client secret**.
4. **Create `.env.local`** (copy from `.env.local.example`) and fill in:
   ```bash
   # Local Postgres from `supabase start` (port 54322). No pooler locally, so both are equal.
   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
   DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
   # Auth.js — generate a secret with: openssl rand -base64 32
   AUTH_SECRET="..."
   GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
   GOOGLE_SECRET="GOCSPX-..."
   ```
   Also create a `.env` with the same `DATABASE_URL`/`DIRECT_URL` — the Prisma CLI reads `.env`, not
   `.env.local`. (Both are gitignored.)
5. **Install dependencies:** `npm install` (its `postinstall` runs `prisma generate`)
6. **Apply migrations + seed to local Postgres:** `supabase db reset` (runs every migration in
   `supabase/migrations/` in order, then `supabase/seed.sql` for the preset exercises)
7. **Run the app:** `npm run dev`, then open `http://localhost:3000` and **sign in with Google**. Your
   profile is created automatically — there's no separate signup step or bootstrap.
8. **Unit tests** (pure functions, no DB): `npm test`
9. **DB-backed integration tests** (needs `supabase start` running): `DOTENV_CONFIG_PATH=.env.local npm run test:db`
10. **Typecheck + lint:** `npx tsc --noEmit && npm run lint`

> **Note:** `DATABASE_URL` in `.env` / `.env.local` is what the Prisma CLI and the app connect to. The
> Supabase CLI runs the local Postgres; the app itself never uses Supabase Auth or the PostgREST API.

## Deployment

See **[`docs/DEPLOY.md`](docs/DEPLOY.md)** for the full production runbook (any Postgres host + Vercel).

## Notes

- `/` is a public landing page for logged-out visitors (hero + feature overview + Log in). Logged-in
  users are redirected to `/dashboard`. Everything else is auth-gated by `proxy.ts` (Auth.js middleware).
- Auth callback lives at `/api/auth/callback/google` (Auth.js). The Google Cloud OAuth client must list
  this exact URI (per environment).
- Data isolation is enforced in the service layer (`user_id` scoping), **not** RLS — a query that forgets
  to scope by `user_id` would leak data, so every service function takes a `userId` and filters by it, and
  there are cross-user isolation tests (e.g. `lib/exercises/service.test.ts`).
- All weights are stored and displayed in kilograms.
- The `exercise_prs` view and the `import_backup` / `gen_referral_code` / `handle_new_user` functions live
  in the SQL migrations (Prisma is the client only; the view is read via `$queryRaw`).
- Full implementation history and design rationale: `docs/superpowers/specs/…` and `docs/superpowers/plans/…`.
