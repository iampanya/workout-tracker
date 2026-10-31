# TODO

## Next — Body scans follow-ups

- Include `body_scans` / `body_goals` in the JSON backup (`exportUserData`, `ImportSummary`, and the
  `import_backup` SQL function).
- In-app PDF upload: send the PDF to the Claude API for extraction, then reuse the `/body` import
  preview/confirm flow.
- Strength relative to bodyweight on exercise pages (e1RM ÷ weight at that date).

## Done — Body composition tracking (2026-10-31)

`/body`: import arboleaf scans as JSON (made by Claude Code via the `arboleaf-to-json` skill), latest
snapshot with deltas, goals (with arboleaf's suggestion), trend chart, muscle balance vs training,
full per-scan report; dashboard Body card. Spec/plan in `docs/superpowers/{specs,plans}/2026-10-31-*`.

## Done — Invite card fix (2026-10-12)

The Profile "Invite friends" card copied a dead `/signup?invite=CODE` link (the `/signup` flow was
removed with Google sign-in). It now shares the landing page `/`; Regenerate and its server action
were removed.

## Done — Dates in the app's time zone (2026-10-12)

"Today" (Today/Yesterday labels, dashboard streak/week stats, a new session's `session_date`) is
computed in `TIME_ZONE` (`Asia/Bangkok`) via `getTodayString()`, not the server's local zone (Vercel =
UTC), which was off by a day 00:00–07:00 Bangkok.

## Done — Translated not-found and error pages (2026-10-12)

`app/not-found.tsx` and `app/error.tsx` render localized copy.

## Done — Thai localization (2026-10-11)

next-intl, cookie-based, Thai default + English. Plan/spec in
`docs/superpowers/plans/2026-10-11-thai-localization.md`.

## Done — Sheet closes on Back (2026-10-11)

`Sheet` pushes a same-URL history entry while open, so the browser/Android Back button closes it
instead of leaving the page.

## Done — Exercise picker redesign (2026-10-03)

Replaced the inline `ExerciseCombobox` dropdown with `ExercisePicker` (bottom sheet): search, muscle-group
filter chips, sticky color-coded group headers, Recent section, "Added" marks, multi-add, and
create-from-search. Used in the log + routine editor.

## Done — Color themes (2026-09-30)

Brand accent switched to teal, plus a user-selectable color theme (teal, orange, blue, violet) stored
per device alongside light/dark.

## Done — Stray test users in the local DB (2026-09-29)

Removed 316 leftover `test-*@test.local` users (and their data) from the local DB. `test:db` now
tears them down itself: `vitest.db.config.ts` adds `lib/test-global-setup.ts`, whose teardown deletes
every test user after the run (local hosts only).

## Done — Production baselined onto Prisma Migrate (2026-09-15)

Prod adopted `prisma/migrations/0001_init` via `prisma migrate resolve --applied 0001_init`; Prisma
Migrate is now the single schema source for local and prod, and Vercel production builds run
`prisma migrate deploy`. Runbook: `docs/baseline-prod-to-prisma-migrate.md`.

## Done — Dashboard overview + UX pass (2026-08-11)

The dashboard "Overview" stats section (streak / sessions this week / volume this week) is **implemented**,
along with a broader UX pass:

- Overview stats: `lib/date.ts` week helpers, `lib/dashboard/streak.ts`, `getOverviewStats` — all with tests.
- Dashboard also gained a **weekly volume** bar chart (`getWeeklyVolume` + `WeeklyVolumeChart`), an
  all-time **Personal records** grid (`listTopPrs`), and a **Recent workouts** preview.
- Reusable `ConfirmDialog` on all destructive deletes (routines, in-progress discard, history delete,
  mid-workout exercise removal).
- History/dashboard now show the routine name (snapshotted at start, `sessionDisplayName` fallback).
- Delete a workout from History; remove an exercise mid-workout; finish-workout validation (no empty
  exercises). Searchable exercise picker (now `ExercisePicker`, see above) in the log + routine pickers.

## Done — Username login + multi-user signup (2026-08-11) — superseded

> Superseded by Google sign-in (Auth.js, open signup): username/password login and the invite-gated
> `/signup` flow were removed.

Implemented phases B1–B4: username login, invite-gated `/signup`, `profiles`/`invite_codes` schema
(migration `0003`), server-side auth actions, and docs. See
`docs/superpowers/specs/2026-08-11-username-login-multiuser-design.md`.

**Deferred:** B5 (password reset by email) — moot now that sign-in is Google-only.
