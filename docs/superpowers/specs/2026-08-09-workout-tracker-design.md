# Personal Weight-Training Tracker — Design

## Context

The user wants a personal web app to log weight-training workouts (exercise, number of sets, weight per set + reps), track progressive overload over time, and record all-time personal records (PRs) per exercise. It must work from both their phone at the gym and their computer at home, so it needs a real backend with sync — not a local-only app. This is a brand-new project, starting from an empty directory.

Requirements were gathered interactively:
- Multi-device (phone + computer), hosted free on the cloud, single-user login (no public signup).
- Each set logs **weight (kg only) + reps**.
- PR = simple max weight ever lifted per exercise (no 1RM estimation).
- Exercises: preset popular list + user can add custom ones.
- Workout structure: reusable **routines/templates** (e.g. "Push Day") to quickly start a session, plus freeform sessions.
- Progress page per exercise: weight/volume-over-time chart, history table, PR badge on new records.
- Tech stack delegated to the assistant — chosen for free-tier friendliness and low ops for a solo dev.
- Local development runs against a local DB (Docker), separate from the hosted production DB, without diverging schemas.

## Tech Stack

**Next.js 16.3 (TypeScript, App Router) + Supabase (Postgres + Auth) + Vercel + Tailwind CSS + Recharts.**

- **Vercel**: free Hobby tier, git-push deploys, ideal for a responsive mobile+desktop personal app.
- **Supabase**: free Postgres + built-in email/password Auth + Row Level Security — a good fit for this relational schema (routines → sessions → sets) and avoids hand-rolling auth.
- **Recharts** for the progress charts; **Zod + React Hook Form** for validated forms (routines, custom exercises); **TanStack Query** on the active logging screen only, for optimistic set entry on flaky gym wifi.

**Local dev vs. production**: use the **Supabase CLI** (`supabase start`) to run a full local Postgres + Auth stack via Docker during development. Schema lives as versioned SQL migrations in `supabase/migrations/`. When ready to go live, `supabase link` + `supabase db push` applies the same migrations to the real hosted Supabase project — no separate schema to maintain. Local `.env.local` and production env vars (set in Vercel) point at different Supabase instances but share one schema.

## Database Schema (Postgres via Supabase)

All row-owning tables carry a denormalized `user_id` (single-user app, so flat RLS checks are simplest). RLS enabled on every table; public signup disabled in Supabase Auth (one `auth.users` row created manually).

- **exercises**: `id`, `user_id` (null = global preset), `name`, `muscle_group`, `is_preset`, `is_archived`, `created_at`. Unique on `(user_id, lower(name))`.
- **routines**: `id`, `user_id`, `name`, `notes`, timestamps.
- **routine_exercises**: `id`, `routine_id`, `user_id`, `exercise_id`, `position`, `target_sets` (optional). Unique `(routine_id, position)`.
- **sessions**: `id`, `user_id`, `routine_id` (nullable = freeform), `name`, `session_date` (client-supplied local date — see gotcha below), `started_at`, `completed_at` (nullable = in-progress), `notes`.
- **session_exercises**: `id`, `session_id`, `user_id`, `exercise_id`, `position`, `notes`. Unique `(session_id, position)`.
- **sets**: `id`, `session_exercise_id`, `user_id`, `exercise_id` (denormalized for fast PR queries), `set_number`, `weight_kg numeric(6,2)`, `reps`, `is_warmup`, `created_at`. Unique `(session_exercise_id, set_number)`; index on `(user_id, exercise_id, is_warmup)`.

**PRs are computed live, not stored.** A plain SQL view (`exercise_prs`: `MAX(weight_kg)` grouped by user/exercise, excluding warmups) is enough — data volume for one lifter is tiny, and a cached/stored PR would need invalidation logic every time a past set is corrected. Live `MAX()` on an indexed column is effectively free and always correct.

## App Structure (Next.js App Router)

```
middleware.ts                          — session refresh, redirect unauthenticated → /login
app/login/page.tsx                     — Supabase Auth email/password
app/(app)/layout.tsx                   — authenticated shell, mobile-first bottom nav
app/(app)/dashboard/page.tsx           — start workout (routine picker/freeform), resume in-progress, recent PRs
app/(app)/log/page.tsx                 — routine chooser → creates session
app/(app)/log/[sessionId]/page.tsx     — active logging screen (client + TanStack Query, optimistic sets, PR badge)
app/(app)/routines/page.tsx            — list/create/delete routines
app/(app)/routines/[routineId]/page.tsx — routine editor (add/reorder/remove exercises)
app/(app)/exercises/page.tsx           — library: presets + custom, search, "add custom"
app/(app)/exercises/[exerciseId]/page.tsx — progress: chart (weight/volume toggle) + history table + PR badge
app/(app)/history/page.tsx             — past sessions list
app/(app)/history/[sessionId]/page.tsx — read-only session detail
lib/supabase/{server,client}.ts        — Supabase clients
lib/actions/*.ts                       — Server Actions (startSession, logSet, createRoutine, createCustomExercise, ...)
supabase/migrations/0001_init.sql      — schema + RLS
supabase/seed.sql                      — preset exercise list
```

Reads (routines, library, history, progress) go through Server Components. Mutations go through Zod-validated Server Actions. The active logging page is the one client-heavy screen, for optimistic UX.

## Core User Flow

1. **Start session** — pick a routine (or Freeform) → server action creates `sessions` row with the client's local date, copies that routine's exercises into `session_exercises` (a snapshot, so later routine edits don't rewrite past history) → redirect to the logging screen.
2. **Log sets** — "Add Set" optimistically appears in the UI, then a server action inserts the row and re-checks `MAX(weight_kg)` server-side to return `isPr`, driving an inline "New PR" badge. Editing/deleting old sets needs no cache fix-up since PRs are always recomputed live.
3. **Freeform session** — same flow, exercises added ad hoc via a picker that appends to `session_exercises`.
4. **View progress** — per-exercise page aggregates all non-warmup sets into a per-session max-weight/volume series for the chart, plus a full history table and the all-time PR badge.

## Edge Cases

- **Timezone**: `session_date` is computed client-side and passed explicitly, never derived from the Postgres server's UTC `now()`, so late-night gym sessions land on the correct calendar day.
- **Ordering**: explicit integer `position`/`set_number` columns, renumbered on reorder — no need for fractional indexing at this scale.
- **Deleting an exercise with history**: `ON DELETE RESTRICT` prevents deleting an exercise that's ever been logged; use `is_archived` instead so it disappears from pickers but stays visible in old sessions/charts.
- **Warmup sets**: `is_warmup` flag excludes them from PR/volume calculations.
- **Numeric precision**: `numeric(6,2)` for weight, not float, to avoid rounding drift when summing volume.
- **In-progress sessions**: `completed_at IS NULL` sessions still count toward PRs (the lift really happened); dashboard offers "Resume" or "Discard" for open sessions.
- **Supabase free-tier auto-pause**: hosted project pauses after ~7 days of inactivity and needs a manual resume in the dashboard — worth a README note.

## Non-Goals (explicit scope boundaries)

No social/sharing features, no nutrition tracking, no rest timer, no offline-first sync, no lbs unit toggle, no 1RM estimation, no periodization/program builder, no multi-user support.

## Verification

- Local: `supabase start` (Docker) + `npm run dev`; manually run through start-routine → log sets → hit a new PR → view progress chart/history on both a mobile viewport and desktop viewport.
- Auth: confirm unauthenticated access redirects to `/login`, and that public signup is disabled.
- RLS: confirm queries return only the single user's rows via the anon key (spot-check in Supabase SQL editor with `set role authenticated; set request.jwt.claim.sub = '<uid>';`).
- Before going live: `supabase link` + `supabase db push` to the hosted project, re-run the same manual walkthrough against production.
