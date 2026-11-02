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
