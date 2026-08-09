# Weight Training Tracker

A personal weight-training log: routines, per-set weight/reps tracking, progressive-overload charts, and all-time PRs. Built with Next.js 16.3, Supabase (Postgres + Auth), Tailwind CSS, and Recharts.

## Local Development

1. Install the Supabase CLI: `brew install supabase/tap/supabase`
2. Start the local stack (requires Docker running): `supabase start`
3. Copy `.env.local.example` to `.env.local` and fill in the URL/keys printed by `supabase start`
4. Install dependencies: `npm install`
5. Run the app: `npm run dev`
6. Run unit tests (no DB required): `npm test`
7. Run the full suite including DB-backed integration tests (requires `supabase start` to be running, and `DOTENV_CONFIG_PATH=.env.local` set): `DOTENV_CONFIG_PATH=.env.local npm run test:db`
8. Create the one local user account: open Supabase Studio (`supabase status` prints its URL, typically `http://127.0.0.1:54323`) → Authentication → Users → Add user

## Deployment

This is a single-user app — public signup is disabled on both the local and hosted Supabase projects, and there is exactly one account.

### 1. Create the hosted Supabase project

Create a new project at [supabase.com](https://supabase.com). Note its project ref, database password, API URL, and anon key.

In the hosted project's dashboard: **Authentication → Settings → disable "Allow new users to sign up"**.

### 2. Push the schema

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Then, in the hosted project's **SQL Editor**, run the contents of `supabase/seed.sql` once to seed the preset exercises (the CLI does not auto-run `seed.sql` against a linked remote project).

### 3. Create the one production user account

In the hosted dashboard: **Authentication → Users → Add user**. Use your real email and a strong password.

### 4. Deploy to Vercel

```bash
npx vercel link
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel --prod
```

Paste the **hosted** project's URL and anon key when prompted — never the local Docker ones, and never the service role key (no server code needs it at runtime).

### 5. Verify

Visit the deployed URL from both a phone and a desktop browser: start a workout, log a few sets, confirm a "New PR" banner appears when you exceed a prior best, finish the workout, and confirm the dashboard shows it.

## Notes

- All weights are stored and displayed in kilograms.
- The hosted Supabase free-tier project auto-pauses after ~7 days with no API activity. If the app stops responding, resume it from the Supabase dashboard.
- Full implementation history and design rationale: `docs/superpowers/specs/2026-08-09-workout-tracker-design.md` and `docs/superpowers/plans/2026-08-09-workout-tracker-implementation.md`.
