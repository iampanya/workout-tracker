import { describe, it, expect } from "vitest";
import { remainingSeconds, formatClock } from "./rest-timer";

describe("remainingSeconds", () => {
  it("derives the remaining time from the wall clock", () => {
    expect(remainingSeconds(0, 90, 0)).toBe(90);
    expect(remainingSeconds(0, 90, 30_500)).toBe(60);
  });

  it("never goes below zero", () => {
    expect(remainingSeconds(0, 90, 500_000)).toBe(0);
  });
});

describe("formatClock", () => {
  it("formats as m:ss", () => {
    expect(formatClock(90)).toBe("1:30");
    expect(formatClock(5)).toBe("0:05");
  });
});
