# Weight Training Tracker

A weight-training log: routines, per-set weight/reps tracking, progressive-overload charts, and all-time PRs. Built with Next.js 16.3, **Postgres via [Prisma](https://www.prisma.io/)**, **[Auth.js](https://authjs.dev/) (NextAuth v5) with Google sign-in**, Tailwind CSS, and Recharts.

**Google sign-in.** Anyone can sign in with a Google account; a profile (username derived from the
email, plus a personal referral code) is provisioned automatically on first login. Each user's data is
isolated **at the application layer** — every query is scoped by `user_id` in the service layer
(`lib/*/service.ts`), not by Postgres row-level security.

**Portable data layer.** The app talks to Postgres directly through Prisma over `DATABASE_URL`. Nothing
is tied to a specific host — point `DATABASE_URL` at any Postgres (local Docker, Supabase, Neon, RDS,
self-hosted) and the app runs unchanged. Local development uses a plain Postgres in Docker and
**Prisma Migrate** to build the schema; see [`docs/adr/0001-local-db-on-docker-postgres.md`](docs/adr/0001-local-db-on-docker-postgres.md).

## Local Development

1. **Run Postgres in Docker** (any recent Postgres image, e.g. `postgres:18`). Then create a dedicated
   database and login role for this app (run as a superuser, e.g. via `docker exec … psql`):
   ```sql
   CREATE ROLE workout_tracker LOGIN CREATEDB PASSWORD '<pick-a-password>';
   CREATE DATABASE workout_tracker_dev OWNER workout_tracker;
   ```
   (`CREATEDB` lets `prisma migrate dev` create its shadow database later.)
2. **Create a Google OAuth client** — [Google Cloud Console](https://console.cloud.google.com) →
   *APIs & Services → Credentials → Create credentials → OAuth client ID → Web application*. Add the
   authorized redirect URI:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
   Note the **Client ID** and **Client secret**.
3. **Create `.env.local`** (copy from `.env.local.example`) and fill in:
   ```bash
   # Local Docker Postgres (port 5432). No pooler locally, so both are equal.
   DATABASE_URL="postgresql://workout_tracker:<pw>@127.0.0.1:5432/workout_tracker_dev"
   DIRECT_URL="postgresql://workout_tracker:<pw>@127.0.0.1:5432/workout_tracker_dev"
   # Auth.js — generate a secret with: openssl rand -base64 32
   AUTH_SECRET="..."
   GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
   GOOGLE_SECRET="GOCSPX-..."
   ```
   Also create a `.env` with the same `DATABASE_URL`/`DIRECT_URL` — the Prisma CLI reads `.env`, not
   `.env.local`. (Both are gitignored.)
4. **Install dependencies:** `npm install` (its `postinstall` runs `prisma generate`)
5. **Apply the schema + seed to local Postgres:** `npm run db:reset` (runs `prisma migrate reset`, then
   seeds the preset exercises via `prisma/seed.mjs`). For a non-destructive apply use `npm run db:migrate`.
6. **Run the app:** `npm run dev`, then open `http://localhost:3000` and **sign in with Google**. Your
   profile is created automatically — there's no separate signup step or bootstrap.
7. **Unit tests** (pure functions, no DB): `npm test`
8. **DB-backed integration tests** (needs Docker Postgres running + `npm run db:migrate` applied):
   `DOTENV_CONFIG_PATH=.env.local npm run test:db`
9. **Typecheck + lint:** `npx tsc --noEmit && npm run lint`

> **Note:** `DATABASE_URL` in `.env` / `.env.local` is what the Prisma CLI and the app connect to. Local
> development no longer needs the Supabase CLI; the app itself never uses Supabase Auth or the PostgREST API.
> Schema is managed by **Prisma Migrate** on both local and production (prod baselined 2026-09-15);
> `supabase/migrations/` is archived legacy. See `docs/DEPLOY.md`.

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
- The `exercise_prs` view and the `import_backup` / `gen_referral_code` / `handle_new_user` functions are
  defined as raw SQL in the squashed `prisma/migrations/0001_init` (Prisma is the client only; the view is
  read via `$queryRaw`). This migration is the schema baseline for both local and production.
- Full implementation history and design rationale: `docs/superpowers/specs/…` and `docs/superpowers/plans/…`.
