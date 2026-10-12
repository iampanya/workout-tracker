import { afterEach, describe, it, expect } from "vitest";
import { addDays, getTodayString, getWeekStart, getWeekEnd, toDateOnlyString } from "./date";
import { computeStreakDays } from "./dashboard/streak";

describe("getTodayString", () => {
  it("defaults to Asia/Bangkok (UTC+7): 00:30 Bangkok is already the next day while UTC is not", () => {
    const instant = new Date("2026-10-11T17:30:00Z"); // 00:30 Mon Oct 12 in Bangkok
    expect(getTodayString(instant)).toBe("2026-10-12");
    expect(getTodayString(instant, "UTC")).toBe("2026-10-11");
  });

  it("stays on the previous day until Bangkok midnight", () => {
    expect(getTodayString(new Date("2026-10-11T16:59:59Z"))).toBe("2026-10-11");
    expect(getTodayString(new Date("2026-10-11T17:00:00Z"))).toBe("2026-10-12");
  });

  it("rolls over month and year boundaries", () => {
    expect(getTodayString(new Date("2026-12-31T18:00:00Z"))).toBe("2027-01-01");
  });

  it("defaults to now when no argument is passed", () => {
    expect(getTodayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("toDateOnlyString", () => {
  it("returns the UTC calendar day of a @db.Date value (UTC midnight)", () => {
    // Prisma returns a @db.Date column as a Date at UTC midnight.
    const d = new Date("2026-01-05T00:00:00.000Z");
    expect(toDateOnlyString(d)).toBe("2026-01-05");
  });
});

describe("addDays", () => {
  it("adds and subtracts across month, year and leap-day boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-10-12", -90)).toBe("2026-07-14");
  });
});

describe("getWeekStart / getWeekEnd", () => {
  it("returns Monday..Sunday for a mid-week Wednesday", () => {
    expect(getWeekStart("2026-01-07")).toBe("2026-01-05");
    expect(getWeekEnd("2026-01-07")).toBe("2026-01-11");
  });

  it("maps Sunday back to that week's Monday", () => {
    expect(getWeekStart("2026-01-11")).toBe("2026-01-05");
    expect(getWeekEnd("2026-01-11")).toBe("2026-01-11");
  });

  it("returns itself for a Monday", () => {
    expect(getWeekStart("2026-01-05")).toBe("2026-01-05");
    expect(getWeekEnd("2026-01-05")).toBe("2026-01-11");
  });

  it("spans a year boundary", () => {
    expect(getWeekStart("2027-01-01")).toBe("2026-12-28"); // Fri
    expect(getWeekEnd("2026-12-28")).toBe("2027-01-03");
  });

  it("starts the new week at Bangkok's Monday midnight, while UTC is still Sunday", () => {
    const instant = new Date("2026-10-11T17:30:00Z"); // Sun 17:30 UTC = Mon 00:30 Bangkok
    expect(getWeekStart(getTodayString(instant))).toBe("2026-10-12");
  });
});

// Vercel runs in UTC, a dev machine may be anywhere: none of the helpers may read the process's
// local time zone. Node re-reads process.env.TZ, so switching it changes local-time Date methods.
describe("independence from the runtime time zone", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  for (const tz of ["UTC", "America/Los_Angeles", "Asia/Bangkok", "Pacific/Kiritimati"]) {
    it(`gives the same calendar answers with TZ=${tz}`, () => {
      process.env.TZ = tz;
      const instant = new Date("2026-10-11T17:30:00Z"); // 00:30 Mon Oct 12 in Bangkok
      expect(getTodayString(instant)).toBe("2026-10-12");
      expect(addDays("2026-03-08", 1)).toBe("2026-03-09"); // US DST start
      expect(getWeekStart("2026-10-11")).toBe("2026-10-05");
      expect(getWeekEnd("2026-11-01")).toBe("2026-11-01"); // US DST end, a Sunday
      expect(computeStreakDays(["2026-03-07", "2026-03-08", "2026-03-09"], "2026-03-09")).toBe(3);
    });
  }
});
