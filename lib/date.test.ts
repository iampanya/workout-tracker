import { describe, it, expect } from "vitest";
import { getLocalDateString, getWeekStart, getWeekEnd } from "./date";

describe("getLocalDateString", () => {
  it("formats a date as YYYY-MM-DD using local time, zero-padded", () => {
    const d = new Date(2026, 0, 5, 23, 30); // Jan 5, 2026, 11:30pm local
    expect(getLocalDateString(d)).toBe("2026-01-05");
  });

  it("defaults to now when no argument is passed", () => {
    const result = getLocalDateString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("getWeekStart / getWeekEnd", () => {
  it("returns Monday..Sunday for a mid-week Wednesday", () => {
    const wed = new Date(2026, 0, 7); // Wed Jan 7, 2026
    expect(getWeekStart(wed)).toBe("2026-01-05");
    expect(getWeekEnd(wed)).toBe("2026-01-11");
  });

  it("maps Sunday back to that week's Monday", () => {
    const sun = new Date(2026, 0, 11); // Sun Jan 11, 2026
    expect(getWeekStart(sun)).toBe("2026-01-05");
    expect(getWeekEnd(sun)).toBe("2026-01-11");
  });

  it("returns itself for a Monday", () => {
    const mon = new Date(2026, 0, 5); // Mon Jan 5, 2026
    expect(getWeekStart(mon)).toBe("2026-01-05");
    expect(getWeekEnd(mon)).toBe("2026-01-11");
  });
});
