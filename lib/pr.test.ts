import { describe, it, expect } from "vitest";
import { isNewPr } from "./pr";

describe("isNewPr", () => {
  it("is a PR when there is no prior max", () => {
    expect(isNewPr(60, null)).toBe(true);
  });
  it("is a PR when weight exceeds the prior max", () => {
    expect(isNewPr(101, 100)).toBe(true);
  });
  it("is not a PR when weight equals the prior max", () => {
    expect(isNewPr(100, 100)).toBe(false);
  });
  it("is not a PR when weight is below the prior max", () => {
    expect(isNewPr(90, 100)).toBe(false);
  });
});
