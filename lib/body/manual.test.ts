import { describe, it, expect } from "vitest";
import { MANUAL_MAIN_KEYS, MANUAL_MORE_KEYS, deriveManualMetrics, manualScanInputSchema } from "./manual";
import { SCAN_METRIC_KEYS } from "./schema";

const base = { measured_at: "2026-10-18T07:30:00+07:00", weight_kg: 80 };

describe("manual scan fields", () => {
  it("covers every metric except fat mass, which is derived", () => {
    const all = [...MANUAL_MAIN_KEYS, ...MANUAL_MORE_KEYS];
    expect(new Set(all).size).toBe(all.length);
    expect(all).not.toContain("body_fat_kg");
    expect([...all, "body_fat_kg"].sort()).toEqual([...SCAN_METRIC_KEYS].sort());
  });
});

describe("manualScanInputSchema", () => {
  it("accepts weight alone, with missing and null values", () => {
    expect(manualScanInputSchema.safeParse(base).success).toBe(true);
    expect(manualScanInputSchema.safeParse({ ...base, body_fat_pct: null }).success).toBe(true);
  });

  it("requires a positive weight", () => {
    expect(manualScanInputSchema.safeParse({ measured_at: base.measured_at }).success).toBe(false);
    expect(manualScanInputSchema.safeParse({ ...base, weight_kg: 0 }).success).toBe(false);
  });

  it("rejects naive times, negative values and percentages over 100", () => {
    expect(manualScanInputSchema.safeParse({ ...base, measured_at: "2026-10-18T07:30:00" }).success).toBe(false);
    expect(manualScanInputSchema.safeParse({ ...base, visceral_fat: -1 }).success).toBe(false);
    expect(manualScanInputSchema.safeParse({ ...base, body_fat_pct: 101 }).success).toBe(false);
    expect(manualScanInputSchema.safeParse({ ...base, bmr_kcal: 1800 }).success).toBe(true);
  });

  it("does not accept fat mass as input", () => {
    const parsed = manualScanInputSchema.parse({ ...base, body_fat_kg: 99 });
    expect("body_fat_kg" in parsed).toBe(false);
  });
});

describe("deriveManualMetrics", () => {
  it("fills every metric column, null when blank", () => {
    const metrics = deriveManualMetrics(manualScanInputSchema.parse(base));
    expect(Object.keys(metrics).sort()).toEqual([...SCAN_METRIC_KEYS].sort());
    expect(metrics.weight_kg).toBe(80);
    expect(metrics.bmi).toBeNull();
    expect(metrics.body_fat_kg).toBeNull();
  });

  it("derives fat mass from weight × fat %, rounded to 2 decimals", () => {
    expect(deriveManualMetrics(manualScanInputSchema.parse({ ...base, body_fat_pct: 22 })).body_fat_kg).toBe(17.6);
    expect(
      deriveManualMetrics(manualScanInputSchema.parse({ ...base, weight_kg: 72.3, body_fat_pct: 18.7 })).body_fat_kg
    ).toBe(13.52);
  });
});
