import { describe, it, expect } from "vitest";
import {
  computeSessionSummary,
  topWorkingSet,
  workingSetNumbers,
  countSets,
  formatSessionDate,
  sessionDurationMinutes,
  splitDuration,
  formatShortDate,
  formatRelativeDate,
  formatMonthHeading,
  formatAxisDate,
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

describe("countSets", () => {
  const w = { is_warmup: true };
  const x = { is_warmup: false };

  it("counts working sets and warmups separately", () => {
    expect(countSets([x, x, x])).toEqual({ working: 3, warmups: 0 });
    expect(countSets([w, w, x, x])).toEqual({ working: 2, warmups: 2 });
    expect(countSets([w, w, w])).toEqual({ working: 0, warmups: 3 });
    expect(countSets([])).toEqual({ working: 0, warmups: 0 });
  });
});

describe("formatSessionDate", () => {
  it("formats an ISO date without timezone shift", () => {
    expect(formatSessionDate("2026-08-11", "en")).toBe("Aug 11, 2026");
    expect(formatSessionDate("2026-01-01", "en")).toBe("Jan 1, 2026");
  });

  it("uses the Buddhist Era in Thai", () => {
    expect(formatSessionDate("2026-08-11", "th")).toBe("11 ส.ค. 2569");
    expect(formatSessionDate("2026-01-01", "th")).toBe("1 ม.ค. 2569");
  });

  it("returns the input unchanged when it isn't a parseable date", () => {
    expect(formatSessionDate("not-a-date", "en")).toBe("not-a-date");
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

describe("splitDuration", () => {
  it("splits minutes into hours, minutes and zero-padded minutes", () => {
    expect(splitDuration(45)).toEqual({ hours: 0, minutes: 45, mm: "45" });
    expect(splitDuration(75)).toEqual({ hours: 1, minutes: 15, mm: "15" });
    expect(splitDuration(120)).toEqual({ hours: 2, minutes: 0, mm: "00" });
    expect(splitDuration(125)).toEqual({ hours: 2, minutes: 5, mm: "05" });
  });
});

describe("formatShortDate", () => {
  it("formats a date-only string with its weekday", () => {
    expect(formatShortDate("2026-09-23", "en")).toBe("Wed, Sep 23");
    expect(formatShortDate("2026-09-23", "th")).toBe("พ. 23 ก.ย.");
  });

  it("returns unparseable input unchanged", () => {
    expect(formatShortDate("nope", "en")).toBe("nope");
  });
});

describe("formatRelativeDate", () => {
  const labels = { today: "Today", yesterday: "Yesterday" };

  it("uses the given labels for the two most recent days", () => {
    expect(formatRelativeDate("2026-09-26", "2026-09-26", "en", labels)).toBe("Today");
    expect(formatRelativeDate("2026-09-25", "2026-09-26", "en", labels)).toBe("Yesterday");
    expect(
      formatRelativeDate("2026-09-26", "2026-09-26", "th", { today: "วันนี้", yesterday: "เมื่อวาน" })
    ).toBe("วันนี้");
  });

  it("handles a month boundary for Yesterday", () => {
    expect(formatRelativeDate("2026-08-31", "2026-09-01", "en", labels)).toBe("Yesterday");
  });

  it("uses the short form within the year and the full form across years", () => {
    expect(formatRelativeDate("2026-09-20", "2026-09-26", "en", labels)).toBe("Sun, Sep 20");
    expect(formatRelativeDate("2025-12-30", "2026-01-02", "en", labels)).toBe("Dec 30, 2025");
    expect(formatRelativeDate("2025-12-30", "2026-01-02", "th", labels)).toBe("30 ธ.ค. 2568");
  });
});

describe("formatMonthHeading", () => {
  it("names the month and year", () => {
    expect(formatMonthHeading("2026-09-23", "en")).toBe("September 2026");
    expect(formatMonthHeading("2026-09-23", "th")).toBe("กันยายน 2569");
  });
});

describe("formatAxisDate", () => {
  it("is month/day in English and day/month in Thai", () => {
    expect(formatAxisDate("2026-09-23", "en")).toBe("9/23");
    expect(formatAxisDate("2026-09-23", "th")).toBe("23/9");
  });
});
