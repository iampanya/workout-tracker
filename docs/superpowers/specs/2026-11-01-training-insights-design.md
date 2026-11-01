# Training insights — Phase 1 (rule-based)

## Context

The user wants their logged training analysed so the next sessions improve, and later wants
program recommendations. Direction agreed in brainstorming is **hybrid**:

- **Phase 1 (this spec):** a deterministic, rule-based metrics layer inside the app. Free, unit-testable,
  no training data leaves the system.
- **Phase 2 (separate spec, later):** an AI coach (in-app Claude call or a Claude Code skill) that
  interprets Phase 1's computed metrics and proposes programs. Feeding it computed numbers keeps it from
  inventing them and keeps the prompt small.

Phase 1 ships two features in one spec because they share one pure analysis module:

- **A. Next-session target** on the logging screen (double progression).
- **B. `/insights` page**: weekly sets per muscle group, per-exercise trend (progressing / plateau /
  declining), consistency, deload signal.

Decisions made in brainstorming:
- Rep range is set **per exercise in a routine**; anything without one uses the default **8–12**.
- Weight step depends on the exercise's muscle group (Legs +5 kg, Chest/Back +2.5 kg,
  Shoulders/Arms/Core +1.25 kg). No per-exercise setting.
- The log screen shows a target line **and** prefills the set inputs with the target.
- Insights has all four sections.
- `/insights` gets no bottom-nav tab (phone bar is full), same as `/body`.

## 1. Next-session target (`lib/insights/progression.ts`, pure)

```ts
type RepRange = { min: number; max: number };
type TargetReason = "addReps" | "addWeight" | "reset" | "repsOnly";
type NextTarget = { weightKg: number; reps: number; reason: TargetReason };

const DEFAULT_REP_RANGE: RepRange = { min: 8, max: 12 };
function stepFor(muscleGroup: string | null): number; // Legs 5, Chest/Back 2.5, else 1.25
function nextTarget(recent: LastSession[], range: RepRange, step: number): NextTarget | null;
```

`recent` holds the working sets of the exercise's last ≤ 2 completed sessions, newest first (warmups
are ignored; a session with no working sets is ignored). For each session, its **top-weight sets** are
the working sets at that session's heaviest working weight.

Rules, first match wins (N = newest session):
1. No usable session → `null`. The UI falls back to today's behaviour (`prefillFromLast`).
2. N's top weight is 0 (bodyweight) → `{ 0, N's lowest reps + 1, "repsOnly" }` — no weight to add,
   so reps go up by one with no cap.
3. Every top-weight set in N reached ≥ `range.max` reps → `{ weight + step, range.min, "addWeight" }`.
4. **Reset:** both sessions exist, have the same top weight, both have a top-weight set below
   `range.min`, and N's lowest top-weight reps are not higher than the previous session's (no rep
   progress) → `{ max(weight − step, 0), range.min, "reset" }`.
5. Otherwise → `{ weight, min(N's lowest top-weight reps + 1, range.max), "addReps" }`.

Weights are returned as numbers in kg, never rounded beyond adding/subtracting `step`.

## 2. Rep range (data)

Hand-written migration `prisma/migrations/0004_routine_rep_range/migration.sql`, expand-only (same style
as `0003_body_scans`; never plain `prisma migrate dev`, see CLAUDE.md known drift):

```sql
alter table public.routine_exercises
  add column target_reps_min integer,
  add column target_reps_max integer,
  add constraint routine_exercises_rep_range_check check (
    (target_reps_min is null and target_reps_max is null)
    or (target_reps_min between 1 and 50 and target_reps_max between target_reps_min and 50)
  );
```

Applied with `npm run db:migrate`, then `prisma db pull` to resync `schema.prisma`. Min and max are set
and cleared together. Old deployments ignore the new nullable columns, so the migration is safe to deploy
before the code.

**Range resolution for a logged exercise:** if the session was started from a routine and that routine's
entry for the exercise has a range, use it; otherwise `DEFAULT_REP_RANGE`. Exercises added mid-session
always use the default.

Rep ranges are **not** in the JSON backup in this phase (like body scans); CLAUDE.md says so.

## 3. Analysis (`lib/insights/analysis.ts`, pure)

Input: completed sessions in the **window = the 8 Monday-start weeks ending with the current week**
(`getWeekStart(addDays(todayStr, -7 * 7))` … `todayStr`), each with `session_date`, `routine_id`, and its
exercises (`exerciseId`, `name`, `muscleGroup`, working sets). All dates are `YYYY-MM-DD` strings and
`todayStr` comes from `getTodayString()` (Bangkok); nothing reads the runtime's local time zone.

- **`muscleVolume`** — for each `MUSCLE_GROUPS` group over the last 28 days (`todayStr − 27` … `todayStr`):
  `setsPerWeek` = working sets ÷ 4, `sessionsPerWeek` = distinct sessions that trained the group ÷ 4,
  `band` = `low` (< 10), `optimal` (10–20), `high` (> 20). Exercises with no muscle group are left out.
  Every group is returned, including ones at 0.
- **`exerciseTrends`** — per exercise, `best e1RM` per session (`estimateOneRepMax` from `lib/pr.ts`,
  max over working sets). Exercises with ≥ 4 sessions in the window and a best e1RM > 0 are scored:
  `recent` = best of the last 3 sessions, `earlier` = best of the sessions before them,
  `changePct = (recent − earlier) / earlier × 100`. Status: `progressing` (> 0), `plateau`
  (≤ 0 and > −5), `declining` (≤ −5). Bodyweight-only exercises are not scored.
- **`deloadSignal`** — `signal = declining ≥ 2 && declining / scored ≥ 0.4`. Also returns
  `weeksSinceLightWeek`: over the complete weeks of the window, a week is *light* when its working
  volume (Σ weight × reps) is < 60% of the mean of the up-to-4 weeks before it (only weeks that have a
  preceding week count); the value is the number of complete weeks since the most recent light week, or
  `null` if none was found.
- **`consistency`** — `sessionsPerWeek` for the 8 weeks (current week flagged partial) and `average`
  over the 7 complete weeks. `skippedRoutineExercises`: for each routine with ≥ 2 sessions in the
  window, its **current** routine exercises that had no logged working set in ≥ 50% of those sessions,
  with `skipped / sessions`.

## 4. Server code

- `lib/routines/service.ts`: `getRoutineTargetSets` → `getRoutineTargets(db, userId, routineId)`
  returning `Record<exerciseId, { targetSets: number | null; repRange: RepRange | null }>`. New
  `updateRoutineExerciseRepRangeForUser(db, userId, routineExerciseId, input)` — zod schema
  `updateRoutineRepRangeSchema` in `lib/validation.ts` (`{ min, max }` both ints 1–50 with min ≤ max,
  or `null` to clear); ownership via `updateMany({ where: { id, user_id } })`, throws when count is 0,
  same as `updateRoutineExerciseTargetSetsForUser`.
- `lib/sessions/service.ts`: `getLastSessionSets` → `getRecentSessionSets(db, userId, exerciseIds,
  excludeSessionId, limit = 2)` returning `Record<exerciseId, LastSession[]>` newest first (window
  function `row_number()` instead of `distinct on`). The "last time" hint uses element 0, the target
  uses both.
- `lib/insights/service.ts`: `getInsights(db, userId, todayStr)` — fetches the window's completed
  sessions with exercises, muscle groups and working sets, plus the routine exercises of routines used in
  the window; every query filters by `user_id`. Returns `{ muscleVolume, trends, deload, consistency,
  hasEnoughData }` where `hasEnoughData` = ≥ 2 completed sessions in the window. No next-auth import.
- `lib/actions/routines.ts`: `updateRoutineExerciseRepRange` thin action + `revalidatePath`.
- The add-exercise-to-session action also returns the exercise's `recentSessions`; the client computes
  its `target` with the pure `nextTarget` (default range, step from the picked exercise's muscle group)
  so it shows without a reload.

## 5. UI

**Log screen** (`app/(app)/log/[sessionId]/page.tsx`, `types.ts`, `ExerciseCard.tsx`, `LoggingClient.tsx`)
- The page computes `target: NextTarget | null` and `repRange` per exercise on the server.
- `ExerciseCard` shows a target line under the "last time" hint, e.g.
  "เป้า 62.5 kg × 8 · ครบ 12 ทุกเซ็ต → เพิ่มน้ำหนัก". Each `reason` has its own message
  (`addReps`: "add a rep", `addWeight`: "hit {max} on every set → add weight", `reset`: "stalled below
  {min} twice → drop the weight", `repsOnly`: "add a rep").
- New-set inputs prefill from `target`, falling back to `prefillFromLast`.

**Routine page** (`app/(app)/routines/[routineId]/RoutineExerciseRow.tsx`)
- A "Rep range" select under target sets: "Default (8–12)" plus presets 3–5, 5–8, 6–10, 8–12, 10–15,
  12–20, 15–25 (`REP_RANGE_PRESETS`). Picking one sets min and max together; "Default" clears both.

**`/insights`** (`app/(app)/insights/page.tsx`, `loading.tsx` with `PageSkeleton`)
- `hasEnoughData` false → `EmptyState` only.
- `DeloadBanner` — only when `deload.signal`; shows `weeksSinceLightWeek` when known.
- `MuscleVolumeCard` — one row per group: bar of `setsPerWeek` against the 10–20 band, band `Badge`,
  `sessionsPerWeek`. Colours from `components/ui/muscle.ts`.
- `TrendsCard` — progressing / plateau / declining groups; each row: exercise name, `changePct`, link to
  `/exercises/[exerciseId]`; one static tip per status. Message when nothing is scored yet ("needs 4+
  sessions of an exercise in 8 weeks").
- `ConsistencyCard` — 8 weekly bars (current marked partial), average, skipped routine exercises.
- Built from `Card`, `Badge`, `StatCard`, `EmptyState`; dates formatted on the server.

**Navigation** — `/insights` added to `TOP_NAV_ITEMS` (`app/(app)/nav-items.ts`), `AccountMenu.tsx`, and
an `InsightsCard` on the dashboard (deload signal, else plateau + low-volume counts) linking to it.

**i18n** — new `insights` namespace and new keys under the log/routine namespaces in
`messages/en.json` + `messages/th.json`; no hardcoded strings; muscle groups via `muscleLabel`.

## 6. Conventions to honor

- Service functions take `(db, userId, …)`, filter every query by `user_id`, and get isolation tests.
- `lib/insights/*` never imports next-intl or `lib/session.ts`.
- `numeric` → `Number()`, `@db.Date` → `toDateOnlyString`.
- Weights are kg only.
- Glossary: add **Rep range**, **Next target**, **Plateau**, **Deload signal** to `CONTEXT.md`.

## 7. Testing

- Pure (add to `npm test` **and** exclude in `test:db` in `package.json`):
  - `lib/insights/progression.test.ts`: every `reason`, warmups ignored, mixed weights (only top-weight
    sets count), reset needs same weight + no rep progress + two sessions, bodyweight, empty history,
    `stepFor` per group.
  - `lib/insights/analysis.test.ts`: band edges (9.75 / 10 / 20 / 20.25), 28-day boundary, trend
    thresholds (0, −5), < 4 sessions not scored, deload thresholds, light-week detection, consistency
    average excludes the partial week, skip threshold, week bucketing under several `process.env.TZ`.
- DB (`test:db`): `lib/insights/service.test.ts` (window filtering, incomplete sessions excluded,
  cross-user isolation), rep-range cases in `lib/routines/service.test.ts` (set, clear, invalid,
  other user's row), `getRecentSessionSets` in `lib/sessions/service.test.ts` (order, limit, excluded
  session, isolation).

## Out of scope (follow-ups)

- Phase 2: AI evaluation and program recommendation that saves as a routine.
- Rep ranges in the JSON backup.
- Per-exercise weight step, rep range on freeform sessions, RPE/RIR logging.
