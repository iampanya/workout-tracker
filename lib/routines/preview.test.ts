import { describe, it, expect } from "vitest";
import { routinePreviewNames } from "./preview";

describe("routinePreviewNames", () => {
  it("is null for an empty routine", () => {
    expect(routinePreviewNames({ exerciseCount: 0, exerciseNames: [] })).toBeNull();
  });

  it("lists names and marks truncation", () => {
    expect(routinePreviewNames({ exerciseCount: 1, exerciseNames: ["Squat"] })).toBe("Squat");
    expect(routinePreviewNames({ exerciseCount: 5, exerciseNames: ["A", "B", "C"] })).toBe("A, B, C…");
  });
});
