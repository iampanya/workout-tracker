# Username login + multi-user signup — design

> Status: **Implemented 2026-08-11** (phases B1–B4). Migration `0003_profiles_and_invites.sql`,
> `lib/supabase/admin.ts`, `lib/auth/service.ts` (+ tests), `lib/actions/auth.ts`, the username login +
> `/signup` pages, and the middleware/docs updates all landed. B5 (password reset) is the only deferred
> follow-up. This document is the original design; see `CLAUDE.md` and `README.md` for current usage.

## Why

The app is single-user today: email/password login, public signup disabled, no signup page. The owner
wants to (1) log in with a **username** instead of an email, and (2) let other people **register and use
the app**, each with an isolated profile.

The data layer already supports multi-tenancy: every table's RLS policy is `user_id = auth.uid()`, and
presets (`exercises.user_id IS NULL`) are shared across all users. So this change is almost entirely
about **auth and onboarding**, not data modeling — no per-table RLS rework is required.

## Decisions (locked with the owner)

- **Username + real email.** Username is the login identifier; a unique real email is also collected and
  used only for password reset (never shown as the login handle).
- **Invite-code-gated signup.** The app is public on the internet, but only holders of a valid invite
  code can register. No open self-serve signup.

## Requirements

1. Users log in with **username + password**.
2. Every user has a **unique real email**, collected at signup, used only for password reset.
3. New users **self-register** on a public signup page, gated by a valid, unused **invite code**.
4. Each user's data is **isolated** — already true via RLS; verify, don't rebuild.
5. The **existing account** keeps working: give it a username via backfill.
6. **No email enumeration** — the username→email lookup used at login must not expose emails to the client.

## Design

### Schema (migration `0003_profiles_and_invites.sql`)

- **`profiles`** — `id uuid primary key references auth.users(id) on delete cascade`,
  `username citext unique not null` (or `text` with a `unique (lower(username))` index),
  `created_at timestamptz not null default now()`. RLS: a user may `select`/`update` only their own row
  (`id = auth.uid()`); usernames are otherwise private. Grant `authenticated`/`service_role` as the
  existing tables do.
- **`invite_codes`** — `code text primary key`, `created_at`, `expires_at timestamptz null`,
  `used_by uuid null references auth.users(id)`, `used_at timestamptz null`. `used_by IS NULL` (and not
  expired) means available. Single-use. No RLS-select for `authenticated` (validated server-side only).
- **`email_for_username(p_username text) returns text`** — `SECURITY DEFINER`, `STABLE`, granted to
  `anon`. Returns the email for an exact (case-insensitive) username match, else null. This is the only
  sanctioned username→email path and keeps emails off the client. (Alternative: skip this function and do
  the lookup with the service-role admin client inside the login server action — pick one, not both.)

Regenerate `lib/supabase/database.types.ts` after the migration.

### Server-only admin client (`lib/supabase/admin.ts`)

A Supabase client built with `SUPABASE_SERVICE_ROLE_KEY`, imported **only** from `"use server"` code.
This introduces the first runtime use of the service-role key — it must never reach the browser (not a
`NEXT_PUBLIC_*` var) and must be added to the server environment (Vercel) for production.

### Login (server action `loginWithUsername(username, password)`)

1. Resolve username→email (via `email_for_username` RPC **or** the admin client).
2. `supabase.auth.signInWithPassword({ email, password })` on the **server** Supabase client so the
   session cookie is set through the SSR cookie adapter.
3. Return a **generic** error on any failure (do not distinguish "no such user" from "wrong password").

`app/login/page.tsx` becomes a username + password form calling this action (replacing the current
client-side `signInWithPassword` on email).

### Signup (server action `signup(username, email, password, inviteCode)`)

Keep Supabase's public `enable_signup = false`; mint users ourselves via the admin API so signup is fully
invite-gated:

1. Validate the invite code exists, is unused, and unexpired.
2. Enforce username uniqueness and basic shape (see validation below); rely on the DB unique constraints
   as the final backstop.
3. `auth.admin.createUser({ email, password, email_confirm: true })`.
4. Insert the `profiles` row (`id` = new user id, `username`), and mark the invite `used_by`/`used_at`.
5. Sign the new user in (reuse the login path).

Do steps 3–4 (ideally 1–4) inside **one transactional RPC** so a crash can't leave a used code with no
user, or a user with no profile. Unique constraints on `username` and `invite_codes.used_by` make
concurrent double-use fail cleanly.

`app/signup/page.tsx` (new): username, email, password, invite-code fields; friendly inline errors; a
link to/from the login page.

### Password reset (later sub-phase)

Standard Supabase reset-by-email against the stored email — request screen + update-password screen.

### Validation (`lib/validation.ts`)

- `usernameSchema` — 3–30 chars, `[a-z0-9_]`, lowercased.
- `signupSchema` — `{ username, email (email), password (min 6, matching `minimum_password_length`),
  inviteCode }`.
- `loginSchema` — `{ username, password }`.

## Phases

- **B1 — schema & backfill.** Migration (profiles, invite_codes, `email_for_username`, RLS, grants).
  Backfill a `profiles` row + chosen username for the existing account. Regenerate DB types. Seed a first
  batch of invite codes.
- **B2 — server auth actions.** `lib/supabase/admin.ts`, `loginWithUsername`, invite-gated `signup`, plus
  service functions and **DB tests**: create via admin API, duplicate username/email, bad/expired/used
  invite code, successful login, generic-error on bad credentials.
- **B3 — UI.** Rewrite `app/login/page.tsx`; add `app/signup/page.tsx`; wire errors and the login↔signup
  links.
- **B4 — config & deploy.** Keep `enable_signup = false`. Document invite-code generation. Update
  `README.md` (add `SUPABASE_SERVICE_ROLE_KEY` to server env; drop the "single-user, no signup" framing)
  and revise the **"single-user app / no signup page"** gotcha in `CLAUDE.md` — otherwise docs contradict
  the code.
- **B5 — password reset (optional).** Reset-by-email screens.

## Risks / watch-outs

- **Service-role key** is the main new attack surface — server-only, never bundled to the client.
- **Invite/username races** — prefer a single transactional RPC; DB unique constraints are the backstop.
- **Existing data** assumes one user; after backfill, confirm the old account still sees only its own rows
  (it will — RLS is unchanged).
- **Doc drift** — `README.md` and `CLAUDE.md` both currently assert "single-user, signup disabled"; both
  must be updated in B4.

## Verification

Per phase: DB tests for the auth service functions (B2), then manual login/signup/invite flows in the
browser using the throwaway-user admin technique from `CLAUDE.md`. Confirm a second registered user cannot
see the first user's routines/sessions/PRs.
