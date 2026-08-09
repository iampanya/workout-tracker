import { describe, it, expect } from "vitest";
import { getLocalDateString } from "./date";

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
