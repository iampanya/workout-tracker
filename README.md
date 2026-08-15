# Weight Training Tracker

A weight-training log: routines, per-set weight/reps tracking, progressive-overload charts, and all-time PRs. Built with Next.js 16.3, Supabase (Postgres + Auth), Tailwind CSS, and Recharts.

**Multi-user, invite-gated.** Login is by **username**; each user has an isolated profile (enforced by
row-level security). There is no open public signup: new accounts self-register on `/signup` but require
a valid **referral code**. Every user owns one permanent, personal referral code (shown as a shareable
invite link on their **Profile** page) that anyone can use to sign up; a user can **regenerate** it to
invalidate a leaked link. The very first account is bootstrapped directly in the database (below).

## Local Development

1. Install the Supabase CLI: `brew install supabase/tap/supabase`
2. Start the local stack (requires Docker running): `supabase start`
3. Copy `.env.local.example` to `.env.local` and fill in the URL/keys printed by `supabase start`
4. Install dependencies: `npm install`
5. Run the app: `npm run dev`
6. Run unit tests (no DB required): `npm test`
7. Run the full suite including DB-backed integration tests (requires `supabase start` to be running, and `DOTENV_CONFIG_PATH=.env.local` set): `DOTENV_CONFIG_PATH=.env.local npm run test:db`
8. Run the end-to-end browser tests (Playwright, drives the real UI against a production build): `npm run test:e2e`. Requires `supabase start` running and `.env.local` populated; the first run needs the browser binary once: `npx playwright install chromium`. A fresh test user (username `e2e_tester`) is reset and seeded automatically before each run by `e2e/global-setup.ts`. To iterate faster against `next dev` instead of a prod build, prefix with `E2E_DEV=1`.
9. Create the first local account. Signup needs an existing user's referral code, so the first account is bootstrapped directly (there's no one to invite you yet). `.env.local` must include `SUPABASE_SERVICE_ROLE_KEY` (printed by `supabase start`). In Supabase Studio (`supabase status` prints its URL, typically `http://127.0.0.1:54323`): **Authentication → Users → Add user** to create the auth user, then in the **SQL Editor** insert a matching `public.profiles` row — username login and referral codes both require it:
   ```sql
   insert into public.profiles (id, username, referral_code)
   values ('<the-new-user-id>', 'yourname', 'DEV12345');
   ```
   Log in at `/login` with `yourname` and the password you set. To add more accounts, open your **Profile** page, copy your invite link, and register through it at `/signup` (the code is prefilled) — or share it with anyone else.

## Deployment

Accounts are invite-gated: users self-register at `/signup` with a referral code from an existing user's
invite link. Supabase's own public signup stays **disabled** — the app mints users server-side via the
service-role admin API, which is what enforces the invite gate. The first account is bootstrapped
directly in the database (step 3), after which everyone invites others via their Profile page's link.

### 1. Create the hosted Supabase project

Create a new project at [supabase.com](https://supabase.com). Note its project ref, database password, API URL, anon key, and **service role key**.

In the hosted project's dashboard: **Authentication → Settings → disable "Allow new users to sign up"** (kept off on purpose — the app's own invite-gated flow creates accounts).

### 2. Push the schema

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Then, in the hosted project's **SQL Editor**, run the contents of `supabase/seed.sql` once to seed the preset exercises (the CLI does not auto-run `seed.sql` against a linked remote project).

### 3. Bootstrap the first account

There's no one to invite you into a brand-new project, so create the first account directly. In the
hosted project's dashboard: **Authentication → Users → Add user** (set an email + password), then in the
**SQL Editor** insert a matching profile with a referral code:

```sql
insert into public.profiles (id, username, referral_code)
values ('<the-new-user-id>', 'yourname', '<an-8-char-code>');
```

After that, everyone invites others by sharing the personal invite link on their **Profile** page — no
more manual SQL. A user can regenerate their code from that page to invalidate a leaked link.

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

You bootstrapped it in step 3 — log in at `<deployed-url>/login` with that username and password. To
invite others, share the invite link from your **Profile** page.

### 6. Verify

Log in with your username from both a phone and a desktop browser: start a workout, log a few sets, confirm a "New PR" banner appears when you exceed a prior best, finish the workout, and confirm the dashboard shows it.

## Notes

- `/` is a public landing page for logged-out visitors (hero + feature overview + Log in / Sign up). Logged-in users are redirected straight to `/dashboard`. Everything else stays auth-gated.
- All weights are stored and displayed in kilograms.
- The hosted Supabase free-tier project auto-pauses after ~7 days with no API activity. If the app stops responding, resume it from the Supabase dashboard.
- Full implementation history and design rationale: `docs/superpowers/specs/2026-08-09-workout-tracker-design.md` and `docs/superpowers/plans/2026-08-09-workout-tracker-implementation.md`.
