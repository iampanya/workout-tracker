import { describe, it, expect } from "vitest";
import {
  computeSessionSummary,
  topWorkingSet,
  formatSessionDate,
  sessionDurationMinutes,
  formatDuration,
  type ExerciseSummary,
} from "./summary";

const set = (
  weight_kg: number,
  reps: number,
  is_warmup = false,
  set_number = 1
) => ({ weight_kg, reps, is_warmup, set_number });

describe("computeSessionSummary", () => {
  it("counts exercises and every set, but excludes warmups from volume", () => {
    const exercises: ExerciseSummary[] = [
      { exerciseName: "Bench", sets: [set(40, 10, true, 1), set(80, 8, false, 2), set(80, 6, false, 3)] },
      { exerciseName: "Row", sets: [set(60, 10, false, 1)] },
    ];
    expect(computeSessionSummary(exercises)).toEqual({
      exerciseCount: 2,
      setCount: 4,
      totalVolumeKg: 80 * 8 + 80 * 6 + 60 * 10, // 640 + 480 + 600 = 1720
    });
  });

  it("rounds fractional volume and handles empty input", () => {
    expect(computeSessionSummary([])).toEqual({
      exerciseCount: 0,
      setCount: 0,
      totalVolumeKg: 0,
    });
    const frac: ExerciseSummary[] = [{ exerciseName: "x", sets: [set(2.5, 3)] }];
    expect(computeSessionSummary(frac).totalVolumeKg).toBe(8); // 7.5 -> 8
  });
});

describe("topWorkingSet", () => {
  it("picks the heaviest working set, breaking ties by reps", () => {
    expect(topWorkingSet([set(80, 5, false, 1), set(90, 3, false, 2), set(90, 5, false, 3)])).toEqual(
      set(90, 5, false, 3)
    );
  });

  it("ignores warmups and returns null when there are no working sets", () => {
    expect(topWorkingSet([set(100, 5, true, 1)])).toBeNull();
    expect(topWorkingSet([])).toBeNull();
  });
});

describe("formatSessionDate", () => {
  it("formats an ISO date without timezone shift", () => {
    expect(formatSessionDate("2026-08-11")).toBe("Aug 11, 2026");
    expect(formatSessionDate("2026-01-01")).toBe("Jan 1, 2026");
  });

  it("returns the input unchanged when it isn't a parseable date", () => {
    expect(formatSessionDate("not-a-date")).toBe("not-a-date");
  });
});

describe("sessionDurationMinutes", () => {
  it("returns whole minutes between start and completion", () => {
    expect(
      sessionDurationMinutes("2026-08-11T10:00:00Z", "2026-08-11T10:58:00Z")
    ).toBe(58);
  });

  it("returns null for missing timestamps or non-positive durations", () => {
    expect(sessionDurationMinutes(null, "2026-08-11T10:58:00Z")).toBeNull();
    expect(sessionDurationMinutes("2026-08-11T10:00:00Z", null)).toBeNull();
    expect(
      sessionDurationMinutes("2026-08-11T10:58:00Z", "2026-08-11T10:00:00Z")
    ).toBeNull();
  });
});

describe("formatDuration", () => {
  it("shows minutes under an hour and h/m above", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(58)).toBe("58 min");
    expect(formatDuration(75)).toBe("1h 15m");
    expect(formatDuration(120)).toBe("2h 00m");
  });
});
