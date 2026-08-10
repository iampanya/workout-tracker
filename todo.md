# TODO

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
  exercises). Searchable `ExerciseCombobox` (filter by name or muscle group) in the log + routine pickers.

## Next — Username login + multi-user signup (separate session)

Full requirements and a phased plan are in
`docs/superpowers/specs/2026-08-11-username-login-multiuser-design.md`. Not started.

## Follow-up (separate, unrelated task)

Clean up the ~stray `test-*@test.local` users and their orphaned sessions/sets in the local DB
(leftover from `test:db` runs not tearing down).
