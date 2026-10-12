# TODO

## Done — Invite card fix (2026-10-12)

The Profile "Invite friends" card copied a dead `/signup?invite=CODE` link (the `/signup` flow was
removed with Google sign-in). It now shares the landing page `/`; Regenerate and its server action
were removed.

## Done — Thai localization (2026-10-11)

next-intl, cookie-based, Thai default + English. Plan/spec in
`docs/superpowers/plans/2026-10-11-thai-localization.md`.

## Done — Exercise picker redesign (2026-10-03)

Replaced the inline `ExerciseCombobox` dropdown with `ExercisePicker` (bottom sheet): search, muscle-group
filter chips, sticky color-coded group headers, Recent section, "Added" marks, multi-add, and
create-from-search. Used in the log + routine editor.

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
  exercises). Searchable exercise picker (now `ExercisePicker`, see below) in the log + routine pickers.

## Done — Username login + multi-user signup (2026-08-11) — superseded

> Superseded by Google sign-in (Auth.js, open signup): username/password login and the invite-gated
> `/signup` flow were removed.

Implemented phases B1–B4: username login, invite-gated `/signup`, `profiles`/`invite_codes` schema
(migration `0003`), server-side auth actions, and docs. See
`docs/superpowers/specs/2026-08-11-username-login-multiuser-design.md`.

**Deferred:** B5 (password reset by email).

## Done — Stray test users in the local DB (2026-09-29)

Removed 316 leftover `test-*@test.local` users (and their data) from the local DB. `test:db` now
tears them down itself: `vitest.db.config.ts` adds `lib/test-global-setup.ts`, whose teardown deletes
every test user after the run (local hosts only).
