import { describe, it, expect } from "vitest";
import { generateReferralCode } from "./service";

describe("generateReferralCode", () => {
  it("produces an 8-char code from the unambiguous alphabet", () => {
    // Excludes 0/O and 1/I/L so codes stay readable/typeable.
    for (let i = 0; i < 100; i++) {
      const code = generateReferralCode();
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });
});
