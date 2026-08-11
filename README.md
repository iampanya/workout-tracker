# Weight Training Tracker

A weight-training log: routines, per-set weight/reps tracking, progressive-overload charts, and all-time PRs. Built with Next.js 16.3, Supabase (Postgres + Auth), Tailwind CSS, and Recharts.

**Multi-user, invite-gated.** Login is by **username**; each user has an isolated profile (enforced by
row-level security). New accounts self-register on `/signup` but require a valid single-use **invite
code** — there is no open public signup.

## Local Development

1. Install the Supabase CLI: `brew install supabase/tap/supabase`
2. Start the local stack (requires Docker running): `supabase start`
3. Copy `.env.local.example` to `.env.local` and fill in the URL/keys printed by `supabase start`
4. Install dependencies: `npm install`
5. Run the app: `npm run dev`
6. Run unit tests (no DB required): `npm test`
7. Run the full suite including DB-backed integration tests (requires `supabase start` to be running, and `DOTENV_CONFIG_PATH=.env.local` set): `DOTENV_CONFIG_PATH=.env.local npm run test:db`
8. Create a local account. `.env.local` must include `SUPABASE_SERVICE_ROLE_KEY` (printed by `supabase start`) — the signup flow uses it server-side. Then either:
   - **Via the app (recommended):** issue an invite code, then register at `/signup`. Insert a code in Supabase Studio's SQL Editor (`supabase status` prints its URL, typically `http://127.0.0.1:54323`):
     ```sql
     insert into public.invite_codes (code) values ('dev-invite');
     ```
     Open `/signup`, fill in a username, email, password, and `dev-invite`.
   - **Via Studio directly:** Authentication → Users → Add user creates the auth user, but you must also insert a matching `public.profiles` row (`id` = the new user's id, a lowercase `username`) or username login won't find it.

## Deployment

Accounts are invite-gated: users self-register at `/signup` with a single-use invite code. Supabase's
own public signup stays **disabled** — the app mints users server-side via the service-role admin API,
which is what enforces the invite gate.

### 1. Create the hosted Supabase project

Create a new project at [supabase.com](https://supabase.com). Note its project ref, database password, API URL, anon key, and **service role key**.

In the hosted project's dashboard: **Authentication → Settings → disable "Allow new users to sign up"** (kept off on purpose — the app's own invite-gated flow creates accounts).

### 2. Push the schema

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Then, in the hosted project's **SQL Editor**, run the contents of `supabase/seed.sql` once to seed the preset exercises (the CLI does not auto-run `seed.sql` against a linked remote project).

### 3. Seed the first invite code

In the hosted project's **SQL Editor**, insert an invite code so you (and anyone you invite) can register:

```sql
insert into public.invite_codes (code) values ('<a-long-random-string>');
```

Each code is single-use. Issue more the same way as you invite people; add `expires_at` to time-limit one.

### 4. Deploy to Vercel

```bash
npx vercel link
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel --prod
```

Paste the **hosted** project's URL, anon key, and service role key when prompted — never the local Docker
ones. `SUPABASE_SERVICE_ROLE_KEY` is required at runtime by the auth server actions (username login and
invite-gated signup); it is server-only and must never be exposed as a `NEXT_PUBLIC_*` variable.

### 5. Create your account

Visit `<deployed-url>/signup` and register with a username, your email, a strong password, and the invite
code from step 3.

### 6. Verify

Log in with your username from both a phone and a desktop browser: start a workout, log a few sets, confirm a "New PR" banner appears when you exceed a prior best, finish the workout, and confirm the dashboard shows it.

## Notes

- `/` is a public landing page for logged-out visitors (hero + feature overview + Log in / Sign up). Logged-in users are redirected straight to `/dashboard`. Everything else stays auth-gated.
- All weights are stored and displayed in kilograms.
- The hosted Supabase free-tier project auto-pauses after ~7 days with no API activity. If the app stops responding, resume it from the Supabase dashboard.
- Full implementation history and design rationale: `docs/superpowers/specs/2026-08-09-workout-tracker-design.md` and `docs/superpowers/plans/2026-08-09-workout-tracker-implementation.md`.
