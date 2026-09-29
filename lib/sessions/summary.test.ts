import { describe, it, expect } from "vitest";
import {
  computeSessionSummary,
  topWorkingSet,
  workingSetNumbers,
  formatSetCount,
  formatSessionDate,
  sessionDurationMinutes,
  formatDuration,
  formatShortDate,
  formatRelativeDate,
  formatMonthHeading,
  type ExerciseSummary,
} from "./summary";

const set = (
  weight_kg: number,
  reps: number,
  is_warmup = false,
  set_number = 1
) => ({ weight_kg, reps, is_warmup, set_number });

describe("computeSessionSummary", () => {
  it("counts exercises, and excludes warmups from both set count and volume", () => {
    const exercises: ExerciseSummary[] = [
      { exerciseName: "Bench", sets: [set(40, 10, true, 1), set(80, 8, false, 2), set(80, 6, false, 3)] },
      { exerciseName: "Row", sets: [set(60, 10, false, 1)] },
    ];
    expect(computeSessionSummary(exercises)).toEqual({
      exerciseCount: 2,
      setCount: 3,
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

describe("workingSetNumbers", () => {
  const w = { is_warmup: true };
  const x = { is_warmup: false };

  it("numbers working sets 1..n and skips warmups wherever they fall", () => {
    expect(workingSetNumbers([w, w, x, x, w, x, x])).toEqual([null, null, 1, 2, null, 3, 4]);
  });

  it("ignores stored set_number gaps (numbering is positional)", () => {
    const sets = [set(80, 5, false, 1), set(80, 5, false, 3), set(80, 5, false, 7)];
    expect(workingSetNumbers(sets)).toEqual([1, 2, 3]);
  });

  it("handles empty and warmup-only lists", () => {
    expect(workingSetNumbers([])).toEqual([]);
    expect(workingSetNumbers([w, w])).toEqual([null, null]);
  });
});

describe("formatSetCount", () => {
  const w = { is_warmup: true };
  const x = { is_warmup: false };

  it("shows working sets, with warmups appended only when present", () => {
    expect(formatSetCount([x, x, x])).toBe("3 sets");
    expect(formatSetCount([x])).toBe("1 set");
    expect(formatSetCount([w, w, x, x])).toBe("2 sets + 2W");
    expect(formatSetCount([w, x])).toBe("1 set + 1W");
    expect(formatSetCount([w, w, w])).toBe("0 sets + 3W");
    expect(formatSetCount([])).toBe("0 sets");
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

describe("formatShortDate", () => {
  it("formats a date-only string with its weekday", () => {
    expect(formatShortDate("2026-09-23")).toBe("Wed, Sep 23");
  });

  it("returns unparseable input unchanged", () => {
    expect(formatShortDate("nope")).toBe("nope");
  });
});

describe("formatRelativeDate", () => {
  it("says Today / Yesterday for the two most recent days", () => {
    expect(formatRelativeDate("2026-09-26", "2026-09-26")).toBe("Today");
    expect(formatRelativeDate("2026-09-25", "2026-09-26")).toBe("Yesterday");
  });

  it("handles a month boundary for Yesterday", () => {
    expect(formatRelativeDate("2026-08-31", "2026-09-01")).toBe("Yesterday");
  });

  it("uses the short form within the year and the full form across years", () => {
    expect(formatRelativeDate("2026-09-20", "2026-09-26")).toBe("Sun, Sep 20");
    expect(formatRelativeDate("2025-12-30", "2026-01-02")).toBe("Dec 30, 2025");
  });
});

describe("formatMonthHeading", () => {
  it("names the month and year", () => {
    expect(formatMonthHeading("2026-09-23")).toBe("September 2026");
  });
});
