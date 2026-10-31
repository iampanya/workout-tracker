import { describe, it, expect } from "vitest";
import { sampleScan } from "./fixtures";
import {
  SCAN_METRIC_KEYS,
  bodyGoalsInputSchema,
  bodyScanInputSchema,
  parseBodyImport,
  parseBodyImportText,
} from "./schema";

const file = (...scans: unknown[]) => ({ version: 1, source: "arboleaf", scans });

describe("parseBodyImport", () => {
  it("accepts a full arboleaf-shaped file", () => {
    const result = parseBodyImport(file(sampleScan()));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.scans[0].segments?.left_arm?.lean_kg).toBe(3.4);
  });

  it("accepts a minimal scan (time + weight) and defaults source", () => {
    const result = parseBodyImport({ version: 1, scans: [{ measured_at: "2026-10-18T02:58:00Z", weight_kg: 80 }] });
    expect(result).toMatchObject({ ok: true, data: { source: "arboleaf" } });
  });

  it("accepts null for metrics the scale didn't report", () => {
    expect(parseBodyImport(file(sampleScan({ bmi: null, segments: null, report: null }))).ok).toBe(true);
  });

  it("rejects a timestamp without a UTC offset", () => {
    expect(parseBodyImport(file(sampleScan({ measured_at: "2026-10-18T09:58:00" })))).toEqual({ ok: false, code: "invalidFile" });
  });

  it("rejects a non-positive weight and an empty scans list", () => {
    expect(parseBodyImport(file(sampleScan({ weight_kg: 0 })))).toEqual({ ok: false, code: "invalidFile" });
    expect(parseBodyImport(file())).toEqual({ ok: false, code: "invalidFile" });
  });

  it("reports a wrong version as unsupportedVersion, a missing one as invalidFile", () => {
    expect(parseBodyImport({ version: 2, scans: [sampleScan()] })).toEqual({ ok: false, code: "unsupportedVersion" });
    expect(parseBodyImport({ scans: [sampleScan()] })).toEqual({ ok: false, code: "invalidFile" });
    expect(parseBodyImport("nope")).toEqual({ ok: false, code: "invalidFile" });
  });
});

describe("parseBodyImportText", () => {
  it("flags text that isn't JSON", () => {
    expect(parseBodyImportText("{ not json")).toEqual({ ok: false, code: "invalidJson" });
  });

  it("parses JSON text", () => {
    expect(parseBodyImportText(JSON.stringify(file(sampleScan()))).ok).toBe(true);
  });
});

describe("bodyScanInputSchema", () => {
  it("has a field for every metric column", () => {
    for (const key of SCAN_METRIC_KEYS) expect(bodyScanInputSchema.shape).toHaveProperty(key);
  });
});

describe("bodyGoalsInputSchema", () => {
  it("accepts up to three distinct goals", () => {
    const goals = [
      { metric: "weight_kg", target: 75 },
      { metric: "body_fat_pct", target: 15 },
      { metric: "skeletal_muscle_kg", target: 37 },
    ];
    expect(bodyGoalsInputSchema.safeParse(goals).success).toBe(true);
    expect(bodyGoalsInputSchema.safeParse([]).success).toBe(true);
  });

  it("rejects two fat goals, duplicates and non-positive targets", () => {
    const twoFat = [{ metric: "body_fat_pct", target: 15 }, { metric: "body_fat_kg", target: 12 }];
    expect(bodyGoalsInputSchema.safeParse(twoFat).success).toBe(false);
    const dup = [{ metric: "weight_kg", target: 75 }, { metric: "weight_kg", target: 74 }];
    expect(bodyGoalsInputSchema.safeParse(dup).success).toBe(false);
    expect(bodyGoalsInputSchema.safeParse([{ metric: "weight_kg", target: 0 }]).success).toBe(false);
  });
});
