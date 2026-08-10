# Faster set logging: prefill defaults + PR badge

## Problem

Logging a workout set requires re-typing weight and reps every time, even when
most sets of an exercise use the same numbers. And the active workout screen
gives no sense of how a set compares to past performance — the lifter has to
remember or go check exercise history separately.

## Goals

1. When logging a set, the input row defaults to the previous set's weight
   and reps, so identical or near-identical sets take one tap instead of two
   text entries.
2. Each exercise card on the active workout screen shows the lifter's
   all-time PR (max non-warmup weight) for that exercise, for quick reference
   while deciding what to lift.

## Non-goals

- Cross-session defaults (e.g. seeding today's first set from last time this
  exercise was logged). First set of an exercise in a session starts blank.
- Recomputing/lowering the displayed PR when a set is edited or deleted.
  It only ever moves up live, within the session, when a new PR is set; a
  page refresh will always show the correct value regardless.
- Carrying the warmup checkbox state forward between prefilled rows.

## Feature 1: Prefill weight/reps from the previous set

Applies to the per-exercise input row on the active workout screen
([LoggingClient.tsx](../../../app/(app)/log/[sessionId]/LoggingClient.tsx)).

**Behavior:**

- If an exercise already has at least one logged set, its input row's
  weight/reps default to that exercise's most recent set (highest
  `set_number`) — both when the page first loads (e.g. after a refresh or
  resuming the session) and immediately after each successful "Add Set".
- The warmup checkbox always defaults to unchecked when a row is prefilled;
  it is not carried over from the previous set.
- The first set of an exercise in a session (no sets yet) leaves the row
  blank, as it does today.
- If "Add Set" fails, the row is left showing the values that were just
  submitted (nothing to roll back to, since the row isn't blanked
  optimistically anymore).

**Implementation:**

- `inputs` state initializes per exercise from `initialExercises`: if
  `exercise.sets.length > 0`, seed with `{ weight: lastSet.weight_kg, reps:
  lastSet.reps, warmup: false }` (sets sorted by `set_number`, already the
  case per `page.tsx`); otherwise blank.
- `handleAddSet` currently blanks the row right after calling `mutate`.
  Change this to re-seed the row with the just-submitted `{weight, reps}`
  (warmup reset to `false`) instead of blanking it.
- Purely client-side state change — no server or schema changes.

## Feature 2: PR badge on each exercise card

**Data source:** the existing `exercise_prs` database view (`max(weight_kg)`
per `user_id`/`exercise_id`, excluding warmup sets). It's a live view, not a
cached table, so it's always accurate on read — no invalidation to manage.

**Data flow:**

- **Initial page load** ([page.tsx](../../../app/(app)/log/[sessionId]/page.tsx)):
  add one batched query fetching PRs for every exercise already in the
  session (`.in("exercise_id", ids)` against `exercise_prs`, scoped to the
  current user) instead of one query per exercise. Attach the result as
  `prWeightKg: number | null` on each exercise entry passed to
  `LoggingClient`.
- **Adding an exercise mid-session** (existing "Add Exercise" picker): the
  `addExerciseToSession` server action ([lib/actions/sessions.ts](../../../lib/actions/sessions.ts))
  gains a PR lookup for the newly added exercise, returned alongside the
  created `session_exercise`, so the new card shows the correct badge
  immediately (relevant if this exercise was logged in an earlier session).
- **Live update within the session:** in `logSetMutation` and
  `updateSetMutation`'s `onSuccess` handlers, when `result.isPr` is `true`,
  update that exercise's `prWeightKg` in local state to the newly logged
  weight — mirroring the existing `prBanner` logic that already detects this
  case.

**UI:** a small badge near the exercise name on the `Card` (e.g. "PR 100
kg"). If `prWeightKg` is `null` (exercise never logged before), the badge is
omitted entirely — no placeholder text.

## Testing

This repo has no component-level (`.tsx`) test coverage today — only
`lib/**/*.test.ts` for service/query functions. Following that pattern:

- Add a unit test for the new batched PR-lookup helper in
  `lib/sessions/service.test.ts`. This file already runs under the `test:db`
  script (which excludes the pure-function test files by name rather than
  including DB-backed ones by name), so no `package.json` change is needed.
- Prefill behavior and live badge updates are UI/state logic without an
  existing test harness for it — verify manually in the browser (add a set,
  refresh, confirm prefill; log a new PR, confirm the badge updates without
  refresh).
