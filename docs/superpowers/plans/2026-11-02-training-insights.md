# Training Insights (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a rule-based next-session target (weight × reps) on the logging screen and add an `/insights` page (weekly sets per muscle group, exercise trends, consistency, deload signal).

**Architecture:** Two pure, DB-free modules in `lib/insights/` hold all the rules (`progression.ts` for the target, `analysis.ts` for the insights) and are unit-tested under `npm test`. A thin DB service (`lib/insights/service.ts`) loads 8 weeks of completed sessions and feeds the pure functions. Routines gain an optional per-exercise rep range (`routine_exercises.target_reps_min/max`, hand-written expand-only migration). The UI is server components plus small edits to existing client components.

**Tech Stack:** Next.js 16 App Router, Prisma 7 (Postgres), next-intl 4, Vitest, Tailwind, `@phosphor-icons/react/ssr`.

**Spec:** `docs/superpowers/specs/2026-11-01-training-insights-design.md`

## Global Constraints

- Branch: work on `feat/training-insights` (already checked out). Commit after every task; end each commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Default rep range **8–12**. Weight step: **Legs +5 kg, Chest/Back +2.5 kg, Shoulders/Arms/Core (and no group) +1.25 kg**.
- Analysis window = **the 8 Monday-start weeks ending with the current week**. Muscle volume uses the **last 28 days** (today inclusive). Bands: `< 10` low, `10–20` optimal, `> 20` high (sets/week).
- Trends: scored when an exercise has **≥ 4 sessions** in the window; recent = best e1RM of the **last 3** sessions vs best before; `> 0%` progressing, `≤ 0% and > −5%` plateau, `≤ −5%` declining.
- Deload signal: **declining ≥ 2 and declining / scored ≥ 0.4**. Light week: volume **< 60%** of the mean of the up-to-4 complete weeks before it.
- Skipped routine exercises: routine has **≥ 2 sessions** in the window and the exercise had no working set in **≥ 50%** of them.
- Calendar days are `YYYY-MM-DD` strings; today = `getTodayString()` (Bangkok). Never `new Date().getDay()`/local time zone (CLAUDE.md "Dates").
- Every service query filters by `user_id`; every new service gets a cross-user isolation test.
- `lib/insights/*` must not import `next-intl`, `next-auth`, or `lib/session.ts`.
- No hardcoded UI strings — every visible string (incl. aria-labels) in `messages/en.json` **and** `messages/th.json` with identical ICU arguments. Restart `next dev` after editing messages.
- Icons only from `@phosphor-icons/react/ssr`. Reuse `components/ui/*` primitives.
- Never run plain `prisma migrate dev` (known drift). Don't run `prettier --write`.
- New pure test files must be added to `test` **and** excluded in `test:db` in `package.json`.

## File map

| File | Responsibility |
|---|---|
| `lib/insights/progression.ts` (new) | `RepRange`, `NextTarget`, `DEFAULT_REP_RANGE`, `REP_RANGE_PRESETS`, `stepFor`, `nextTarget`, `repRangeValue`, `parseRepRange` |
| `lib/insights/analysis.ts` (new) | Window weeks, `muscleVolume`, `exerciseTrends`, `weeklyTotals`, `weeksSinceLightWeek`, `deloadSignal`, `skippedRoutineExercises`, `buildInsights` |
| `lib/insights/service.ts` (new) | `getInsights(db, userId, todayStr)` — DB load → `buildInsights` |
| `prisma/migrations/0004_routine_rep_range/migration.sql` (new) | Two nullable columns + CHECK on `routine_exercises` |
| `prisma/schema.prisma` | Add the two fields to `routine_exercises` |
| `lib/validation.ts` | `updateRoutineRepRangeSchema` |
| `lib/routines/service.ts` | `getRoutineTargets` (replaces `getRoutineTargetSets`), `updateRoutineExerciseRepRangeForUser` |
| `lib/sessions/service.ts` | `getRecentSessionSets` (replaces `getLastSessionSets`) |
| `lib/actions/routines.ts`, `lib/actions/sessions.ts` | Thin actions |
| `app/(app)/log/[sessionId]/{page.tsx,types.ts,ExerciseCard.tsx,LoggingClient.tsx}` | Target line + prefill |
| `app/(app)/routines/[routineId]/{page.tsx,RoutineExerciseRow.tsx}` | Rep range select |
| `app/(app)/insights/{page.tsx,loading.tsx,DeloadBanner.tsx,MuscleVolumeCard.tsx,TrendsCard.tsx,ConsistencyCard.tsx}` (new) | Insights page |
| `app/(app)/dashboard/{page.tsx,InsightsCard.tsx}`, `app/(app)/nav-items.ts`, `app/(app)/AccountMenu.tsx` | Navigation |
| `messages/en.json`, `messages/th.json` | Strings |
| `CLAUDE.md`, `CONTEXT.md` | Docs |

---

### Task 1: Next-session target rules (pure)

**Files:**
- Create: `lib/insights/progression.ts`
- Test: `lib/insights/progression.test.ts`
- Modify: `package.json` (scripts `test`, `test:db`)

**Interfaces:**
- Consumes: `LastSession` from `lib/sessions/last-session.ts` (`{ sessionDate: string; sets: { weight_kg: number; reps: number; is_warmup: boolean }[] }`).
- Produces:
  - `type RepRange = { min: number; max: number }`
  - `type TargetReason = "addReps" | "addWeight" | "reset" | "repsOnly"`
  - `type NextTarget = { weightKg: number; reps: number; reason: TargetReason }`
  - `const DEFAULT_REP_RANGE: RepRange` (8–12), `const REP_RANGE_PRESETS: RepRange[]`
  - `stepFor(muscleGroup: string | null): number`
  - `nextTarget(recent: LastSession[], range: RepRange, step: number): NextTarget | null`
  - `repRangeValue(range: RepRange | null): string` (`"8-12"` or `""`), `parseRepRange(value: string): RepRange | null`

- [ ] **Step 1: Register the test file in both suites**

In `package.json`, append ` lib/insights/progression.test.ts` to the end of the `test` script's file list (before the closing `"`), and append ` --exclude lib/insights/progression.test.ts` to the end of the `test:db` script.

- [ ] **Step 2: Write the failing test**

Create `lib/insights/progression.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { LastSession } from "@/lib/sessions/last-session";
import {
  DEFAULT_REP_RANGE,
  REP_RANGE_PRESETS,
  nextTarget,
  parseRepRange,
  repRangeValue,
  stepFor,
} from "./progression";

const set = (weight_kg: number, reps: number, is_warmup = false) => ({ weight_kg, reps, is_warmup });
const session = (sets: LastSession["sets"], sessionDate = "2026-10-01"): LastSession => ({ sessionDate, sets });
const R = DEFAULT_REP_RANGE;

describe("nextTarget", () => {
  it("returns null without usable history", () => {
    expect(nextTarget([], R, 2.5)).toBeNull();
    expect(nextTarget([session([set(40, 10, true)])], R, 2.5)).toBeNull();
  });

  it("adds weight and drops to the bottom of the range once every top set hits the top", () => {
    expect(nextTarget([session([set(60, 12), set(60, 12), set(60, 13)])], R, 2.5)).toEqual({
      weightKg: 62.5,
      reps: 8,
      reason: "addWeight",
    });
  });

  it("otherwise adds a rep to the weakest top set, capped at the top of the range", () => {
    expect(nextTarget([session([set(60, 10), set(60, 9), set(60, 8)])], R, 2.5)).toEqual({
      weightKg: 60,
      reps: 9,
      reason: "addReps",
    });
    expect(nextTarget([session([set(60, 12), set(60, 11)])], R, 2.5)).toEqual({
      weightKg: 60,
      reps: 12,
      reason: "addReps",
    });
  });

  it("only looks at sets at the session's heaviest working weight, ignoring warmups", () => {
    expect(nextTarget([session([set(55, 12), set(60, 9), set(60, 8)])], R, 2.5)).toMatchObject({
      weightKg: 60,
      reps: 9,
    });
    expect(nextTarget([session([set(50, 6), set(60, 12), set(60, 12)])], R, 2.5)?.reason).toBe("addWeight");
    expect(nextTarget([session([set(40, 5, true), set(60, 12), set(60, 12)])], R, 2.5)?.reason).toBe("addWeight");
  });

  it("resets the weight after two stalled sessions below the range at the same weight", () => {
    const newest = session([set(60, 6), set(60, 6)], "2026-10-08");
    const previous = session([set(60, 7), set(60, 6)], "2026-10-01");
    expect(nextTarget([newest, previous], R, 2.5)).toEqual({ weightKg: 57.5, reps: 8, reason: "reset" });
  });

  it("does not reset while reps are still improving, after a weight change, or with one session", () => {
    const improving = [session([set(60, 7), set(60, 7)]), session([set(60, 6), set(60, 6)])];
    expect(nextTarget(improving, R, 2.5)).toEqual({ weightKg: 60, reps: 8, reason: "addReps" });

    const weightChanged = [session([set(60, 6)]), session([set(57.5, 6)])];
    expect(nextTarget(weightChanged, R, 2.5)).toEqual({ weightKg: 60, reps: 7, reason: "addReps" });

    expect(nextTarget([session([set(60, 6)])], R, 2.5)).toEqual({ weightKg: 60, reps: 7, reason: "addReps" });
  });

  it("never resets below zero", () => {
    const stalled = [session([set(1.25, 5)]), session([set(1.25, 5)])];
    expect(nextTarget(stalled, R, 2.5)).toEqual({ weightKg: 0, reps: 8, reason: "reset" });
  });

  it("progresses bodyweight work by reps only, with no cap", () => {
    expect(nextTarget([session([set(0, 12), set(0, 15)])], R, 2.5)).toEqual({
      weightKg: 0,
      reps: 13,
      reason: "repsOnly",
    });
  });

  it("honours a custom range and rounds to 2 decimals", () => {
    expect(nextTarget([session([set(100, 8), set(100, 8)])], { min: 5, max: 8 }, 5)).toEqual({
      weightKg: 105,
      reps: 5,
      reason: "addWeight",
    });
    expect(nextTarget([session([set(20.1, 12)])], R, 1.25)?.weightKg).toBe(21.35);
  });
});

describe("stepFor", () => {
  it("steps by muscle group", () => {
    expect(stepFor("Legs")).toBe(5);
    expect(stepFor("Chest")).toBe(2.5);
    expect(stepFor("Back")).toBe(2.5);
    expect(stepFor("Shoulders")).toBe(1.25);
    expect(stepFor("Arms")).toBe(1.25);
    expect(stepFor("Core")).toBe(1.25);
    expect(stepFor(null)).toBe(1.25);
  });
});

describe("rep range values", () => {
  it("round-trips through the select value", () => {
    expect(repRangeValue({ min: 6, max: 10 })).toBe("6-10");
    expect(repRangeValue(null)).toBe("");
    expect(parseRepRange("6-10")).toEqual({ min: 6, max: 10 });
    expect(parseRepRange("")).toBeNull();
    expect(parseRepRange("10-6")).toBeNull();
    expect(parseRepRange("x")).toBeNull();
  });

  it("offers the default among the presets", () => {
    expect(REP_RANGE_PRESETS).toContainEqual(DEFAULT_REP_RANGE);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/insights/progression.test.ts`
Expected: FAIL — `Failed to resolve import "./progression"`.

- [ ] **Step 4: Write the implementation**

Create `lib/insights/progression.ts`:

```ts
// Next-session target for one exercise (double progression): add reps at the same weight until
// every top set reaches the top of the rep range, then add weight and start again at the
// bottom. Pure and DB-free so it runs under `npm test` and in the browser.
import type { LastSession } from "@/lib/sessions/last-session";

export type RepRange = { min: number; max: number };
export type TargetReason = "addReps" | "addWeight" | "reset" | "repsOnly";
export type NextTarget = { weightKg: number; reps: number; reason: TargetReason };

// Used when the session didn't come from a routine, or the routine entry has no range.
export const DEFAULT_REP_RANGE: RepRange = { min: 8, max: 12 };

// Choices on the routine page.
export const REP_RANGE_PRESETS: RepRange[] = [
  { min: 3, max: 5 },
  { min: 5, max: 8 },
  { min: 6, max: 10 },
  { min: 8, max: 12 },
  { min: 10, max: 15 },
  { min: 12, max: 20 },
  { min: 15, max: 25 },
];

const STEP_BY_GROUP: Record<string, number> = { Legs: 5, Chest: 2.5, Back: 2.5 };

// Weight added when the top of the range is reached: big lower-body lifts move faster.
export function stepFor(muscleGroup: string | null): number {
  return STEP_BY_GROUP[muscleGroup ?? ""] ?? 1.25;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// A session's working sets at its heaviest working weight, or null when it had none.
function topSets(session: LastSession): { weight: number; lowestReps: number; allReps: number[] } | null {
  const working = session.sets.filter((s) => !s.is_warmup);
  if (working.length === 0) return null;
  const weight = Math.max(...working.map((s) => s.weight_kg));
  const allReps = working.filter((s) => s.weight_kg === weight).map((s) => s.reps);
  return { weight, lowestReps: Math.min(...allReps), allReps };
}

// `recent` = the exercise's last completed sessions, newest first (only the first two matter).
export function nextTarget(recent: LastSession[], range: RepRange, step: number): NextTarget | null {
  const [newest, previous] = recent.map(topSets).filter((t) => t !== null);
  if (!newest) return null;

  if (newest.weight === 0) {
    return { weightKg: 0, reps: newest.lowestReps + 1, reason: "repsOnly" };
  }
  if (newest.allReps.every((reps) => reps >= range.max)) {
    return { weightKg: round2(newest.weight + step), reps: range.min, reason: "addWeight" };
  }
  // Two sessions stuck below the range at the same weight with no rep gained: back off.
  if (
    previous &&
    previous.weight === newest.weight &&
    newest.lowestReps < range.min &&
    previous.lowestReps < range.min &&
    newest.lowestReps <= previous.lowestReps
  ) {
    return { weightKg: Math.max(round2(newest.weight - step), 0), reps: range.min, reason: "reset" };
  }
  return { weightKg: newest.weight, reps: Math.min(newest.lowestReps + 1, range.max), reason: "addReps" };
}

// <select> value for a range ("" = use the default).
export function repRangeValue(range: RepRange | null): string {
  return range ? `${range.min}-${range.max}` : "";
}

export function parseRepRange(value: string): RepRange | null {
  const match = /^(\d+)-(\d+)$/.exec(value);
  if (!match) return null;
  const range = { min: Number(match[1]), max: Number(match[2]) };
  return range.min <= range.max ? range : null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/insights/progression.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add lib/insights/progression.ts lib/insights/progression.test.ts package.json
git commit -m "feat(insights): pure next-session target rules (double progression)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Insights analysis rules (pure)

**Files:**
- Create: `lib/insights/analysis.ts`
- Test: `lib/insights/analysis.test.ts`
- Modify: `package.json` (scripts `test`, `test:db`)

**Interfaces:**
- Consumes: `addDays`, `getWeekStart` (`lib/date.ts`); `estimateOneRepMax` (`lib/pr.ts`); `MUSCLE_GROUPS`, `isMuscleGroup`, `MuscleGroup` (`lib/validation.ts`).
- Produces (all exported from `lib/insights/analysis.ts`):
  - Constants `WINDOW_WEEKS = 8`, `LOW_SETS = 10`, `HIGH_SETS = 20`
  - `type AnalysisSet = { weightKg: number; reps: number }` (working sets only)
  - `type AnalysisExercise = { exerciseId: string; name: string; muscleGroup: string | null; sets: AnalysisSet[] }`
  - `type AnalysisSession = { id: string; date: string; routineId: string | null; exercises: AnalysisExercise[] }`
  - `type RoutineExerciseRef = { routineId: string; routineName: string; exerciseId: string; exerciseName: string }`
  - `type VolumeBand = "low" | "optimal" | "high"`; `type MuscleVolume = { group: MuscleGroup; setsPerWeek: number; sessionsPerWeek: number; band: VolumeBand }`
  - `type TrendStatus = "progressing" | "plateau" | "declining"`; `type ExerciseTrend = { exerciseId: string; name: string; muscleGroup: string | null; status: TrendStatus; changePct: number; sessions: number }`
  - `type WeekTotal = { weekStart: string; volumeKg: number; sessions: number; partial: boolean }`
  - `type DeloadSignal = { signal: boolean; declining: number; scored: number; weeksSinceLightWeek: number | null }`
  - `type SkippedExercise = RoutineExerciseRef & { skipped: number; sessions: number }`
  - `type Consistency = { weeks: WeekTotal[]; averagePerWeek: number; skipped: SkippedExercise[] }`
  - `type Insights = { hasEnoughData: boolean; muscleVolume: MuscleVolume[]; trends: ExerciseTrend[]; deload: DeloadSignal; consistency: Consistency }`
  - Functions: `windowWeeks(todayStr): string[]`, `volumeBand(setsPerWeek): VolumeBand`, `muscleVolume(sessions, todayStr): MuscleVolume[]`, `trendStatus(changePct): TrendStatus`, `exerciseTrends(sessions): ExerciseTrend[]`, `weeklyTotals(sessions, todayStr): WeekTotal[]`, `weeksSinceLightWeek(completeWeekVolumes: number[]): number | null`, `deloadSignal(trends, completeWeekVolumes): DeloadSignal`, `skippedRoutineExercises(sessions, routineExercises): SkippedExercise[]`, `buildInsights(sessions, routineExercises, todayStr): Insights`

Test dates: `2026-11-02` is a Monday. With today `2026-11-04` (Wednesday) the window weeks are `2026-09-14 … 2026-11-02` and the 28-day volume window starts `2026-10-08`.

- [ ] **Step 0: Register the test file in both suites**

In `package.json`, append ` lib/insights/analysis.test.ts` to the end of the `test` script's file list, and ` --exclude lib/insights/analysis.test.ts` to the end of the `test:db` script.

- [ ] **Step 1: Write the failing test**

Create `lib/insights/analysis.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import {
  buildInsights,
  deloadSignal,
  exerciseTrends,
  muscleVolume,
  skippedRoutineExercises,
  weeklyTotals,
  weeksSinceLightWeek,
  windowWeeks,
  type AnalysisExercise,
  type AnalysisSession,
  type AnalysisSet,
  type ExerciseTrend,
  type TrendStatus,
} from "./analysis";

const TODAY = "2026-11-04";
const set = (weightKg: number, reps: number): AnalysisSet => ({ weightKg, reps });
const sets = (n: number, weightKg = 50, reps = 10) => Array.from({ length: n }, () => set(weightKg, reps));
const ex = (exerciseId: string, muscleGroup: string | null, s: AnalysisSet[]): AnalysisExercise => ({
  exerciseId,
  name: exerciseId,
  muscleGroup,
  sets: s,
});
let seq = 0;
const session = (date: string, exercises: AnalysisExercise[], routineId: string | null = null): AnalysisSession => ({
  id: `s${seq++}`,
  date,
  routineId,
  exercises,
});
const chest = (vol: ReturnType<typeof muscleVolume>) => vol.find((v) => v.group === "Chest")!;

describe("windowWeeks", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  for (const tz of ["UTC", "Asia/Bangkok", "America/Los_Angeles"]) {
    it(`is the 8 Monday weeks ending this week with TZ=${tz}`, () => {
      process.env.TZ = tz;
      expect(windowWeeks(TODAY)).toEqual([
        "2026-09-14",
        "2026-09-21",
        "2026-09-28",
        "2026-10-05",
        "2026-10-12",
        "2026-10-19",
        "2026-10-26",
        "2026-11-02",
      ]);
    });
  }
});

describe("muscleVolume", () => {
  it("bands average weekly sets over 28 days at 10 and 20", () => {
    const at = (n: number) => chest(muscleVolume([session("2026-11-03", [ex("bench", "Chest", sets(n))])], TODAY));
    expect(at(39)).toMatchObject({ setsPerWeek: 9.75, band: "low" });
    expect(at(40)).toMatchObject({ setsPerWeek: 10, band: "optimal" });
    expect(at(80)).toMatchObject({ setsPerWeek: 20, band: "optimal" });
    expect(at(81)).toMatchObject({ setsPerWeek: 20.25, band: "high" });
  });

  it("counts the 28 days ending today and nothing before", () => {
    expect(chest(muscleVolume([session("2026-10-08", [ex("bench", "Chest", sets(40))])], TODAY)).setsPerWeek).toBe(10);
    expect(chest(muscleVolume([session("2026-10-07", [ex("bench", "Chest", sets(40))])], TODAY)).setsPerWeek).toBe(0);
  });

  it("returns every group, counts sessions per week, and ignores exercises without a group", () => {
    const vol = muscleVolume(
      [
        session("2026-10-20", [ex("bench", "Chest", sets(3)), ex("fly", "Chest", sets(2)), ex("odd", null, sets(9))]),
        session("2026-10-27", [ex("bench", "Chest", sets(3))]),
      ],
      TODAY
    );
    expect(vol.map((v) => v.group)).toEqual(["Chest", "Back", "Legs", "Shoulders", "Arms", "Core"]);
    expect(chest(vol)).toMatchObject({ setsPerWeek: 2, sessionsPerWeek: 0.5 });
    expect(vol.find((v) => v.group === "Core")).toMatchObject({ setsPerWeek: 0, band: "low" });
  });
});

describe("exerciseTrends", () => {
  // reps = 1 makes the estimated 1RM equal to the weight.
  const history = (weights: number[], id = "bench") =>
    weights.map((w, i) => session(`2026-10-${String(1 + i * 7).padStart(2, "0")}`, [ex(id, "Chest", [set(w, 1)])]));

  it("compares the best of the last 3 sessions with the best before them", () => {
    expect(exerciseTrends(history([100, 100, 102, 101]))).toEqual([
      { exerciseId: "bench", name: "bench", muscleGroup: "Chest", status: "progressing", changePct: 2, sessions: 4 },
    ]);
    expect(exerciseTrends(history([100, 100, 100, 99]))[0]).toMatchObject({ status: "plateau", changePct: 0 });
    expect(exerciseTrends(history([100, 96, 96, 96]))[0]).toMatchObject({ status: "plateau", changePct: -4 });
    expect(exerciseTrends(history([100, 95, 95, 95]))[0]).toMatchObject({ status: "declining", changePct: -5 });
  });

  it("needs 4 sessions and a non-zero 1RM", () => {
    expect(exerciseTrends(history([100, 100, 102]))).toEqual([]);
    expect(exerciseTrends(history([0, 0, 0, 0]))).toEqual([]);
  });

  it("counts an exercise logged twice in one session as one session", () => {
    const doubled = history([100, 100, 102, 101]);
    doubled[3].exercises.push(ex("bench", "Chest", [set(110, 1)]));
    expect(exerciseTrends(doubled)[0]).toMatchObject({ sessions: 4, changePct: 10 });
  });
});

describe("weeksSinceLightWeek", () => {
  it("finds the most recent week under 60% of the 4 weeks before it", () => {
    expect(weeksSinceLightWeek([1000, 1000, 1000, 1000, 500, 1000, 1000])).toBe(2);
    expect(weeksSinceLightWeek([1000, 1000, 1000, 1000, 1000, 1000, 590])).toBe(0);
    expect(weeksSinceLightWeek([1000, 1000, 1000, 1000, 1000, 1000, 600])).toBeNull();
  });

  it("is null without a baseline", () => {
    expect(weeksSinceLightWeek([0, 0, 0, 0, 0, 0, 0])).toBeNull();
    expect(weeksSinceLightWeek([])).toBeNull();
  });
});

describe("deloadSignal", () => {
  const trends = (statuses: TrendStatus[]): ExerciseTrend[] =>
    statuses.map((status, i) => ({ exerciseId: `e${i}`, name: `e${i}`, muscleGroup: null, status, changePct: 0, sessions: 4 }));

  it("fires at 2+ declining exercises that are at least 40% of those scored", () => {
    expect(deloadSignal(trends(["declining", "declining", "plateau", "progressing", "plateau"]), []).signal).toBe(true);
    expect(deloadSignal(trends(["declining", "declining", "plateau", "plateau", "plateau", "plateau"]), []).signal).toBe(false);
    expect(deloadSignal(trends(["declining", "plateau"]), []).signal).toBe(false);
    expect(deloadSignal([], [])).toEqual({ signal: false, declining: 0, scored: 0, weeksSinceLightWeek: null });
  });
});

describe("weeklyTotals", () => {
  it("buckets sessions and volume by week and flags the current week as partial", () => {
    const totals = weeklyTotals(
      [
        session("2026-10-27", [ex("bench", "Chest", [set(100, 5), set(100, 5)])]),
        session("2026-11-03", [ex("bench", "Chest", [set(50, 10)])]),
      ],
      TODAY
    );
    expect(totals).toHaveLength(8);
    expect(totals[6]).toEqual({ weekStart: "2026-10-26", volumeKg: 1000, sessions: 1, partial: false });
    expect(totals[7]).toEqual({ weekStart: "2026-11-02", volumeKg: 500, sessions: 1, partial: true });
  });
});

describe("skippedRoutineExercises", () => {
  it("lists routine exercises missing from at least half of 2+ routine sessions", () => {
    const refs = ["a", "b", "c"].map((id) => ({ routineId: "r1", routineName: "Push", exerciseId: id, exerciseName: id }));
    const lone = { routineId: "r2", routineName: "Pull", exerciseId: "d", exerciseName: "d" };
    const skipped = skippedRoutineExercises(
      [
        session("2026-10-20", [ex("a", "Chest", sets(1)), ex("b", "Chest", sets(1))], "r1"),
        session("2026-10-27", [ex("a", "Chest", sets(1)), ex("c", "Chest", [])], "r1"),
        session("2026-10-28", [], "r2"),
      ],
      [...refs, lone]
    );
    expect(skipped).toEqual([
      { ...refs[1], skipped: 1, sessions: 2 },
      { ...refs[2], skipped: 2, sessions: 2 },
    ]);
  });
});

describe("buildInsights", () => {
  it("needs 2 sessions inside the window", () => {
    const before = session("2026-09-13", [ex("bench", "Chest", sets(1))]);
    const inside = session("2026-10-20", [ex("bench", "Chest", sets(1))]);
    expect(buildInsights([before, inside], [], TODAY).hasEnoughData).toBe(false);
    expect(buildInsights([inside, session("2026-10-21", [])], [], TODAY).hasEnoughData).toBe(true);
  });

  it("averages sessions per week over the 7 complete weeks only", () => {
    const weekly = windowWeeks(TODAY).slice(0, 7).map((w) => session(w, [ex("bench", "Chest", sets(1))]));
    const thisWeek = ["2026-11-02", "2026-11-03", "2026-11-04"].map((d) => session(d, []));
    const insights = buildInsights([...thisWeek, ...weekly], [], TODAY);
    expect(insights.consistency.averagePerWeek).toBe(1);
    expect(insights.consistency.weeks[7]).toMatchObject({ sessions: 3, partial: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/insights/analysis.test.ts`
Expected: FAIL — `Failed to resolve import "./analysis"`.

- [ ] **Step 3: Write the implementation**

Create `lib/insights/analysis.ts`:

```ts
// Rule-based training analysis behind the /insights page: weekly sets per muscle group,
// per-exercise e1RM trends, a deload signal and consistency. Pure and DB-free (runs under
// `npm test`); dates are YYYY-MM-DD strings and nothing reads the local time zone.
import { addDays, getWeekStart } from "@/lib/date";
import { estimateOneRepMax } from "@/lib/pr";
import { MUSCLE_GROUPS, isMuscleGroup, type MuscleGroup } from "@/lib/validation";

export const WINDOW_WEEKS = 8;
const VOLUME_DAYS = 28;
export const LOW_SETS = 10;
export const HIGH_SETS = 20;
const MIN_TREND_SESSIONS = 4;
const RECENT_TREND_SESSIONS = 3;
const DECLINE_PCT = -5;
const DELOAD_MIN_DECLINING = 2;
const DELOAD_MIN_SHARE = 0.4;
const LIGHT_WEEK_RATIO = 0.6;
const LIGHT_WEEK_LOOKBACK = 4;
const SKIP_MIN_SESSIONS = 2;
const SKIP_SHARE = 0.5;
const MIN_SESSIONS = 2;

// Working sets only.
export type AnalysisSet = { weightKg: number; reps: number };
export type AnalysisExercise = { exerciseId: string; name: string; muscleGroup: string | null; sets: AnalysisSet[] };
export type AnalysisSession = { id: string; date: string; routineId: string | null; exercises: AnalysisExercise[] };
export type RoutineExerciseRef = { routineId: string; routineName: string; exerciseId: string; exerciseName: string };

export type VolumeBand = "low" | "optimal" | "high";
export type MuscleVolume = { group: MuscleGroup; setsPerWeek: number; sessionsPerWeek: number; band: VolumeBand };
export type TrendStatus = "progressing" | "plateau" | "declining";
export type ExerciseTrend = {
  exerciseId: string;
  name: string;
  muscleGroup: string | null;
  status: TrendStatus;
  changePct: number;
  sessions: number;
};
export type WeekTotal = { weekStart: string; volumeKg: number; sessions: number; partial: boolean };
export type DeloadSignal = { signal: boolean; declining: number; scored: number; weeksSinceLightWeek: number | null };
export type SkippedExercise = RoutineExerciseRef & { skipped: number; sessions: number };
export type Consistency = { weeks: WeekTotal[]; averagePerWeek: number; skipped: SkippedExercise[] };
export type Insights = {
  hasEnoughData: boolean;
  muscleVolume: MuscleVolume[];
  trends: ExerciseTrend[];
  deload: DeloadSignal;
  consistency: Consistency;
};

// The Monday-start weeks of the analysis window, oldest first; the last is the current week.
export function windowWeeks(todayStr: string): string[] {
  const current = getWeekStart(todayStr);
  return Array.from({ length: WINDOW_WEEKS }, (_, i) => addDays(current, -7 * (WINDOW_WEEKS - 1 - i)));
}

export function volumeBand(setsPerWeek: number): VolumeBand {
  if (setsPerWeek < LOW_SETS) return "low";
  if (setsPerWeek > HIGH_SETS) return "high";
  return "optimal";
}

// Average working sets (and sessions touching the group) per week over the last 28 days.
export function muscleVolume(sessions: AnalysisSession[], todayStr: string): MuscleVolume[] {
  const from = addDays(todayStr, -(VOLUME_DAYS - 1));
  const setCounts = new Map<MuscleGroup, number>();
  const sessionCounts = new Map<MuscleGroup, number>();
  for (const session of sessions) {
    if (session.date < from || session.date > todayStr) continue;
    const trained = new Set<MuscleGroup>();
    for (const exercise of session.exercises) {
      const group = exercise.muscleGroup;
      if (!isMuscleGroup(group) || exercise.sets.length === 0) continue;
      setCounts.set(group, (setCounts.get(group) ?? 0) + exercise.sets.length);
      trained.add(group);
    }
    for (const group of trained) sessionCounts.set(group, (sessionCounts.get(group) ?? 0) + 1);
  }
  const weeks = VOLUME_DAYS / 7;
  return MUSCLE_GROUPS.map((group) => {
    const setsPerWeek = (setCounts.get(group) ?? 0) / weeks;
    return { group, setsPerWeek, sessionsPerWeek: (sessionCounts.get(group) ?? 0) / weeks, band: volumeBand(setsPerWeek) };
  });
}

export function trendStatus(changePct: number): TrendStatus {
  if (changePct > 0) return "progressing";
  if (changePct <= DECLINE_PCT) return "declining";
  return "plateau";
}

// `sessions` oldest first. Best e1RM of the last 3 sessions vs the best before them.
export function exerciseTrends(sessions: AnalysisSession[]): ExerciseTrend[] {
  const byExercise = new Map<string, { name: string; muscleGroup: string | null; bests: number[] }>();
  for (const session of sessions) {
    const bestInSession = new Map<string, number>();
    for (const exercise of session.exercises) {
      if (exercise.sets.length === 0) continue;
      const best = Math.max(...exercise.sets.map((s) => estimateOneRepMax(s.weightKg, s.reps)));
      bestInSession.set(exercise.exerciseId, Math.max(bestInSession.get(exercise.exerciseId) ?? 0, best));
      if (!byExercise.has(exercise.exerciseId)) {
        byExercise.set(exercise.exerciseId, { name: exercise.name, muscleGroup: exercise.muscleGroup, bests: [] });
      }
    }
    for (const [exerciseId, best] of bestInSession) byExercise.get(exerciseId)!.bests.push(best);
  }

  const trends: ExerciseTrend[] = [];
  for (const [exerciseId, { name, muscleGroup, bests }] of byExercise) {
    if (bests.length < MIN_TREND_SESSIONS) continue;
    const earlier = Math.max(...bests.slice(0, -RECENT_TREND_SESSIONS));
    const recent = Math.max(...bests.slice(-RECENT_TREND_SESSIONS));
    if (earlier <= 0) continue;
    const changePct = Math.round(((recent - earlier) / earlier) * 1000) / 10;
    trends.push({ exerciseId, name, muscleGroup, status: trendStatus(changePct), changePct, sessions: bests.length });
  }
  return trends.sort((a, b) => b.changePct - a.changePct);
}

// Sessions and working volume (Σ weight × reps) per window week; the current week is partial.
export function weeklyTotals(sessions: AnalysisSession[], todayStr: string): WeekTotal[] {
  const weeks = windowWeeks(todayStr);
  const current = weeks[weeks.length - 1];
  const totals = weeks.map((weekStart) => ({ weekStart, volumeKg: 0, sessions: 0, partial: weekStart === current }));
  const index = new Map(weeks.map((weekStart, i) => [weekStart, i]));
  for (const session of sessions) {
    if (session.date > todayStr) continue;
    const i = index.get(getWeekStart(session.date));
    if (i === undefined) continue;
    totals[i].sessions += 1;
    for (const exercise of session.exercises) {
      for (const s of exercise.sets) totals[i].volumeKg += s.weightKg * s.reps;
    }
  }
  return totals;
}

// Complete weeks oldest first. A week is light when its volume is under 60% of the mean of
// the (up to 4) weeks before it. Returns how many weeks ago the latest light week was.
export function weeksSinceLightWeek(completeWeekVolumes: number[]): number | null {
  let lastLight = -1;
  for (let i = 1; i < completeWeekVolumes.length; i++) {
    const prior = completeWeekVolumes.slice(Math.max(0, i - LIGHT_WEEK_LOOKBACK), i);
    const mean = prior.reduce((sum, v) => sum + v, 0) / prior.length;
    if (mean > 0 && completeWeekVolumes[i] < LIGHT_WEEK_RATIO * mean) lastLight = i;
  }
  return lastLight === -1 ? null : completeWeekVolumes.length - 1 - lastLight;
}

export function deloadSignal(trends: ExerciseTrend[], completeWeekVolumes: number[]): DeloadSignal {
  const declining = trends.filter((t) => t.status === "declining").length;
  const scored = trends.length;
  return {
    signal: declining >= DELOAD_MIN_DECLINING && declining / scored >= DELOAD_MIN_SHARE,
    declining,
    scored,
    weeksSinceLightWeek: weeksSinceLightWeek(completeWeekVolumes),
  };
}

// Current routine exercises with no logged working set in at least half of that routine's
// sessions (routines with 2+ sessions only).
export function skippedRoutineExercises(
  sessions: AnalysisSession[],
  routineExercises: RoutineExerciseRef[]
): SkippedExercise[] {
  const byRoutine = new Map<string, AnalysisSession[]>();
  for (const session of sessions) {
    if (!session.routineId) continue;
    byRoutine.set(session.routineId, [...(byRoutine.get(session.routineId) ?? []), session]);
  }
  const result: SkippedExercise[] = [];
  for (const ref of routineExercises) {
    const routineSessions = byRoutine.get(ref.routineId) ?? [];
    if (routineSessions.length < SKIP_MIN_SESSIONS) continue;
    const skipped = routineSessions.filter(
      (s) => !s.exercises.some((e) => e.exerciseId === ref.exerciseId && e.sets.length > 0)
    ).length;
    if (skipped / routineSessions.length >= SKIP_SHARE) result.push({ ...ref, skipped, sessions: routineSessions.length });
  }
  return result;
}

export function buildInsights(
  sessions: AnalysisSession[],
  routineExercises: RoutineExerciseRef[],
  todayStr: string
): Insights {
  const start = windowWeeks(todayStr)[0];
  const inWindow = sessions
    .filter((s) => s.date >= start && s.date <= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));
  const weeks = weeklyTotals(inWindow, todayStr);
  const complete = weeks.filter((w) => !w.partial);
  const trends = exerciseTrends(inWindow);
  return {
    hasEnoughData: inWindow.length >= MIN_SESSIONS,
    muscleVolume: muscleVolume(inWindow, todayStr),
    trends,
    deload: deloadSignal(trends, complete.map((w) => w.volumeKg)),
    consistency: {
      weeks,
      averagePerWeek: complete.reduce((sum, w) => sum + w.sessions, 0) / complete.length,
      skipped: skippedRoutineExercises(inWindow, routineExercises),
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/insights/analysis.test.ts && npm test`
Expected: PASS; the full `npm test` now includes both insights files.

- [ ] **Step 5: Commit**

```bash
git add lib/insights/analysis.ts lib/insights/analysis.test.ts package.json
git commit -m "feat(insights): pure analysis (muscle volume, trends, deload, consistency)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Rep range column + routine service

**Files:**
- Create: `prisma/migrations/0004_routine_rep_range/migration.sql`
- Modify: `prisma/schema.prisma` (`model routine_exercises`)
- Modify: `lib/validation.ts` (after `updateRoutineTargetSetsSchema`)
- Modify: `lib/routines/service.ts:168-179` (replace `getRoutineTargetSets`), add `updateRoutineExerciseRepRangeForUser`
- Modify: `app/(app)/log/[sessionId]/page.tsx` (caller of the renamed function)
- Test: `lib/routines/service.test.ts`

**Interfaces:**
- Consumes: `RepRange` from `lib/insights/progression.ts` (Task 1).
- Produces:
  - `getRoutineTargets(db, userId, routineId): Promise<Record<string, { targetSets: number | null; repRange: RepRange | null }>>` — every exercise in the routine, keyed by exercise_id.
  - `updateRoutineExerciseRepRangeForUser(db, userId, routineExerciseId, input: unknown): Promise<void>` — input `{ repRange: RepRange | null }`.
  - `updateRoutineRepRangeSchema` in `lib/validation.ts`.
  - Prisma fields `routine_exercises.target_reps_min: number | null`, `target_reps_max: number | null`.

- [ ] **Step 1: Write the migration**

Create `prisma/migrations/0004_routine_rep_range/migration.sql`:

```sql
-- Optional rep range per routine exercise, used for the next-session target (double
-- progression). Additive only: old deployments ignore the nullable columns. Min and max are
-- set and cleared together.
ALTER TABLE public.routine_exercises
    ADD COLUMN target_reps_min integer,
    ADD COLUMN target_reps_max integer,
    ADD CONSTRAINT routine_exercises_rep_range_check CHECK (
        (target_reps_min IS NULL AND target_reps_max IS NULL)
        OR (target_reps_min BETWEEN 1 AND 50 AND target_reps_max BETWEEN target_reps_min AND 50)
    );
```

- [ ] **Step 2: Apply it locally and add the fields to the Prisma schema**

Run: `npm run db:migrate`
Expected: `Applying migration 0004_routine_rep_range` … `All migrations have been successfully applied.`

In `prisma/schema.prisma`, `model routine_exercises`, add after `target_sets Int?`:

```prisma
  target_reps_min Int?
  target_reps_max Int?
```

Run: `npx prisma generate`
Then verify only the known drift remains: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
Expected: output contains the known-drift statements (FK drops, `exercises_user_name_key`) but **no** `routine_exercises` `ADD COLUMN`/`DROP COLUMN` for the rep range columns.

- [ ] **Step 3: Write the failing tests**

In `lib/routines/service.test.ts`, change the import of `getRoutineTargetSets` to `getRoutineTargets` and add `updateRoutineExerciseRepRangeForUser`. Replace the body of `"sets and clears target sets, and exposes them by exercise id"` and the last `expect(await getRoutineTargetSets(...))` in the attacker test, and add two tests:

```ts
  it("sets and clears target sets, and exposes them by exercise id", async () => {
    const { userId } = await createTestUser();
    const preset = await prisma.exercises.findFirstOrThrow({ where: { is_preset: true } });
    const routine = await createRoutineForUser(prisma, userId, { name: "Targets" });
    const entry = await addExerciseToRoutineForUser(prisma, userId, {
      routineId: routine.id,
      exerciseId: preset.id,
    });

    await updateRoutineExerciseTargetSetsForUser(prisma, userId, entry.id, { targetSets: 4 });
    expect(await getRoutineTargets(prisma, userId, routine.id)).toEqual({
      [preset.id]: { targetSets: 4, repRange: null },
    });

    await updateRoutineExerciseTargetSetsForUser(prisma, userId, entry.id, { targetSets: null });
    expect(await getRoutineTargets(prisma, userId, routine.id)).toEqual({
      [preset.id]: { targetSets: null, repRange: null },
    });
  });

  it("sets, clears and validates a rep range", async () => {
    const { userId } = await createTestUser();
    const preset = await prisma.exercises.findFirstOrThrow({ where: { is_preset: true } });
    const routine = await createRoutineForUser(prisma, userId, { name: "Rep ranges" });
    const entry = await addExerciseToRoutineForUser(prisma, userId, {
      routineId: routine.id,
      exerciseId: preset.id,
    });

    await updateRoutineExerciseRepRangeForUser(prisma, userId, entry.id, { repRange: { min: 5, max: 8 } });
    expect((await getRoutineTargets(prisma, userId, routine.id))[preset.id].repRange).toEqual({ min: 5, max: 8 });

    await expect(
      updateRoutineExerciseRepRangeForUser(prisma, userId, entry.id, { repRange: { min: 9, max: 6 } })
    ).rejects.toThrow();
    await expect(
      updateRoutineExerciseRepRangeForUser(prisma, userId, entry.id, { repRange: { min: 0, max: 6 } })
    ).rejects.toThrow();

    await updateRoutineExerciseRepRangeForUser(prisma, userId, entry.id, { repRange: null });
    expect((await getRoutineTargets(prisma, userId, routine.id))[preset.id].repRange).toBeNull();
  });

  it("enforces min and max together in the database", async () => {
    const { userId } = await createTestUser();
    const preset = await prisma.exercises.findFirstOrThrow({ where: { is_preset: true } });
    const routine = await createRoutineForUser(prisma, userId, { name: "Check" });
    const entry = await addExerciseToRoutineForUser(prisma, userId, {
      routineId: routine.id,
      exerciseId: preset.id,
    });
    await expect(
      prisma.routine_exercises.update({ where: { id: entry.id }, data: { target_reps_min: 5 } })
    ).rejects.toThrow();
  });
```

In the attacker test, replace `expect(await getRoutineTargetSets(prisma, attacker.userId, routine.id)).toEqual({});` with:

```ts
    await expect(
      updateRoutineExerciseRepRangeForUser(prisma, attacker.userId, entry.id, { repRange: { min: 5, max: 8 } })
    ).rejects.toThrow();
    const after = await prisma.routine_exercises.findUniqueOrThrow({ where: { id: entry.id } });
    expect(after.target_reps_min).toBeNull();
    expect(await getRoutineTargets(prisma, attacker.userId, routine.id)).toEqual({});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `DOTENV_CONFIG_PATH=.env.local npx vitest run --config vitest.db.config.ts lib/routines/service.test.ts`
Expected: FAIL — `getRoutineTargets` / `updateRoutineExerciseRepRangeForUser` is not exported.

- [ ] **Step 5: Implement**

In `lib/validation.ts`, after `updateRoutineTargetSetsSchema`:

```ts
export const updateRoutineRepRangeSchema = z.object({
  repRange: z
    .object({ min: z.number().int().min(1).max(50), max: z.number().int().min(1).max(50) })
    .refine((range) => range.min <= range.max)
    .nullable(),
});
```

In `lib/routines/service.ts`, add `updateRoutineRepRangeSchema` to the `@/lib/validation` import, add `import type { RepRange } from "@/lib/insights/progression";`, and replace `getRoutineTargetSets` (the comment and function at the end of the file) with:

```ts
// Rep range for one exercise in a routine (null clears it): drives the next-session target
// while logging a session started from the routine.
export async function updateRoutineExerciseRepRangeForUser(
  db: PrismaClient,
  userId: string,
  routineExerciseId: string,
  input: unknown
): Promise<void> {
  const { repRange } = updateRoutineRepRangeSchema.parse(input);
  const result = await db.routine_exercises.updateMany({
    where: { id: routineExerciseId, user_id: userId },
    data: { target_reps_min: repRange?.min ?? null, target_reps_max: repRange?.max ?? null },
  });
  if (result.count === 0) throw new Error("Routine exercise not found or not owned by user");
}

export type RoutineTarget = { targetSets: number | null; repRange: RepRange | null };

// Planned sets and rep range keyed by exercise_id, for a session started from `routineId`.
export async function getRoutineTargets(
  db: PrismaClient,
  userId: string,
  routineId: string
): Promise<Record<string, RoutineTarget>> {
  const rows = await db.routine_exercises.findMany({
    where: { routine_id: routineId, user_id: userId },
    select: { exercise_id: true, target_sets: true, target_reps_min: true, target_reps_max: true },
  });
  return Object.fromEntries(
    rows.map((row) => [
      row.exercise_id,
      {
        targetSets: row.target_sets,
        repRange:
          row.target_reps_min !== null && row.target_reps_max !== null
            ? { min: row.target_reps_min, max: row.target_reps_max }
            : null,
      },
    ])
  );
}
```

In `app/(app)/log/[sessionId]/page.tsx`: import `getRoutineTargets` instead of `getRoutineTargetSets`; rename the destructured `targetSets` to `routineTargets`; use `getRoutineTargets(prisma, userId, session.routine_id)` with fallback `Promise.resolve({} as Record<string, RoutineTarget>)` (import `type RoutineTarget` from `@/lib/routines/service`); and set `targetSets: routineTargets[se.exercise_id]?.targetSets ?? null`.

- [ ] **Step 6: Run tests and typecheck**

Run: `DOTENV_CONFIG_PATH=.env.local npx vitest run --config vitest.db.config.ts lib/routines/service.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add prisma/migrations/0004_routine_rep_range prisma/schema.prisma lib/validation.ts lib/routines/service.ts lib/routines/service.test.ts "app/(app)/log/[sessionId]/page.tsx"
git commit -m "feat(routines): optional rep range per routine exercise

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Recent session sets (last 2 sessions)

**Files:**
- Modify: `lib/sessions/service.ts:247-290` (replace `getLastSessionSets`)
- Modify: `lib/actions/sessions.ts` (`addExerciseToSession`)
- Modify: `app/(app)/log/[sessionId]/page.tsx`
- Test: `lib/sessions/service.test.ts:545-580`

**Interfaces:**
- Produces: `getRecentSessionSets(db, userId, exerciseIds: string[], excludeSessionId: string, limit = 2): Promise<Record<string, LastSession[]>>` — newest first.
- `addExerciseToSession` action returns `{ ...sessionExercise, pr, lastSession: LastSession | null, recentSessions: LastSession[] }`.

- [ ] **Step 1: Write the failing tests**

In `lib/sessions/service.test.ts` replace `getLastSessionSets` in the import list with `getRecentSessionSets`, and replace the whole `describe("getLastSessionSets", …)` block with:

```ts
describe("getRecentSessionSets", () => {
  it("returns the latest completed sessions newest first, skipping the current and unfinished ones", async () => {
    const { userId } = await createTestUser();
    const exercise = await createCustomExerciseForUser(prisma, userId, {
      name: uniqueExerciseName("Recent Session Exercise"),
      muscleGroup: "Back",
    });
    await seedSession(userId, exercise.id, "2026-02-20", [{ weightKg: 40, reps: 10 }]);
    await seedSession(userId, exercise.id, "2026-03-01", [{ weightKg: 50, reps: 10 }]);
    await seedSession(userId, exercise.id, "2026-03-08", [
      { weightKg: 30, reps: 10, isWarmup: true },
      { weightKg: 60, reps: 8 },
    ]);
    await seedSession(userId, exercise.id, "2026-03-10", [{ weightKg: 99, reps: 1 }], false);
    const current = await seedSession(userId, exercise.id, "2026-03-15", [{ weightKg: 70, reps: 5 }], false);

    const result = await getRecentSessionSets(prisma, userId, [exercise.id], current.id);
    expect(result[exercise.id]).toEqual([
      {
        sessionDate: "2026-03-08",
        sets: [
          { weight_kg: 30, reps: 10, is_warmup: true },
          { weight_kg: 60, reps: 8, is_warmup: false },
        ],
      },
      { sessionDate: "2026-03-01", sets: [{ weight_kg: 50, reps: 10, is_warmup: false }] },
    ]);

    const one = await getRecentSessionSets(prisma, userId, [exercise.id], current.id, 1);
    expect(one[exercise.id].map((s) => s.sessionDate)).toEqual(["2026-03-08"]);
  });

  it("never returns another user's sets", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const presets = await prisma.exercises.findMany({ where: { is_preset: true }, select: { id: true }, take: 1 });
    const presetId = presets[0].id;
    const ownerSession = await seedSession(owner.userId, presetId, "2026-03-01", [{ weightKg: 80, reps: 5 }]);

    const result = await getRecentSessionSets(prisma, other.userId, [presetId], ownerSession.id);
    expect(result).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `DOTENV_CONFIG_PATH=.env.local npx vitest run --config vitest.db.config.ts lib/sessions/service.test.ts -t getRecentSessionSets`
Expected: FAIL — `getRecentSessionSets is not a function`.

- [ ] **Step 3: Implement**

In `lib/sessions/service.ts` replace the comment block and function `getLastSessionSets` with:

```ts
// For each exercise, the sets the user logged in their most recent *completed* sessions that
// included it, newest first (excluding `excludeSessionId`, i.e. the session being logged right
// now). The first powers the "Last" hint; the first two drive the next-session target.
export async function getRecentSessionSets(
  db: PrismaClient,
  userId: string,
  exerciseIds: string[],
  excludeSessionId: string,
  limit = 2
): Promise<Record<string, LastSession[]>> {
  if (exerciseIds.length === 0) return {};
  // Ranked per exercise: latest by session date, then by completion time for two sessions on
  // the same day.
  const recent = await db.$queryRaw<{ id: string; exercise_id: string; session_date: Date }[]>(Prisma.sql`
    select id, exercise_id, session_date from (
      select se.id::text as id, se.exercise_id::text as exercise_id, s.session_date,
        row_number() over (
          partition by se.exercise_id order by s.session_date desc, s.completed_at desc
        ) as rn
      from session_exercises se
      join sessions s on s.id = se.session_id
      where se.user_id::text = ${userId}
        and s.user_id::text = ${userId}
        and se.exercise_id::text in (${Prisma.join(exerciseIds)})
        and s.completed_at is not null
        and s.id::text <> ${excludeSessionId}
    ) ranked
    where rn <= ${limit}
    order by exercise_id, rn`);
  if (recent.length === 0) return {};

  const sets = await db.sets.findMany({
    where: { user_id: userId, session_exercise_id: { in: recent.map((row) => row.id) } },
    orderBy: { set_number: "asc" },
    select: { session_exercise_id: true, weight_kg: true, reps: true, is_warmup: true },
  });

  const result: Record<string, LastSession[]> = {};
  for (const row of recent) {
    (result[row.exercise_id] ??= []).push({
      sessionDate: toDateOnlyString(row.session_date),
      sets: sets
        .filter((set) => set.session_exercise_id === row.id)
        .map((set) => ({ weight_kg: Number(set.weight_kg), reps: set.reps, is_warmup: set.is_warmup })),
    });
  }
  return result;
}
```

In `lib/actions/sessions.ts`, import `getRecentSessionSets` instead of `getLastSessionSets` and change `addExerciseToSession` to:

```ts
export async function addExerciseToSession(sessionId: string, exerciseId: string) {
  const userId = await requireUserId();
  const sessionExercise = await addExerciseToSessionForUser(prisma, userId, sessionId, exerciseId);
  const [pr, recent] = await Promise.all([
    getPriorPr(prisma, userId, exerciseId),
    getRecentSessionSets(prisma, userId, [exerciseId], sessionId),
  ]);
  const recentSessions = recent[exerciseId] ?? [];
  return { ...sessionExercise, pr, lastSession: recentSessions[0] ?? null, recentSessions };
}
```

In `app/(app)/log/[sessionId]/page.tsx`, import `getRecentSessionSets` instead of `getLastSessionSets`, call `getRecentSessionSets(prisma, userId, exerciseIds, sessionId)` as `recentSessions`, and inside the map use `const ls = recentSessions[se.exercise_id]?.[0];`.

- [ ] **Step 4: Run tests and typecheck**

Run: `DOTENV_CONFIG_PATH=.env.local npx vitest run --config vitest.db.config.ts lib/sessions/service.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/sessions/service.ts lib/sessions/service.test.ts lib/actions/sessions.ts "app/(app)/log/[sessionId]/page.tsx"
git commit -m "feat(sessions): load the last two sessions per exercise

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Insights DB service

**Files:**
- Create: `lib/insights/service.ts`
- Test: `lib/insights/service.test.ts` (DB suite — do **not** add to `npm test`)

**Interfaces:**
- Consumes: `buildInsights`, `windowWeeks`, `AnalysisSession`, `RoutineExerciseRef`, `Insights` (Task 2); `toDateOnlyString` (`lib/date.ts`).
- Produces: `getInsights(db: PrismaClient, userId: string, todayStr: string): Promise<Insights>`.

- [ ] **Step 1: Write the failing test**

Create `lib/insights/service.test.ts`:

```ts
import "dotenv/config";
import { describe, it, expect } from "vitest";
import { createTestUser } from "@/lib/test-helpers";
import { prisma } from "@/lib/db";
import { createCustomExerciseForUser } from "@/lib/exercises/service";
import { addExerciseToRoutineForUser, createRoutineForUser } from "@/lib/routines/service";
import {
  addExerciseToSessionForUser,
  finishSessionForUser,
  logSetForUser,
  removeExerciseFromSessionForUser,
  startSessionForUser,
} from "@/lib/sessions/service";
import { getInsights } from "./service";

const TODAY = "2026-11-04"; // window starts 2026-09-14, 28-day volume from 2026-10-08

const uniqueName = (label: string) => `${label} ${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function seed(
  userId: string,
  exerciseId: string,
  date: string,
  sets: { weightKg: number; reps: number; isWarmup?: boolean }[],
  finish = true
) {
  const session = await startSessionForUser(prisma, userId, { sessionDate: date });
  const se = await addExerciseToSessionForUser(prisma, userId, session.id, exerciseId);
  for (const s of sets) {
    await logSetForUser(prisma, userId, {
      sessionExerciseId: se.id,
      weightKg: s.weightKg,
      reps: s.reps,
      isWarmup: s.isWarmup ?? false,
    });
  }
  if (finish) await finishSessionForUser(prisma, userId, session.id);
}

describe("getInsights", () => {
  it("analyses completed sessions inside the window only, working sets only", async () => {
    const { userId } = await createTestUser();
    const bench = await createCustomExerciseForUser(prisma, userId, { name: uniqueName("Bench"), muscleGroup: "Chest" });
    await seed(userId, bench.id, "2026-09-01", [{ weightKg: 60, reps: 10 }]); // before the window
    await seed(userId, bench.id, "2026-10-20", [
      { weightKg: 30, reps: 10, isWarmup: true },
      { weightKg: 60, reps: 10 },
      { weightKg: 60, reps: 10 },
    ]);
    await seed(userId, bench.id, "2026-10-27", [{ weightKg: 60, reps: 10 }, { weightKg: 60, reps: 10 }]);
    await seed(userId, bench.id, "2026-11-03", [{ weightKg: 99, reps: 1 }], false); // unfinished

    const insights = await getInsights(prisma, userId, TODAY);
    expect(insights.hasEnoughData).toBe(true);
    expect(insights.consistency.weeks.reduce((n, w) => n + w.sessions, 0)).toBe(2);
    expect(insights.muscleVolume.find((v) => v.group === "Chest")?.setsPerWeek).toBe(1);
    expect(insights.consistency.weeks.find((w) => w.weekStart === "2026-10-19")?.volumeKg).toBe(1200);
  });

  it("flags routine exercises the user keeps skipping", async () => {
    const { userId } = await createTestUser();
    const a = await createCustomExerciseForUser(prisma, userId, { name: uniqueName("A"), muscleGroup: "Back" });
    const b = await createCustomExerciseForUser(prisma, userId, { name: uniqueName("B"), muscleGroup: "Back" });
    const routine = await createRoutineForUser(prisma, userId, { name: "Pull" });
    await addExerciseToRoutineForUser(prisma, userId, { routineId: routine.id, exerciseId: a.id });
    await addExerciseToRoutineForUser(prisma, userId, { routineId: routine.id, exerciseId: b.id });

    for (const date of ["2026-10-20", "2026-10-27"]) {
      const session = await startSessionForUser(prisma, userId, { routineId: routine.id, sessionDate: date });
      const entries = await prisma.session_exercises.findMany({ where: { session_id: session.id } });
      const entryA = entries.find((e) => e.exercise_id === a.id)!;
      const entryB = entries.find((e) => e.exercise_id === b.id)!;
      await logSetForUser(prisma, userId, { sessionExerciseId: entryA.id, weightKg: 50, reps: 10, isWarmup: false });
      await removeExerciseFromSessionForUser(prisma, userId, entryB.id);
      await finishSessionForUser(prisma, userId, session.id);
    }

    const insights = await getInsights(prisma, userId, TODAY);
    expect(insights.consistency.skipped).toEqual([
      { routineId: routine.id, routineName: "Pull", exerciseId: b.id, exerciseName: b.name, skipped: 2, sessions: 2 },
    ]);
  });

  it("never includes another user's training", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const bench = await createCustomExerciseForUser(prisma, owner.userId, { name: uniqueName("Bench"), muscleGroup: "Chest" });
    await seed(owner.userId, bench.id, "2026-10-20", [{ weightKg: 60, reps: 10 }]);
    await seed(owner.userId, bench.id, "2026-10-27", [{ weightKg: 60, reps: 10 }]);

    const insights = await getInsights(prisma, other.userId, TODAY);
    expect(insights.hasEnoughData).toBe(false);
    expect(insights.consistency.weeks.every((w) => w.sessions === 0)).toBe(true);
    expect(insights.trends).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DOTENV_CONFIG_PATH=.env.local npx vitest run --config vitest.db.config.ts lib/insights/service.test.ts`
Expected: FAIL — `Failed to resolve import "./service"`.

- [ ] **Step 3: Implement**

Create `lib/insights/service.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { toDateOnlyString } from "@/lib/date";
import {
  buildInsights,
  windowWeeks,
  type AnalysisSession,
  type Insights,
  type RoutineExerciseRef,
} from "./analysis";

// Everything the /insights page and the dashboard card show: the window's completed sessions
// (working sets only) plus the current exercises of the routines used in it, analysed by the
// pure rules in ./analysis.
export async function getInsights(db: PrismaClient, userId: string, todayStr: string): Promise<Insights> {
  const rows = await db.sessions.findMany({
    where: {
      user_id: userId,
      completed_at: { not: null },
      session_date: { gte: new Date(windowWeeks(todayStr)[0]), lte: new Date(todayStr) },
    },
    orderBy: [{ session_date: "asc" }, { completed_at: "asc" }],
    select: {
      id: true,
      session_date: true,
      routine_id: true,
      session_exercises: {
        where: { user_id: userId },
        orderBy: { position: "asc" },
        select: {
          exercise_id: true,
          exercises: { select: { name: true, muscle_group: true } },
          sets: { where: { user_id: userId, is_warmup: false }, select: { weight_kg: true, reps: true } },
        },
      },
    },
  });

  const sessions: AnalysisSession[] = rows.map((row) => ({
    id: row.id,
    date: toDateOnlyString(row.session_date),
    routineId: row.routine_id,
    exercises: row.session_exercises.map((se) => ({
      exerciseId: se.exercise_id,
      name: se.exercises.name,
      muscleGroup: se.exercises.muscle_group,
      sets: se.sets.map((s) => ({ weightKg: Number(s.weight_kg), reps: s.reps })),
    })),
  }));

  const routineIds = [...new Set(rows.flatMap((row) => (row.routine_id ? [row.routine_id] : [])))];
  const routineRows =
    routineIds.length === 0
      ? []
      : await db.routine_exercises.findMany({
          where: { user_id: userId, routine_id: { in: routineIds } },
          orderBy: [{ routine_id: "asc" }, { position: "asc" }],
          select: {
            routine_id: true,
            exercise_id: true,
            exercises: { select: { name: true } },
            routines: { select: { name: true } },
          },
        });
  const routineExercises: RoutineExerciseRef[] = routineRows.map((row) => ({
    routineId: row.routine_id,
    routineName: row.routines.name,
    exerciseId: row.exercise_id,
    exerciseName: row.exercises.name,
  }));

  return buildInsights(sessions, routineExercises, todayStr);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `DOTENV_CONFIG_PATH=.env.local npx vitest run --config vitest.db.config.ts lib/insights/service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/insights/service.ts lib/insights/service.test.ts
git commit -m "feat(insights): DB service feeding the analysis rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Next-session target on the logging screen

**Files:**
- Modify: `app/(app)/log/[sessionId]/types.ts`, `page.tsx`, `ExerciseCard.tsx`, `LoggingClient.tsx:250-266`
- Modify: `messages/en.json`, `messages/th.json` (`log` namespace)

**Interfaces:**
- Consumes: `nextTarget`, `stepFor`, `DEFAULT_REP_RANGE`, `NextTarget`, `RepRange` (Task 1); `getRoutineTargets` (Task 3); `getRecentSessionSets`, action `recentSessions` (Task 4).
- Produces: `ExerciseEntry.target: NextTarget | null`, `ExerciseEntry.repRange: RepRange`.

No component test harness exists — verify in the browser (Step 6).

- [ ] **Step 1: Add the messages**

In `messages/en.json` → `"log"` add:

```json
    "target": "Target {weight} kg × {reps}",
    "targetReason": {
      "addReps": "add a rep",
      "addWeight": "hit {max} on every set → add weight",
      "reset": "below {min} twice → lighter weight",
      "repsOnly": "add a rep"
    },
```

In `messages/th.json` → `"log"` add:

```json
    "target": "เป้า {weight} kg × {reps}",
    "targetReason": {
      "addReps": "เพิ่มอีก 1 ครั้ง",
      "addWeight": "ครบ {max} ทุกเซ็ต → เพิ่มน้ำหนัก",
      "reset": "ต่ำกว่า {min} สองครั้งติด → ลดน้ำหนัก",
      "repsOnly": "เพิ่มอีก 1 ครั้ง"
    },
```

- [ ] **Step 2: Extend the entry type**

In `app/(app)/log/[sessionId]/types.ts` add `import type { NextTarget, RepRange } from "@/lib/insights/progression";` and append to `ExerciseEntry`:

```ts
  // Next-session target from the last two sessions (lib/insights/progression); null without history.
  target: NextTarget | null;
  // The routine's rep range for this exercise, else DEFAULT_REP_RANGE.
  repRange: RepRange;
```

- [ ] **Step 3: Compute the target on the server**

In `app/(app)/log/[sessionId]/page.tsx`:
- Change the `exercises` include in the `session_exercises` query to `exercises: { select: { id: true, name: true, muscle_group: true } }`.
- Add `import { DEFAULT_REP_RANGE, nextTarget, stepFor } from "@/lib/insights/progression";`.
- Replace the body of `sessionExercises.map((se) => { … })` with:

```tsx
  const exercises = sessionExercises.map((se) => {
    const recent = recentSessions[se.exercise_id] ?? [];
    const ls = recent[0];
    const routineTarget = routineTargets[se.exercise_id];
    const repRange = routineTarget?.repRange ?? DEFAULT_REP_RANGE;
    return {
      sessionExerciseId: se.id,
      exerciseId: se.exercise_id,
      exerciseName: se.exercises.name,
      sets: [...se.sets]
        .sort((a, b) => a.set_number - b.set_number)
        .map((s) => ({ ...s, weight_kg: Number(s.weight_kg) })),
      pr: prMap[se.exercise_id] ?? null,
      // Formatted on the server: Node and the browser disagree on Thai short weekdays (hydration).
      lastSession: ls ? { ...ls, dateLabel: formatShortDate(ls.sessionDate, locale) } : null,
      targetSets: routineTarget?.targetSets ?? null,
      target: nextTarget(recent, repRange, stepFor(se.exercises.muscle_group)),
      repRange,
    };
  });
```

- [ ] **Step 4: Exercises added mid-session**

In `app/(app)/log/[sessionId]/LoggingClient.tsx` add `import { DEFAULT_REP_RANGE, nextTarget, stepFor } from "@/lib/insights/progression";` and in `handleAddExercise` extend the new entry (exercises added mid-session always use the default range):

```tsx
        lastSession: added.lastSession,
        targetSets: null,
        target: nextTarget(added.recentSessions, DEFAULT_REP_RANGE, stepFor(exercise.muscleGroup)),
        repRange: DEFAULT_REP_RANGE,
```

- [ ] **Step 5: Show the target and prefill from it**

In `app/(app)/log/[sessionId]/ExerciseCard.tsx`:
- Add `Target` to the `@phosphor-icons/react/ssr` import.
- Replace `initialInput` with:

```tsx
// Starting values for the "add set" form: repeat the last set logged today, else the
// next-session target, else the first working set from last time, else blank.
function initialInput(exercise: ExerciseEntry): SetFormInput {
  const lastSet = exercise.sets[exercise.sets.length - 1];
  if (lastSet)
    return { weight: String(lastSet.weight_kg), reps: String(lastSet.reps), warmup: false };
  if (exercise.target)
    return { weight: String(exercise.target.weightKg), reps: String(exercise.target.reps), warmup: false };
  const prefill = prefillFromLast(exercise.lastSession);
  return prefill ? { ...prefill, warmup: false } : { weight: "", reps: "", warmup: false };
}
```

- Add below `LastTimeHint`:

```tsx
function TargetHint({ exercise }: { exercise: ExerciseEntry }) {
  const t = useTranslations("log");
  const { target, repRange } = exercise;
  if (!target) return null;
  const reason = {
    addReps: t("targetReason.addReps"),
    addWeight: t("targetReason.addWeight", { max: repRange.max }),
    reset: t("targetReason.reset", { min: repRange.min }),
    repsOnly: t("targetReason.repsOnly"),
  }[target.reason];
  return (
    <p className="mt-0.5 flex items-center gap-1 text-xs text-accent">
      <Target className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        {t("target", { weight: target.weightKg, reps: target.reps })} · {reason}
      </span>
    </p>
  );
}
```

- In the expanded card render `<TargetHint exercise={exercise} />` directly after `<LastTimeHint exercise={exercise} />`.

- [ ] **Step 6: Typecheck, lint, and verify in the browser**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean; `i18n/messages.test.ts` passes (same keys and ICU args in th/en).

Restart `next dev` (messages changed), then in the preview (signed in): start a freeform workout with an exercise that has a completed session where every working set was ≥ 12 reps → the card shows "Target {weight + step} kg × 8 · …add weight" and the weight/reps inputs are prefilled with it. An exercise with no history shows no target line and blank/last-time prefill as before. Add an exercise from the picker → its target appears without reload. Check th and en.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/log/[sessionId]" messages/en.json messages/th.json
git commit -m "feat(log): show and prefill the next-session target

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Rep range control on the routine page

**Files:**
- Modify: `lib/actions/routines.ts`
- Modify: `app/(app)/routines/[routineId]/RoutineExerciseRow.tsx`, `app/(app)/routines/[routineId]/page.tsx`
- Modify: `messages/en.json`, `messages/th.json` (`routines`, `errors`)

**Interfaces:**
- Consumes: `updateRoutineExerciseRepRangeForUser` (Task 3); `REP_RANGE_PRESETS`, `DEFAULT_REP_RANGE`, `repRangeValue`, `parseRepRange`, `RepRange` (Task 1).
- Produces: action `updateRoutineExerciseRepRange(routineExerciseId: string, routineId: string, repRange: RepRange | null): Promise<void>`; `RoutineExerciseRow` prop `repRange: RepRange | null`.

- [ ] **Step 1: Add the messages**

`messages/en.json` → `"routines"`:

```json
    "repRange": "Rep range",
    "repRangeDefault": "Default ({min}–{max} reps)",
    "repRangeOption": "{min}–{max} reps",
```

`messages/en.json` → `"errors"`: `"updateRepRange": "Failed to update rep range",`

`messages/th.json` → `"routines"`:

```json
    "repRange": "ช่วงจำนวนครั้ง",
    "repRangeDefault": "ค่าเริ่มต้น ({min}–{max} ครั้ง)",
    "repRangeOption": "{min}–{max} ครั้ง",
```

`messages/th.json` → `"errors"`: `"updateRepRange": "อัปเดตช่วงจำนวนครั้งไม่สำเร็จ",`

- [ ] **Step 2: Add the action**

In `lib/actions/routines.ts` add `updateRoutineExerciseRepRangeForUser` to the service import, `import type { RepRange } from "@/lib/insights/progression";`, and:

```ts
export async function updateRoutineExerciseRepRange(
  routineExerciseId: string,
  routineId: string,
  repRange: RepRange | null
) {
  const userId = await requireUserId();
  await updateRoutineExerciseRepRangeForUser(prisma, userId, routineExerciseId, { repRange });
  revalidatePath(`/routines/${routineId}`);
}
```

- [ ] **Step 3: Add the control**

In `app/(app)/routines/[routineId]/RoutineExerciseRow.tsx`:
- Import `updateRoutineExerciseRepRange` from `@/lib/actions/routines`, `Select` from `@/components/ui/Select`, and `{ DEFAULT_REP_RANGE, REP_RANGE_PRESETS, parseRepRange, repRangeValue, type RepRange }` from `@/lib/insights/progression`.
- `type PendingAction = "up" | "down" | "remove" | "target" | "repRange" | null;`
- Add prop `repRange: RepRange | null` (destructure as `repRange: initialRepRange`).
- In `run`, widen `fallbackKey` to `"moveExercise" | "removeExercise" | "updateTargetSets" | "updateRepRange"`.
- After `const [target, setTarget] = useState(targetSets);` add:

```tsx
  const [repRange, setRepRange] = useState(initialRepRange);
  // Presets, plus the stored range if it isn't one of them.
  const rangeOptions =
    repRange && !REP_RANGE_PRESETS.some((r) => repRangeValue(r) === repRangeValue(repRange))
      ? [...REP_RANGE_PRESETS, repRange]
      : REP_RANGE_PRESETS;

  async function changeRepRange(value: string) {
    const previous = repRange;
    const next = parseRepRange(value);
    setRepRange(next);
    const ok = await run(
      "repRange",
      () => updateRoutineExerciseRepRange(routineExerciseId, routineId, next),
      "updateRepRange"
    );
    if (!ok) setRepRange(previous);
  }
```

- Change `const busy = pending !== null && pending !== "target";` to `const busy = pending !== null && pending !== "target" && pending !== "repRange";`
- After the target-sets `<div className="mt-2 flex …">…</div>` block, add:

```tsx
      <div className="mt-2 border-t border-border pt-2">
        <Select
          label={t("repRange")}
          value={repRangeValue(repRange)}
          disabled={pending === "repRange"}
          onChange={(e) => changeRepRange(e.target.value)}
        >
          <option value="">
            {t("repRangeDefault", { min: DEFAULT_REP_RANGE.min, max: DEFAULT_REP_RANGE.max })}
          </option>
          {rangeOptions.map((range) => (
            <option key={repRangeValue(range)} value={repRangeValue(range)}>
              {t("repRangeOption", { min: range.min, max: range.max })}
            </option>
          ))}
        </Select>
      </div>
```

- In `app/(app)/routines/[routineId]/page.tsx`, pass to `RoutineExerciseRow`:

```tsx
              repRange={
                entry.target_reps_min !== null && entry.target_reps_max !== null
                  ? { min: entry.target_reps_min, max: entry.target_reps_max }
                  : null
              }
```

- [ ] **Step 4: Typecheck, lint, verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

Restart `next dev`. In the preview: open a routine, set an exercise to "5–8 reps", reload → it persists; set "Default" → cleared. Start the routine with that exercise after a completed session at 8 reps on every set → the log card shows "…add weight" with reps 5. Check phone width (375px) and both languages.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/routines.ts "app/(app)/routines/[routineId]" messages/en.json messages/th.json
git commit -m "feat(routines): pick a rep range per routine exercise

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `/insights` page

**Files:**
- Create: `app/(app)/insights/page.tsx`, `loading.tsx`, `DeloadBanner.tsx`, `MuscleVolumeCard.tsx`, `TrendsCard.tsx`, `ConsistencyCard.tsx`
- Modify: `messages/en.json`, `messages/th.json` (new `insights` namespace)

**Interfaces:**
- Consumes: `getInsights` (Task 5); `LOW_SETS`, `HIGH_SETS`, types `Insights`, `MuscleVolume`, `VolumeBand`, `ExerciseTrend`, `TrendStatus`, `Consistency`, `DeloadSignal` (Task 2); `formatShortDate` (`lib/sessions/summary.ts`); `muscleLabel`, `muscleStyle` (`components/ui/muscle.ts`).
- Produces: route `/insights` (authenticated by default — not in `PUBLIC_ROUTES`).

The cards are sync server components (no `"use client"`) using `useTranslations`/`useFormatter`, like `app/(app)/dashboard/BodyCard.tsx`. Dates are formatted in `page.tsx` on the server.

- [ ] **Step 1: Add the `insights` namespace**

`messages/en.json` (new top-level key, after `"body"`):

```json
  "insights": {
    "title": "Insights",
    "windowNote": "Based on your last 8 weeks",
    "emptyTitle": "Not enough training yet",
    "emptyDescription": "Finish at least two workouts in the last 8 weeks to see your analysis.",
    "deloadTitle": "Time for a lighter week?",
    "deloadDescription": "{declining} of {scored} tracked exercises are trending down. A week at about half your usual sets can help you recover.",
    "deloadSinceLight": "{weeks, plural, =0 {Last week was a light week.} one {Last light week: # week ago.} other {Last light week: # weeks ago.}}",
    "deloadNoLightWeek": "No light week in the last 8 weeks.",
    "volumeTitle": "Weekly sets per muscle group",
    "volumeHint": "Average working sets over the last 4 weeks. Aim for {low}–{high}.",
    "setsPerWeek": "{sets} sets/wk",
    "sessionsPerWeek": "{count} sessions/wk",
    "band": { "low": "Low", "optimal": "On target", "high": "High" },
    "trendsTitle": "Exercise trends",
    "trendsHint": "Best estimated 1RM of your last 3 sessions vs before.",
    "trendsEmpty": "Log an exercise 4+ times in 8 weeks to see its trend.",
    "status": { "progressing": "Progressing", "plateau": "Plateau", "declining": "Declining" },
    "tip": {
      "progressing": "Keep going — follow the target on the log screen.",
      "plateau": "Try a different rep range, or swap in a variation for a few weeks.",
      "declining": "Check sleep and recovery, or lower the weight and build back up."
    },
    "consistencyTitle": "Consistency",
    "averagePerWeek": "{count} workouts/wk on average",
    "thisWeek": "This wk",
    "skippedTitle": "Often skipped in routines",
    "skippedRow": "{routine} · skipped {skipped} of {sessions}"
  }
```

`messages/th.json`:

```json
  "insights": {
    "title": "วิเคราะห์การฝึก",
    "windowNote": "จากการฝึก 8 สัปดาห์ล่าสุด",
    "emptyTitle": "ข้อมูลการฝึกยังไม่พอ",
    "emptyDescription": "บันทึกการฝึกให้จบอย่างน้อย 2 ครั้งใน 8 สัปดาห์ล่าสุดเพื่อดูผลวิเคราะห์",
    "deloadTitle": "ถึงเวลาฝึกเบาลงสักสัปดาห์หรือยัง?",
    "deloadDescription": "{declining} จาก {scored} ท่าที่ติดตามมีแนวโน้มลดลง ลองฝึกเบาลง 1 สัปดาห์ (ราวครึ่งหนึ่งของจำนวนเซ็ตปกติ) เพื่อให้ร่างกายฟื้นตัว",
    "deloadSinceLight": "{weeks, plural, =0 {สัปดาห์ที่แล้วเป็นสัปดาห์เบา} other {สัปดาห์เบาล่าสุด: # สัปดาห์ก่อน}}",
    "deloadNoLightWeek": "ไม่มีสัปดาห์เบาเลยใน 8 สัปดาห์ล่าสุด",
    "volumeTitle": "เซ็ตต่อสัปดาห์ตามกลุ่มกล้ามเนื้อ",
    "volumeHint": "ค่าเฉลี่ยเซ็ตจริงใน 4 สัปดาห์ล่าสุด แนะนำ {low}–{high} เซ็ต",
    "setsPerWeek": "{sets} เซ็ต/สัปดาห์",
    "sessionsPerWeek": "{count} ครั้ง/สัปดาห์",
    "band": { "low": "น้อย", "optimal": "พอดี", "high": "มาก" },
    "trendsTitle": "แนวโน้มรายท่า",
    "trendsHint": "e1RM สูงสุดของ 3 ครั้งล่าสุด เทียบกับก่อนหน้า",
    "trendsEmpty": "ฝึกท่าเดิมให้ได้ 4 ครั้งขึ้นไปใน 8 สัปดาห์ เพื่อดูแนวโน้ม",
    "status": { "progressing": "ก้าวหน้า", "plateau": "ทรงตัว", "declining": "ลดลง" },
    "tip": {
      "progressing": "ทำต่อไป ใช้เป้าบนหน้าบันทึกเป็นแนวทาง",
      "plateau": "ลองเปลี่ยนช่วงจำนวนครั้ง หรือสลับไปเล่นท่าใกล้เคียงสักสองสามสัปดาห์",
      "declining": "เช็กการนอนและการพักฟื้น หรือลดน้ำหนักลงแล้วค่อยไต่กลับขึ้นไป"
    },
    "consistencyTitle": "ความสม่ำเสมอ",
    "averagePerWeek": "เฉลี่ย {count} ครั้ง/สัปดาห์",
    "thisWeek": "สัปดาห์นี้",
    "skippedTitle": "ท่าใน routine ที่มักข้าม",
    "skippedRow": "{routine} · ข้าม {skipped} จาก {sessions} ครั้ง"
  }
```

- [ ] **Step 2: Create the cards**

`app/(app)/insights/DeloadBanner.tsx`:

```tsx
import { useTranslations } from "next-intl";
import { BatteryWarning } from "@phosphor-icons/react/ssr";
import { Card } from "@/components/ui/Card";
import type { DeloadSignal } from "@/lib/insights/analysis";

export function DeloadBanner({ deload }: { deload: DeloadSignal }) {
  const t = useTranslations("insights");
  return (
    <Card className="flex gap-3 border-danger/40 bg-danger/10">
      <BatteryWarning className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
      <div className="space-y-1 text-sm">
        <p className="font-medium text-foreground">{t("deloadTitle")}</p>
        <p className="text-muted">
          {t("deloadDescription", { declining: deload.declining, scored: deload.scored })}
        </p>
        <p className="text-muted">
          {deload.weeksSinceLightWeek === null
            ? t("deloadNoLightWeek")
            : t("deloadSinceLight", { weeks: deload.weeksSinceLightWeek })}
        </p>
      </div>
    </Card>
  );
}
```

`app/(app)/insights/MuscleVolumeCard.tsx`:

```tsx
import { useFormatter, useTranslations } from "next-intl";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { muscleLabel, muscleStyle } from "@/components/ui/muscle";
import { HIGH_SETS, LOW_SETS, type MuscleVolume, type VolumeBand } from "@/lib/insights/analysis";

const BAND_TONE: Record<VolumeBand, BadgeTone> = { low: "danger", optimal: "success", high: "neutral" };
// Bars are drawn on a 0–25 sets/week scale; the shaded strip marks the recommended band.
const SCALE_MAX = 25;
const pct = (sets: number) => `${Math.min(sets / SCALE_MAX, 1) * 100}%`;

export function MuscleVolumeCard({ volume }: { volume: MuscleVolume[] }) {
  const t = useTranslations("insights");
  const tm = useTranslations("muscle");
  const format = useFormatter();
  const one = (n: number) => format.number(n, { maximumFractionDigits: 1 });

  return (
    <section className="space-y-2">
      <h2 className="font-medium">{t("volumeTitle")}</h2>
      <Card className="space-y-4">
        <p className="text-sm text-muted">{t("volumeHint", { low: LOW_SETS, high: HIGH_SETS })}</p>
        <ul className="space-y-3">
          {volume.map((v) => (
            <li key={v.group} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">{muscleLabel(tm, v.group)}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono tabular-nums text-muted">
                    {t("setsPerWeek", { sets: one(v.setsPerWeek) })}
                  </span>
                  <Badge tone={BAND_TONE[v.band]}>{t(`band.${v.band}`)}</Badge>
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                <div
                  className="absolute inset-y-0 bg-success/20"
                  style={{ left: pct(LOW_SETS), width: `calc(${pct(HIGH_SETS)} - ${pct(LOW_SETS)})` }}
                />
                <div
                  className={`absolute inset-y-0 left-0 rounded-full ${muscleStyle(v.group).bar}`}
                  style={{ width: pct(v.setsPerWeek) }}
                />
              </div>
              <p className="text-xs text-muted">{t("sessionsPerWeek", { count: one(v.sessionsPerWeek) })}</p>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
```

`app/(app)/insights/TrendsCard.tsx`:

```tsx
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { CaretRight, Equals, TrendDown, TrendUp } from "@phosphor-icons/react/ssr";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { ExerciseTrend, TrendStatus } from "@/lib/insights/analysis";

// Problems first.
const STATUSES: TrendStatus[] = ["declining", "plateau", "progressing"];
const STATUS_TONE: Record<TrendStatus, BadgeTone> = { progressing: "success", plateau: "neutral", declining: "danger" };
const STATUS_ICON = { progressing: TrendUp, plateau: Equals, declining: TrendDown };

export function TrendsCard({ trends }: { trends: ExerciseTrend[] }) {
  const t = useTranslations("insights");
  const format = useFormatter();

  return (
    <section className="space-y-2">
      <h2 className="font-medium">{t("trendsTitle")}</h2>
      <Card className="space-y-4">
        <p className="text-sm text-muted">{t("trendsHint")}</p>
        {trends.length === 0 ? (
          <p className="text-sm text-muted">{t("trendsEmpty")}</p>
        ) : (
          STATUSES.map((status) => {
            const rows = trends.filter((trend) => trend.status === status);
            if (rows.length === 0) return null;
            const Icon = STATUS_ICON[status];
            return (
              <div key={status} className="space-y-1">
                <Badge tone={STATUS_TONE[status]} icon={<Icon className="h-3 w-3" />}>
                  {t(`status.${status}`)}
                </Badge>
                <p className="text-xs text-muted">{t(`tip.${status}`)}</p>
                <ul className="divide-y divide-border">
                  {rows.map((row) => (
                    <li key={row.exerciseId}>
                      <Link
                        href={`/exercises/${row.exerciseId}`}
                        className="flex min-h-11 items-center justify-between gap-2 rounded-lg text-sm [touch-action:manipulation] hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="truncate">{row.name}</span>
                        <span className="flex shrink-0 items-center gap-1 font-mono tabular-nums text-muted">
                          {format.number(row.changePct / 100, {
                            style: "percent",
                            maximumFractionDigits: 1,
                            signDisplay: "exceptZero",
                          })}
                          <CaretRight className="h-4 w-4" aria-hidden />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </Card>
    </section>
  );
}
```

`app/(app)/insights/ConsistencyCard.tsx`:

```tsx
import { useFormatter, useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import type { Consistency } from "@/lib/insights/analysis";

const BAR_MAX_PX = 64;

// weekLabels are formatted on the server, one per consistency.weeks entry.
export function ConsistencyCard({ consistency, weekLabels }: { consistency: Consistency; weekLabels: string[] }) {
  const t = useTranslations("insights");
  const format = useFormatter();
  const most = Math.max(1, ...consistency.weeks.map((w) => w.sessions));

  return (
    <section className="space-y-2">
      <h2 className="font-medium">{t("consistencyTitle")}</h2>
      <Card className="space-y-4">
        <p className="text-sm">
          {t("averagePerWeek", { count: format.number(consistency.averagePerWeek, { maximumFractionDigits: 1 }) })}
        </p>
        <ul className="flex items-end gap-1.5">
          {consistency.weeks.map((week, i) => (
            <li key={week.weekStart} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="font-mono text-xs tabular-nums text-muted">{week.sessions}</span>
              <span
                aria-hidden
                className={`w-full rounded-t ${week.partial ? "bg-accent/40" : "bg-accent"}`}
                style={{ height: `${Math.max(2, (week.sessions / most) * BAR_MAX_PX)}px` }}
              />
              <span className="w-full truncate text-center text-[10px] text-muted">{weekLabels[i]}</span>
            </li>
          ))}
        </ul>
        {consistency.skipped.length > 0 && (
          <div className="space-y-1 border-t border-border pt-3">
            <h3 className="text-sm font-medium">{t("skippedTitle")}</h3>
            <ul className="space-y-1">
              {consistency.skipped.map((s) => (
                <li key={`${s.routineId}-${s.exerciseId}`} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{s.exerciseName}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {t("skippedRow", { routine: s.routineName, skipped: s.skipped, sessions: s.sessions })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </section>
  );
}
```

- [ ] **Step 3: Create the page and loading state**

`app/(app)/insights/loading.tsx`:

```tsx
import { PageSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <PageSkeleton tiles={4} rows={3} />;
}
```

`app/(app)/insights/page.tsx`:

```tsx
import { getLocale, getTranslations } from "next-intl/server";
import { ChartLineUp } from "@phosphor-icons/react/ssr";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getTodayString } from "@/lib/date";
import { getInsights } from "@/lib/insights/service";
import { formatShortDate } from "@/lib/sessions/summary";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConsistencyCard } from "./ConsistencyCard";
import { DeloadBanner } from "./DeloadBanner";
import { MuscleVolumeCard } from "./MuscleVolumeCard";
import { TrendsCard } from "./TrendsCard";

export default async function InsightsPage() {
  const user = await getAuthUser();
  const today = getTodayString();
  const [insights, locale, t] = await Promise.all([
    getInsights(prisma, user!.id, today),
    getLocale(),
    getTranslations("insights"),
  ]);

  const header = (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted">{t("windowNote")}</p>
    </div>
  );

  if (!insights.hasEnoughData) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={<ChartLineUp className="h-6 w-6" />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      </div>
    );
  }

  // Formatted here on the server (Intl output differs between Node and the browser).
  const weekLabels = insights.consistency.weeks.map((week) =>
    week.partial ? t("thisWeek") : formatShortDate(week.weekStart, locale)
  );

  return (
    <div className="space-y-6">
      {header}
      {insights.deload.signal && <DeloadBanner deload={insights.deload} />}
      <MuscleVolumeCard volume={insights.muscleVolume} />
      <TrendsCard trends={insights.trends} />
      <ConsistencyCard consistency={insights.consistency} weekLabels={weekLabels} />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck, lint, verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

Restart `next dev`. Open `/insights` in the preview (signed in): with ≥ 2 completed workouts in 8 weeks all cards render; with a fresh account the empty state shows. Check th + en, light + dark, and 375px width (no horizontal scroll; week labels truncate). Click a trend row → `/exercises/[id]`. No console errors (`read_console_messages`).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/insights" messages/en.json messages/th.json
git commit -m "feat(insights): /insights page (muscle volume, trends, consistency, deload)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Navigation and dashboard card

**Files:**
- Create: `app/(app)/dashboard/InsightsCard.tsx`
- Modify: `app/(app)/dashboard/page.tsx`, `app/(app)/nav-items.ts`, `app/(app)/AccountMenu.tsx`
- Modify: `messages/en.json`, `messages/th.json` (`nav`, `account`, `dashboard`)

**Interfaces:**
- Consumes: `getInsights` (Task 5), `Insights` (Task 2).

- [ ] **Step 1: Add the messages**

`messages/en.json`: in `"nav"` add `"insights": "Insights",`; in `"account"` add `"insights": "Insights",`; in `"dashboard"` add:

```json
    "insightsTitle": "Insights",
    "insightsEmpty": "Finish a couple of workouts to unlock your analysis.",
    "insightsDeload": "Several lifts are trending down — consider a lighter week.",
    "insightsSummary": "{plateaus, plural, =0 {No plateaus} one {# plateau} other {# plateaus}} · {low, plural, =0 {volume on target} one {# muscle group low} other {# muscle groups low}}",
```

`messages/th.json`: `"nav"` → `"insights": "วิเคราะห์",`; `"account"` → `"insights": "วิเคราะห์การฝึก",`; `"dashboard"`:

```json
    "insightsTitle": "วิเคราะห์การฝึก",
    "insightsEmpty": "บันทึกการฝึกสัก 2 ครั้งเพื่อเริ่มดูผลวิเคราะห์",
    "insightsDeload": "หลายท่ามีแนวโน้มลดลง ลองฝึกเบาลงสักสัปดาห์",
    "insightsSummary": "{plateaus, plural, =0 {ไม่มีท่าที่ทรงตัว} other {ทรงตัว # ท่า}} · {low, plural, =0 {ปริมาณพอดี} other {กลุ่มที่น้อยไป # กลุ่ม}}",
```

- [ ] **Step 2: Nav and account menu**

`app/(app)/nav-items.ts`: add `ChartLineUp` to the icon import, update the comment to mention Insights, and:

```ts
export const TOP_NAV_ITEMS = [
  ...NAV_ITEMS,
  { href: "/insights", labelKey: "insights", icon: ChartLineUp },
  { href: "/body", labelKey: "body", icon: PersonSimple },
] as const;
```

`app/(app)/AccountMenu.tsx`: add `ChartLineUp` to its phosphor import and, before the `/body` link:

```tsx
          <Link
            href="/insights"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={`${ITEM_CLASS} text-foreground hover:bg-surface-muted`}
          >
            <ChartLineUp className="h-4 w-4 text-muted" />
            {t("insights")}
          </Link>
```

- [ ] **Step 3: Dashboard card**

Create `app/(app)/dashboard/InsightsCard.tsx`:

```tsx
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CaretRight, ChartLineUp } from "@phosphor-icons/react/ssr";
import { Card } from "@/components/ui/Card";
import type { Insights } from "@/lib/insights/analysis";

const LINK_CLASS =
  "flex items-center gap-3 rounded-2xl p-4 transition [touch-action:manipulation] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// The phone's way into /insights (it has no bottom-nav tab), so it's shown even without data.
export function InsightsCard({ insights }: { insights: Insights }) {
  const t = useTranslations("dashboard");
  const deload = insights.hasEnoughData && insights.deload.signal;
  const text = !insights.hasEnoughData
    ? t("insightsEmpty")
    : deload
      ? t("insightsDeload")
      : t("insightsSummary", {
          plateaus: insights.trends.filter((trend) => trend.status === "plateau").length,
          low: insights.muscleVolume.filter((v) => v.band === "low").length,
        });

  return (
    <Card padding={false}>
      <Link href="/insights" className={LINK_CLASS}>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            deload ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent"
          }`}
        >
          <ChartLineUp className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1 text-sm">{text}</span>
        <CaretRight className="h-4 w-4 shrink-0 text-muted" />
      </Link>
    </Card>
  );
}
```

In `app/(app)/dashboard/page.tsx`: import `getInsights` from `@/lib/insights/service` and `InsightsCard` from `./InsightsCard`; add `insights` as the last element of the destructured `Promise.all` result with `getInsights(prisma, user!.id, today)` as the last promise; add after the Body `<section>`:

```tsx
      <section className="space-y-2">
        <h2 className="font-medium">{t("insightsTitle")}</h2>
        <InsightsCard insights={insights} />
      </section>
```

- [ ] **Step 4: Typecheck, lint, verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

Restart `next dev`. Preview: desktop top bar shows "Insights"; account menu has it; dashboard card text matches the data and links to `/insights`; at 375px nothing overflows. th + en.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/dashboard" "app/(app)/nav-items.ts" "app/(app)/AccountMenu.tsx" messages/en.json messages/th.json
git commit -m "feat(insights): dashboard card, account menu and desktop nav link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Docs and full verification

**Files:**
- Modify: `CLAUDE.md`, `CONTEXT.md`

- [ ] **Step 1: CONTEXT.md glossary**

Under `### Training` in `CONTEXT.md`, add (matching the existing `**Term**:` style):

```markdown
**Rep range**:
The target reps for an exercise in a routine (`routine_exercises.target_reps_min/max`, set together). Without one — or outside a routine — the default is 8–12.

**Next target**:
The weight × reps suggested for an exercise's next session (`nextTarget`, `lib/insights/progression.ts`): add a rep until every top set reaches the top of the rep range, then add weight (Legs +5, Chest/Back +2.5, others +1.25 kg) and restart at the bottom; two stalled sessions below the range at the same weight drop the weight one step.

**Plateau**:
An exercise whose best estimated 1RM of its last 3 sessions is between 0% and −5% of its best before them (needs 4+ sessions in the 8-week window). Above 0% is progressing, −5% or lower is declining.

**Deload signal**:
Shown on `/insights` when 2+ scored exercises are declining and they are at least 40% of those scored.
```

- [ ] **Step 2: CLAUDE.md**

Add a Gotchas bullet after the body-scans bullet:

```markdown
- **Training insights are rule-based and pure** (`lib/insights/progression.ts` = next-session target, `lib/insights/analysis.ts` = `/insights` rules; `lib/insights/service.ts` only loads data). Thresholds are named constants at the top of each module — change them there and in the tests. The log screen's target uses the last **two** completed sessions (`getRecentSessionSets`) and the routine's rep range (`getRoutineTargets`, default `DEFAULT_REP_RANGE` 8–12); exercises added mid-session use the default. `routine_exercises.target_reps_min/max` (`0004_routine_rep_range`, hand-written) are **not** in the JSON backup yet. `/insights` has no bottom-nav tab — phones reach it from the dashboard card / account menu. Phase 2 (AI coach) should consume `getInsights` output rather than raw sets.
```

- [ ] **Step 3: Full verification**

Run each and confirm:
- `npm test` → all pass.
- `DOTENV_CONFIG_PATH=.env.local npm run test:db` → all pass.
- `npx tsc --noEmit && npm run lint` → clean.
- `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → only the documented known drift.

Browser end-to-end (preview, signed in; restart `next dev` first):
1. Routine: set an exercise to 5–8 reps → start the routine → the target line uses 5–8 and the inputs are prefilled with it.
2. Freeform workout → target uses 8–12.
3. `/insights` renders all sections (or the empty state) in th + en, light + dark, at 375px and desktop.
4. Dashboard Insights card text matches `/insights` and links there.
5. `read_console_messages` shows no errors or hydration warnings.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md CONTEXT.md
git commit -m "docs: training insights (rep range, next target, plateau, deload)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
