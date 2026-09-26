import { describe, it, expect } from "vitest";
import { routinePreview } from "./preview";

describe("routinePreview", () => {
  it("handles an empty routine", () => {
    expect(routinePreview({ exerciseCount: 0, exerciseNames: [] })).toBe("No exercises yet");
  });

  it("lists names and marks truncation", () => {
    expect(routinePreview({ exerciseCount: 1, exerciseNames: ["Squat"] })).toBe("1 exercise · Squat");
    expect(routinePreview({ exerciseCount: 5, exerciseNames: ["A", "B", "C"] })).toBe(
      "5 exercises · A, B, C…"
    );
  });
});
