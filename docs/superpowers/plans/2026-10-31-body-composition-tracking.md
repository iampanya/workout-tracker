# Body Composition Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import arboleaf body-composition scans (as JSON that Claude Code makes from the scale's PDF), and show trends, goals, muscle balance vs training, and full historical reports in the app.

**Architecture:** A new `lib/body/` domain: pure modules (`schema.ts` zod import format, `metrics.ts` deltas/goals, `balance.ts` region shares) plus `service.ts` (Prisma, `(db, userId, …)`, every query filtered by `user_id`). Two new tables (`body_scans`, `body_goals`) via a hand-written additive migration. Thin server actions in `lib/actions/body.ts`; UI in `app/(app)/body/**` plus a dashboard card.

**Tech Stack:** Next.js 16.3 App Router, Prisma 7 (Postgres), zod 4, next-intl 4, recharts 3, Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-body-composition-tracking-design.md`

## Global Constraints

- Branch: `feat/body-composition` (already checked out). Never push; never commit `*.pdf` or anything in `body-scans/` (gitignored personal health data).
- Read `CLAUDE.md` + `AGENTS.md` first. This Next.js has breaking changes — check `node_modules/next/dist/docs/` before using an unfamiliar Next API.
- Service functions take `(db: PrismaClient, userId: string, …)`; **every** query filters `user_id`; `lib/body/*` must not import `lib/session.ts`, next-auth or next-intl.
- Prisma `Decimal` → `Number()` before returning; dates to strings (ISO instant / `YYYY-MM-DD`).
- No hardcoded UI strings: every user-visible string (incl. `aria-label`, placeholders) comes from `messages/en.json` + `messages/th.json` (same keys and ICU args — `i18n/messages.test.ts` enforces). Unit symbols (`kg`, `%`, `L`, `kcal`, `cm`) and report content (verdicts, assessment labels, advice) are not translated.
- Never format dates with `Intl` in a server-rendered client component; format on the server and pass strings (client-only UI that renders after user interaction is fine).
- Icons only from `@phosphor-icons/react/ssr`.
- Reuse `components/ui/*` primitives (`Card`, `StatCard`, `Badge`, `Button`, `IconButton`, `Input`, `Sheet`, `ConfirmDialog`, `EmptyState`, `PageSkeleton`).
- New pure test files go in `package.json` `test` **and** get an `--exclude` in `test:db`.
- Migration must be additive (expand/contract: prod runs `prisma migrate deploy` before the new code is live).
- ESLint only, no Prettier. Commit after each task with a message ending in
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Commands

```bash
npm test                                         # pure tests
DOTENV_CONFIG_PATH=.env.local npm run test:db    # DB tests (Docker Postgres "postgres" container must be up)
npx tsc --noEmit && npm run lint
npm run db:migrate                               # prisma migrate deploy (local)
```

## File Structure

| File | Responsibility |
|---|---|
| `lib/body/schema.ts` | Import JSON format (zod), metric/segment/goal key lists, parse helpers, goals input schema |
| `lib/body/fixtures.ts` | `sampleScan()` synthetic scan for tests |
| `lib/body/metrics.ts` | Units, good direction, deltas, goal progress, scan date, arboleaf goal suggestion |
| `lib/body/balance.ts` | Muscle group → body region, lean/training shares, L/R imbalance |
| `lib/body/service.ts` | Prisma reads/writes for scans, goals, set counts |
| `prisma/migrations/0003_body_scans/migration.sql` + `prisma/schema.prisma` | Tables |
| `lib/actions/body.ts` | Server actions: import, delete, save goals |
| `app/(app)/nav-items.ts`, `TopBar.tsx`, `AccountMenu.tsx` | Navigation |
| `app/(app)/body/page.tsx`, `loading.tsx` | Body hub page |
| `app/(app)/body/{LatestSnapshot,DeltaBadge,GoalProgress}.tsx` | Server-safe display pieces |
| `app/(app)/body/{ImportScanSheet,GoalsCard,TrendChart,TrendChartInner}.tsx` | Client pieces |
| `app/(app)/body/BalanceCard.tsx` | Balance vs training |
| `app/(app)/body/[scanId]/{page,loading,DeleteScanButton}.tsx` | Full report |
| `app/(app)/dashboard/BodyCard.tsx` | Dashboard card |
| `.claude/skills/arboleaf-to-json/SKILL.md` | How Claude Code turns a PDF into import JSON |

---

### Task 1: Import schema

**Files:**
- Create: `lib/body/schema.ts`, `lib/body/fixtures.ts`, `lib/body/schema.test.ts`
- Modify: `package.json` (`test`, `test:db` scripts)

**Interfaces:**
- Produces: `BODY_IMPORT_VERSION`, `SCAN_METRIC_KEYS`, `ScanMetricKey`, `SEGMENT_KEYS`, `SegmentKey`, `GOAL_METRICS`, `GoalMetric`, `FAT_GOAL_METRICS`, `BodySegment`, `BodySegments`, `BodyReport`, `bodyScanInputSchema`, `BodyScanInput`, `bodyImportFileSchema`, `BodyImportFile`, `BodyImportErrorCode = "invalidJson" | "invalidFile" | "unsupportedVersion"`, `BodyImportParse`, `parseBodyImport(raw: unknown): BodyImportParse`, `parseBodyImportText(text: string): BodyImportParse`, `bodyGoalsInputSchema`, `BodyGoalInput`; `sampleScan(overrides?: Partial<BodyScanInput>): BodyScanInput`.

- [ ] **Step 1: Write the fixture**

`lib/body/fixtures.ts`:

```ts
import type { BodyScanInput } from "./schema";

// A synthetic scan shaped like an arboleaf report (not a real person's numbers), for tests.
export function sampleScan(overrides: Partial<BodyScanInput> = {}): BodyScanInput {
  return {
    measured_at: "2026-10-18T09:58:00+07:00",
    weight_kg: 80,
    bmi: 24.7,
    body_fat_pct: 22,
    body_fat_kg: 17.6,
    skeletal_muscle_kg: 35,
    skeletal_muscle_pct: 43.8,
    muscle_mass_pct: 72.5,
    soft_lean_mass_kg: 58,
    fat_free_mass_kg: 62.4,
    body_water_l: 45.5,
    body_water_pct: 56.9,
    protein_kg: 12.4,
    protein_pct: 15.5,
    bone_mass_kg: 4,
    bone_mass_pct: 5,
    visceral_fat: 8,
    subcutaneous_fat_pct: 19.5,
    subcutaneous_fat_kg: 15.6,
    bmr_kcal: 1720,
    smi: 8.4,
    waist_hip_ratio: 0.9,
    fitness_score: 72,
    height_cm: 180,
    age: 35,
    segments: {
      left_arm: { lean_kg: 3.4, lean_pct: 98, lean_eval: "Sufficient", fat_kg: 0.9, fat_pct: 140, fat_eval: "Sufficient", muscle_ratio_pct: 4.3, fat_ratio_pct: 1.1 },
      right_arm: { lean_kg: 3.6, lean_pct: 101, lean_eval: "Sufficient", fat_kg: 0.9, fat_pct: 140, fat_eval: "Sufficient", muscle_ratio_pct: 4.5, fat_ratio_pct: 1.1 },
      trunk: { lean_kg: 28, lean_pct: 99, lean_eval: "Sufficient", fat_kg: 9, fat_pct: 200, fat_eval: "Over", muscle_ratio_pct: 35, fat_ratio_pct: 11.3 },
      left_leg: { lean_kg: 10, lean_pct: 103, lean_eval: "Sufficient", fat_kg: 2.7, fat_pct: 145, fat_eval: "Sufficient", muscle_ratio_pct: 12.5, fat_ratio_pct: 3.4 },
      right_leg: { lean_kg: 10.4, lean_pct: 104, lean_eval: "Sufficient", fat_kg: 2.7, fat_pct: 145, fat_eval: "Sufficient", muscle_ratio_pct: 13, fat_ratio_pct: 3.4 },
    },
    report: {
      ranges: { weight_kg: [60, 81], body_fat_pct: [10, 20], waist_hip_ratio: [null, 0.9] },
      evaluations: { body_fat_pct: "Mild obesity", bmi: "Normal" },
      assessments: { "Lower extremity balance": "Slightly uneven" },
      weight_control: { normal_weight_kg: 74, weight_kg: -6, fat_kg: -7, muscle_kg: 1 },
      advice: "Combine strength training with cardio.",
    },
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing tests**

`lib/body/schema.test.ts`:

```ts
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
```

- [ ] **Step 3: Register the test file and run it to verify it fails**

In `package.json`, append ` lib/body/schema.test.ts` to the end of the `"test"` script's file list (after `i18n/messages.test.ts`), and append ` --exclude lib/body/schema.test.ts` to the end of the `"test:db"` script (after `--exclude i18n/messages.test.ts`).

Run: `npx vitest run lib/body/schema.test.ts`
Expected: FAIL — `Cannot find module './schema'` (or similar).

- [ ] **Step 4: Implement the schema**

`lib/body/schema.ts`:

```ts
import { z } from "zod";

// Import format for body-composition scans. Claude Code reads a scale's PDF export and writes
// this JSON (see .claude/skills/arboleaf-to-json); the /body page validates it with this schema
// on the client (preview) and again in the server action. Keys are the body_scans column names.

export const BODY_IMPORT_VERSION = 1;

// Every numeric metric column on body_scans, in report order.
export const SCAN_METRIC_KEYS = [
  "weight_kg",
  "bmi",
  "body_fat_pct",
  "body_fat_kg",
  "skeletal_muscle_kg",
  "skeletal_muscle_pct",
  "muscle_mass_pct",
  "soft_lean_mass_kg",
  "fat_free_mass_kg",
  "body_water_l",
  "body_water_pct",
  "protein_kg",
  "protein_pct",
  "bone_mass_kg",
  "bone_mass_pct",
  "visceral_fat",
  "subcutaneous_fat_pct",
  "subcutaneous_fat_kg",
  "bmr_kcal",
  "smi",
  "waist_hip_ratio",
  "fitness_score",
  "height_cm",
  "age",
] as const;
export type ScanMetricKey = (typeof SCAN_METRIC_KEYS)[number];

export const SEGMENT_KEYS = ["left_arm", "right_arm", "trunk", "left_leg", "right_leg"] as const;
export type SegmentKey = (typeof SEGMENT_KEYS)[number];

// Metrics a goal can target. A user has at most one of the two fat metrics as a goal.
export const GOAL_METRICS = ["weight_kg", "body_fat_pct", "body_fat_kg", "skeletal_muscle_kg"] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];
export const FAT_GOAL_METRICS: readonly GoalMetric[] = ["body_fat_pct", "body_fat_kg"];

const num = z.number();
// Missing and null both mean "the scale didn't report it".
const optNum = num.nullable().optional();
const optText = z.string().nullable().optional();

const segmentSchema = z.object({
  lean_kg: optNum,
  lean_pct: optNum,
  lean_eval: optText,
  fat_kg: optNum,
  fat_pct: optNum,
  fat_eval: optText,
  muscle_ratio_pct: optNum,
  fat_ratio_pct: optNum,
});
export type BodySegment = z.infer<typeof segmentSchema>;

const segmentsSchema = z.object({
  left_arm: segmentSchema.optional(),
  right_arm: segmentSchema.optional(),
  trunk: segmentSchema.optional(),
  left_leg: segmentSchema.optional(),
  right_leg: segmentSchema.optional(),
});
export type BodySegments = z.infer<typeof segmentsSchema>;

const reportSchema = z.object({
  // Normal range per metric key; an open end is null ("<=0.9" -> [null, 0.9]).
  ranges: z.record(z.string(), z.tuple([num.nullable(), num.nullable()])).optional(),
  // The report's verdict per metric key, verbatim (e.g. { body_fat_pct: "Mild obesity" }).
  evaluations: z.record(z.string(), z.string()).optional(),
  // The report's other checklist rows, its own label -> verdict (e.g. body balance/strength).
  assessments: z.record(z.string(), z.string()).optional(),
  // arboleaf "Weight Control": the signed change it suggests for each.
  weight_control: z
    .object({ normal_weight_kg: optNum, weight_kg: optNum, fat_kg: optNum, muscle_kg: optNum })
    .optional(),
  advice: z.string().optional(),
});
export type BodyReport = z.infer<typeof reportSchema>;

export const bodyScanInputSchema = z.object({
  // Scan time with its UTC offset ("2026-10-18T09:58:00+07:00") or Z; naive times are rejected
  // because they'd be read in whatever zone the server runs in.
  measured_at: z.iso.datetime({ offset: true }),
  weight_kg: num.positive(),
  bmi: optNum,
  body_fat_pct: optNum,
  body_fat_kg: optNum,
  skeletal_muscle_kg: optNum,
  skeletal_muscle_pct: optNum,
  muscle_mass_pct: optNum,
  soft_lean_mass_kg: optNum,
  fat_free_mass_kg: optNum,
  body_water_l: optNum,
  body_water_pct: optNum,
  protein_kg: optNum,
  protein_pct: optNum,
  bone_mass_kg: optNum,
  bone_mass_pct: optNum,
  visceral_fat: optNum,
  subcutaneous_fat_pct: optNum,
  subcutaneous_fat_kg: optNum,
  bmr_kcal: optNum,
  smi: optNum,
  waist_hip_ratio: optNum,
  fitness_score: optNum,
  height_cm: optNum,
  age: optNum,
  segments: segmentsSchema.nullable().optional(),
  report: reportSchema.nullable().optional(),
});
export type BodyScanInput = z.infer<typeof bodyScanInputSchema>;

export const bodyImportFileSchema = z.object({
  version: z.literal(BODY_IMPORT_VERSION),
  source: z.string().trim().min(1).max(50).default("arboleaf"),
  scans: z.array(bodyScanInputSchema).min(1).max(500),
});
export type BodyImportFile = z.infer<typeof bodyImportFileSchema>;

export type BodyImportErrorCode = "invalidJson" | "invalidFile" | "unsupportedVersion";
export type BodyImportParse = { ok: true; data: BodyImportFile } | { ok: false; code: BodyImportErrorCode };

export function parseBodyImport(raw: unknown): BodyImportParse {
  // Only a version that's present but different is "unsupported"; a file with no version at all
  // isn't one of ours.
  const version = typeof raw === "object" && raw !== null ? (raw as { version?: unknown }).version : undefined;
  if (version !== undefined && version !== BODY_IMPORT_VERSION) return { ok: false, code: "unsupportedVersion" };
  const parsed = bodyImportFileSchema.safeParse(raw);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, code: "invalidFile" };
}

export function parseBodyImportText(text: string): BodyImportParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, code: "invalidJson" };
  }
  return parseBodyImport(raw);
}

export const bodyGoalsInputSchema = z
  .array(z.object({ metric: z.enum(GOAL_METRICS), target: num.positive() }))
  .max(3)
  .refine((goals) => new Set(goals.map((g) => g.metric)).size === goals.length, "duplicateMetric")
  .refine((goals) => goals.filter((g) => FAT_GOAL_METRICS.includes(g.metric)).length <= 1, "oneFatGoal");
export type BodyGoalInput = z.infer<typeof bodyGoalsInputSchema>[number];
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/body/schema.test.ts && npm test`
Expected: PASS (all files, including the new one).

- [ ] **Step 6: Commit**

```bash
git add lib/body/schema.ts lib/body/fixtures.ts lib/body/schema.test.ts package.json
git commit -m "feat(body): body-scan import JSON schema

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Metric helpers

**Files:**
- Create: `lib/body/metrics.ts`, `lib/body/metrics.test.ts`
- Modify: `package.json` (`test`, `test:db`)

**Interfaces:**
- Consumes: `ScanMetricKey`, `GoalMetric`, `BodyReport` from `lib/body/schema.ts`; `getTodayString(now?: Date, timeZone?: string): string` from `lib/date.ts`.
- Produces: `METRIC_UNITS: Record<ScanMetricKey, string>`, `type Direction = "up" | "down"`, `goodDirection(metric: ScanMetricKey): Direction | null`, `type DeltaTone = "success" | "danger" | "neutral"`, `deltaTone(metric: ScanMetricKey, delta: number | null): DeltaTone`, `scanDelta(current: number | null, previous: number | null): number | null`, `goalProgress(start: number, target: number, current: number): number`, `toScanDateString(measuredAt: Date): string`, `suggestedGoalTargets(scan: { weight_kg: number | null; body_fat_kg: number | null; skeletal_muscle_kg: number | null; report: BodyReport | null }): Partial<Record<GoalMetric, number>>`.

- [ ] **Step 1: Write the failing tests**

`lib/body/metrics.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  deltaTone,
  goalProgress,
  goodDirection,
  scanDelta,
  suggestedGoalTargets,
  toScanDateString,
} from "./metrics";

describe("goodDirection / deltaTone", () => {
  it("treats fat going down and muscle going up as progress", () => {
    expect(goodDirection("body_fat_pct")).toBe("down");
    expect(goodDirection("skeletal_muscle_kg")).toBe("up");
    expect(deltaTone("body_fat_pct", -0.5)).toBe("success");
    expect(deltaTone("body_fat_pct", 0.5)).toBe("danger");
    expect(deltaTone("skeletal_muscle_kg", 0.3)).toBe("success");
  });

  it("is neutral for weight (the goal decides), zero and missing deltas", () => {
    expect(goodDirection("weight_kg")).toBeNull();
    expect(deltaTone("weight_kg", -1)).toBe("neutral");
    expect(deltaTone("body_fat_pct", 0)).toBe("neutral");
    expect(deltaTone("body_fat_pct", null)).toBe("neutral");
  });
});

describe("scanDelta", () => {
  it("rounds to 2 decimals and is null when a side is missing", () => {
    expect(scanDelta(74.15, 74.6)).toBe(-0.45);
    expect(scanDelta(32.11, 31.9)).toBe(0.21);
    expect(scanDelta(null, 70)).toBeNull();
    expect(scanDelta(70, null)).toBeNull();
  });
});

describe("goalProgress", () => {
  it("works for goals in either direction", () => {
    expect(goalProgress(80, 70, 75)).toBe(50); // losing weight
    expect(goalProgress(32, 34, 33)).toBe(50); // gaining muscle
  });

  it("clamps to 0–100", () => {
    expect(goalProgress(80, 70, 82)).toBe(0);
    expect(goalProgress(80, 70, 68)).toBe(100);
  });

  it("is 100 when start already equals target", () => {
    expect(goalProgress(70, 70, 71)).toBe(100);
  });
});

describe("toScanDateString", () => {
  it("returns the Bangkok calendar day, not the UTC one", () => {
    expect(toScanDateString(new Date("2026-10-17T23:00:00Z"))).toBe("2026-10-18");
    expect(toScanDateString(new Date("2026-10-18T09:58:00+07:00"))).toBe("2026-10-18");
  });
});

describe("suggestedGoalTargets", () => {
  it("applies arboleaf's weight control to the current values", () => {
    expect(
      suggestedGoalTargets({
        weight_kg: 74.15,
        body_fat_kg: 17.2,
        skeletal_muscle_kg: 32.11,
        report: { weight_control: { normal_weight_kg: 69.59, weight_kg: -4.56, fat_kg: -6.77, muscle_kg: 2.2 } },
      })
    ).toEqual({ weight_kg: 69.59, body_fat_kg: 10.43, skeletal_muscle_kg: 34.31 });
  });

  it("skips targets it can't compute", () => {
    expect(suggestedGoalTargets({ weight_kg: 80, body_fat_kg: null, skeletal_muscle_kg: 35, report: null })).toEqual({});
    expect(
      suggestedGoalTargets({ weight_kg: 80, body_fat_kg: null, skeletal_muscle_kg: 35, report: { weight_control: { weight_kg: -2 } } })
    ).toEqual({ weight_kg: 78 });
  });
});
```

- [ ] **Step 2: Register and run to verify it fails**

`package.json`: append ` lib/body/metrics.test.ts` to `"test"` and ` --exclude lib/body/metrics.test.ts` to `"test:db"`.

Run: `npx vitest run lib/body/metrics.test.ts`
Expected: FAIL — cannot find module `./metrics`.

- [ ] **Step 3: Implement**

`lib/body/metrics.ts`:

```ts
import { getTodayString } from "@/lib/date";
import type { BodyReport, GoalMetric, ScanMetricKey } from "./schema";

// Unit symbol shown after each metric's value (symbols, so not translated). Empty = unitless.
export const METRIC_UNITS: Record<ScanMetricKey, string> = {
  weight_kg: "kg",
  bmi: "",
  body_fat_pct: "%",
  body_fat_kg: "kg",
  skeletal_muscle_kg: "kg",
  skeletal_muscle_pct: "%",
  muscle_mass_pct: "%",
  soft_lean_mass_kg: "kg",
  fat_free_mass_kg: "kg",
  body_water_l: "L",
  body_water_pct: "%",
  protein_kg: "kg",
  protein_pct: "%",
  bone_mass_kg: "kg",
  bone_mass_pct: "%",
  visceral_fat: "",
  subcutaneous_fat_pct: "%",
  subcutaneous_fat_kg: "kg",
  bmr_kcal: "kcal",
  smi: "",
  waist_hip_ratio: "",
  fitness_score: "",
  height_cm: "cm",
  age: "",
};

export type Direction = "up" | "down";

const LOWER_IS_BETTER = new Set<ScanMetricKey>([
  "body_fat_pct",
  "body_fat_kg",
  "visceral_fat",
  "subcutaneous_fat_pct",
  "subcutaneous_fat_kg",
  "waist_hip_ratio",
]);
const HIGHER_IS_BETTER = new Set<ScanMetricKey>([
  "skeletal_muscle_kg",
  "skeletal_muscle_pct",
  "muscle_mass_pct",
  "soft_lean_mass_kg",
  "fat_free_mass_kg",
  "smi",
  "fitness_score",
]);

// Which way a change counts as progress. Weight (and descriptive values like height) has no
// inherent direction — the user's goal decides — so it's null.
export function goodDirection(metric: ScanMetricKey): Direction | null {
  if (LOWER_IS_BETTER.has(metric)) return "down";
  if (HIGHER_IS_BETTER.has(metric)) return "up";
  return null;
}

export type DeltaTone = "success" | "danger" | "neutral";

export function deltaTone(metric: ScanMetricKey, delta: number | null): DeltaTone {
  const direction = goodDirection(metric);
  if (delta === null || delta === 0 || direction === null) return "neutral";
  return delta > 0 === (direction === "up") ? "success" : "danger";
}

const round2 = (value: number) => Math.round(value * 100) / 100;

// current − previous, rounded to 2 decimals; null when either side is missing.
export function scanDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return round2(current - previous);
}

// How far from start to target the current value is, 0–100 (overshooting counts as 100, moving
// the wrong way as 0). Works for goals in either direction.
export function goalProgress(start: number, target: number, current: number): number {
  if (target === start) return 100;
  const pct = ((current - start) / (target - start)) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)));
}

// The calendar day (YYYY-MM-DD) a scan was taken on, in the app's TIME_ZONE.
export function toScanDateString(measuredAt: Date): string {
  return getTodayString(measuredAt);
}

// arboleaf's "Weight Control" applied to the scan's own values, as goal targets. Its muscle
// figure is applied to skeletal muscle (the report doesn't say which muscle measure it means).
export function suggestedGoalTargets(scan: {
  weight_kg: number | null;
  body_fat_kg: number | null;
  skeletal_muscle_kg: number | null;
  report: BodyReport | null;
}): Partial<Record<GoalMetric, number>> {
  const control = scan.report?.weight_control;
  const targets: Partial<Record<GoalMetric, number>> = {};
  if (!control) return targets;
  const add = (metric: GoalMetric, base: number | null, change: number | null | undefined) => {
    if (base !== null && change !== null && change !== undefined) targets[metric] = round2(base + change);
  };
  add("weight_kg", scan.weight_kg, control.weight_kg);
  add("body_fat_kg", scan.body_fat_kg, control.fat_kg);
  add("skeletal_muscle_kg", scan.skeletal_muscle_kg, control.muscle_kg);
  return targets;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/body/metrics.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/body/metrics.ts lib/body/metrics.test.ts package.json
git commit -m "feat(body): metric deltas, goal progress and arboleaf goal suggestion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Balance helpers

**Files:**
- Create: `lib/body/balance.ts`, `lib/body/balance.test.ts`
- Modify: `package.json` (`test`, `test:db`)

**Interfaces:**
- Consumes: `BodySegments` from `lib/body/schema.ts`.
- Produces: `BODY_REGIONS = ["arms", "trunk", "legs"]`, `BodyRegion`, `RegionShare = Record<BodyRegion, number>`, `regionForMuscleGroup(group: string | null): BodyRegion | null`, `trainingShare(counts: { muscle_group: string | null; sets: number }[]): RegionShare | null`, `leanShare(segments: BodySegments | null): RegionShare | null`, `limbImbalancePct(left: number | null | undefined, right: number | null | undefined): number | null`.

- [ ] **Step 1: Write the failing tests**

`lib/body/balance.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sampleScan } from "./fixtures";
import { leanShare, limbImbalancePct, regionForMuscleGroup, trainingShare } from "./balance";

describe("regionForMuscleGroup", () => {
  it("maps each muscle group onto the scale's segments", () => {
    expect(regionForMuscleGroup("Arms")).toBe("arms");
    expect(regionForMuscleGroup("Legs")).toBe("legs");
    for (const group of ["Chest", "Back", "Shoulders", "Core"]) expect(regionForMuscleGroup(group)).toBe("trunk");
    expect(regionForMuscleGroup(null)).toBeNull();
    expect(regionForMuscleGroup("Cardio")).toBeNull();
  });
});

describe("trainingShare", () => {
  it("returns % of working sets per region, ignoring unmapped groups", () => {
    expect(
      trainingShare([
        { muscle_group: "Chest", sets: 10 },
        { muscle_group: "Back", sets: 10 },
        { muscle_group: "Arms", sets: 5 },
        { muscle_group: "Legs", sets: 25 },
        { muscle_group: null, sets: 40 },
      ])
    ).toEqual({ arms: 10, trunk: 40, legs: 50 });
  });

  it("is null with no mapped sets", () => {
    expect(trainingShare([])).toBeNull();
    expect(trainingShare([{ muscle_group: null, sets: 3 }])).toBeNull();
  });
});

describe("leanShare", () => {
  it("returns % of segmental lean mass per region", () => {
    // arms 3.4 + 3.6 = 7, trunk 28, legs 10 + 10.4 = 20.4 → of 55.4
    expect(leanShare(sampleScan().segments ?? null)).toEqual({ arms: 13, trunk: 51, legs: 37 });
  });

  it("is null unless all five segments have lean mass", () => {
    expect(leanShare(null)).toBeNull();
    const segments = sampleScan().segments!;
    expect(leanShare({ ...segments, trunk: { ...segments.trunk, lean_kg: null } })).toBeNull();
  });
});

describe("limbImbalancePct", () => {
  it("is |L − R| as % of the larger side", () => {
    expect(limbImbalancePct(3.1, 3.3)).toBe(6.1);
    expect(limbImbalancePct(9.6, 9.6)).toBe(0);
  });

  it("is null when a side is missing or both are zero", () => {
    expect(limbImbalancePct(null, 3)).toBeNull();
    expect(limbImbalancePct(3, undefined)).toBeNull();
    expect(limbImbalancePct(0, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Register and run to verify it fails**

`package.json`: append ` lib/body/balance.test.ts` to `"test"` and ` --exclude lib/body/balance.test.ts` to `"test:db"`.

Run: `npx vitest run lib/body/balance.test.ts`
Expected: FAIL — cannot find module `./balance`.

- [ ] **Step 3: Implement**

`lib/body/balance.ts`:

```ts
import type { BodySegments } from "./schema";

export const BODY_REGIONS = ["arms", "trunk", "legs"] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];
export type RegionShare = Record<BodyRegion, number>;

// Where a muscle group's training lands on the scale's five segments. Chest, back, shoulders and
// core all sit on the trunk segment. Sets aren't sided, so there's no left/right mapping.
export function regionForMuscleGroup(group: string | null): BodyRegion | null {
  switch (group) {
    case "Arms":
      return "arms";
    case "Legs":
      return "legs";
    case "Chest":
    case "Back":
    case "Shoulders":
    case "Core":
      return "trunk";
    default:
      return null;
  }
}

function toShares(totals: RegionShare): RegionShare | null {
  const sum = totals.arms + totals.trunk + totals.legs;
  if (sum <= 0) return null;
  const pct = (value: number) => Math.round((value / sum) * 100);
  return { arms: pct(totals.arms), trunk: pct(totals.trunk), legs: pct(totals.legs) };
}

// % of working sets per region. Exercises with no (or an unknown) muscle group are left out.
export function trainingShare(counts: { muscle_group: string | null; sets: number }[]): RegionShare | null {
  const totals: RegionShare = { arms: 0, trunk: 0, legs: 0 };
  for (const { muscle_group, sets } of counts) {
    const region = regionForMuscleGroup(muscle_group);
    if (region) totals[region] += sets;
  }
  return toShares(totals);
}

// % of segmental lean mass per region; null unless all five segments report lean mass.
export function leanShare(segments: BodySegments | null): RegionShare | null {
  const lean = (key: keyof BodySegments) => segments?.[key]?.lean_kg ?? null;
  const parts = [lean("left_arm"), lean("right_arm"), lean("trunk"), lean("left_leg"), lean("right_leg")];
  if (parts.some((part) => part === null)) return null;
  const [leftArm, rightArm, trunk, leftLeg, rightLeg] = parts as number[];
  return toShares({ arms: leftArm + rightArm, trunk, legs: leftLeg + rightLeg });
}

// |left − right| as a % of the larger side, 1 decimal.
export function limbImbalancePct(
  left: number | null | undefined,
  right: number | null | undefined
): number | null {
  if (left === null || left === undefined || right === null || right === undefined) return null;
  const larger = Math.max(left, right);
  if (larger <= 0) return null;
  return Math.round((Math.abs(left - right) / larger) * 1000) / 10;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/body/balance.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/body/balance.ts lib/body/balance.test.ts package.json
git commit -m "feat(body): lean-mass vs training region shares

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Tables + scan service

**Files:**
- Create: `prisma/migrations/0003_body_scans/migration.sql`, `lib/body/service.ts`, `lib/body/service.test.ts`
- Modify: `prisma/schema.prisma` (append two models)

**Interfaces:**
- Consumes: Task 1 schema exports, `toScanDateString` (Task 2), `sampleScan` (Task 1).
- Produces (in `lib/body/service.ts`):
  - `type BodyScan = { id: string; measured_at: string; scan_date: string; source: string; segments: BodySegments | null; report: BodyReport | null } & Record<ScanMetricKey, number | null>` (`measured_at` = ISO instant, `scan_date` = `YYYY-MM-DD` in TIME_ZONE)
  - `type BodySummary = { latest: BodyScan; previous: BodyScan | null }`
  - `class BodyImportError extends Error { code: BodyImportErrorCode }`
  - `importBodyScansForUser(db, userId, raw: unknown): Promise<{ imported: number; replaced: number }>`
  - `listBodyScans(db, userId): Promise<BodyScan[]>` (oldest first)
  - `getBodyScan(db, userId, scanId: string): Promise<BodyScan | null>`
  - `deleteBodyScanForUser(db, userId, scanId: string): Promise<void>` (throws if not found/not owned)
  - `getLatestBodySummary(db, userId): Promise<BodySummary | null>`

- [ ] **Step 1: Write the migration (hand-written — do NOT use `prisma migrate dev`)**

`prisma migrate dev` would diff against `schema.prisma`, where the `users` FKs aren't modeled, and try to drop them. Write the SQL by hand and apply it with `migrate deploy`.

`prisma/migrations/0003_body_scans/migration.sql`:

```sql
-- Body-composition scans imported from a smart scale (lib/body/schema.ts) and per-metric goals.
-- Additive only. Metric columns mirror SCAN_METRIC_KEYS; segments/report hold the rest of the
-- report as JSON validated by the app.
CREATE TABLE public.body_scans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    measured_at timestamp(6) with time zone NOT NULL,
    source text DEFAULT 'arboleaf'::text NOT NULL,
    weight_kg numeric(7,2) NOT NULL,
    bmi numeric(7,2),
    body_fat_pct numeric(7,2),
    body_fat_kg numeric(7,2),
    skeletal_muscle_kg numeric(7,2),
    skeletal_muscle_pct numeric(7,2),
    muscle_mass_pct numeric(7,2),
    soft_lean_mass_kg numeric(7,2),
    fat_free_mass_kg numeric(7,2),
    body_water_l numeric(7,2),
    body_water_pct numeric(7,2),
    protein_kg numeric(7,2),
    protein_pct numeric(7,2),
    bone_mass_kg numeric(7,2),
    bone_mass_pct numeric(7,2),
    visceral_fat numeric(7,2),
    subcutaneous_fat_pct numeric(7,2),
    subcutaneous_fat_kg numeric(7,2),
    bmr_kcal numeric(7,2),
    smi numeric(7,2),
    waist_hip_ratio numeric(7,2),
    fitness_score numeric(7,2),
    height_cm numeric(7,2),
    age numeric(7,2),
    segments jsonb,
    report jsonb,
    created_at timestamp(6) with time zone DEFAULT now() NOT NULL,
    CONSTRAINT body_scans_pkey PRIMARY KEY (id),
    CONSTRAINT body_scans_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX body_scans_user_id_measured_at_key ON public.body_scans USING btree (user_id, measured_at);

CREATE TABLE public.body_goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    metric text NOT NULL,
    target numeric(7,2) NOT NULL,
    start_value numeric(7,2) NOT NULL,
    created_at timestamp(6) with time zone DEFAULT now() NOT NULL,
    CONSTRAINT body_goals_pkey PRIMARY KEY (id),
    CONSTRAINT body_goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT body_goals_metric_check CHECK (metric IN ('weight_kg', 'body_fat_pct', 'body_fat_kg', 'skeletal_muscle_kg'))
);

CREATE UNIQUE INDEX body_goals_user_id_metric_key ON public.body_goals USING btree (user_id, metric);
```

- [ ] **Step 2: Add the models to `prisma/schema.prisma`** (append at the end of the file)

```prisma
// Body-composition scans (see lib/body/schema.ts). Metric columns mirror SCAN_METRIC_KEYS;
// segments/report are validated JSON. One row per (user, measured_at): re-imports replace it.
model body_scans {
  id                   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id              String   @db.Uuid
  measured_at          DateTime @db.Timestamptz(6)
  source               String   @default("arboleaf")
  weight_kg            Decimal  @db.Decimal(7, 2)
  bmi                  Decimal? @db.Decimal(7, 2)
  body_fat_pct         Decimal? @db.Decimal(7, 2)
  body_fat_kg          Decimal? @db.Decimal(7, 2)
  skeletal_muscle_kg   Decimal? @db.Decimal(7, 2)
  skeletal_muscle_pct  Decimal? @db.Decimal(7, 2)
  muscle_mass_pct      Decimal? @db.Decimal(7, 2)
  soft_lean_mass_kg    Decimal? @db.Decimal(7, 2)
  fat_free_mass_kg     Decimal? @db.Decimal(7, 2)
  body_water_l         Decimal? @db.Decimal(7, 2)
  body_water_pct       Decimal? @db.Decimal(7, 2)
  protein_kg           Decimal? @db.Decimal(7, 2)
  protein_pct          Decimal? @db.Decimal(7, 2)
  bone_mass_kg         Decimal? @db.Decimal(7, 2)
  bone_mass_pct        Decimal? @db.Decimal(7, 2)
  visceral_fat         Decimal? @db.Decimal(7, 2)
  subcutaneous_fat_pct Decimal? @db.Decimal(7, 2)
  subcutaneous_fat_kg  Decimal? @db.Decimal(7, 2)
  bmr_kcal             Decimal? @db.Decimal(7, 2)
  smi                  Decimal? @db.Decimal(7, 2)
  waist_hip_ratio      Decimal? @db.Decimal(7, 2)
  fitness_score        Decimal? @db.Decimal(7, 2)
  height_cm            Decimal? @db.Decimal(7, 2)
  age                  Decimal? @db.Decimal(7, 2)
  segments             Json?
  report               Json?
  created_at           DateTime @default(now()) @db.Timestamptz(6)

  @@unique([user_id, measured_at])
}

// Up to one goal per metric per user; start_value is the latest scan's value when the goal was
// first set (kept when only the target changes).
model body_goals {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id     String   @db.Uuid
  metric      String
  target      Decimal  @db.Decimal(7, 2)
  start_value Decimal  @db.Decimal(7, 2)
  created_at  DateTime @default(now()) @db.Timestamptz(6)

  @@unique([user_id, metric])
}
```

- [ ] **Step 3: Apply and regenerate**

Run: `npm run db:migrate && npx prisma generate && npx prisma migrate status`
Expected: `0003_body_scans` applied; status "Database schema is up to date!".

- [ ] **Step 4: Write the failing DB tests**

`lib/body/service.test.ts`:

```ts
import "dotenv/config";
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser } from "@/lib/test-helpers";
import { sampleScan } from "./fixtures";
import {
  BodyImportError,
  deleteBodyScanForUser,
  getBodyScan,
  getLatestBodySummary,
  importBodyScansForUser,
  listBodyScans,
} from "./service";

const file = (...scans: unknown[]) => ({ version: 1, source: "arboleaf", scans });

describe("body scans service", () => {
  it("imports scans and lists them oldest first, as numbers with the Bangkok scan date", async () => {
    const { userId } = await createTestUser();
    const result = await importBodyScansForUser(
      prisma,
      userId,
      file(sampleScan(), sampleScan({ measured_at: "2026-10-11T06:30:00+07:00", weight_kg: 81.2 }))
    );
    expect(result).toEqual({ imported: 2, replaced: 0 });

    const scans = await listBodyScans(prisma, userId);
    expect(scans.map((s) => s.weight_kg)).toEqual([81.2, 80]);
    expect(scans[1]).toMatchObject({
      measured_at: "2026-10-18T02:58:00.000Z",
      scan_date: "2026-10-18",
      source: "arboleaf",
      body_fat_pct: 22,
      bmr_kcal: 1720,
    });
    expect(scans[1].segments?.left_arm?.lean_kg).toBe(3.4);
    expect(scans[1].report?.weight_control?.fat_kg).toBe(-7);
  });

  it("dates an early-morning scan by its Bangkok day", async () => {
    const { userId } = await createTestUser();
    await importBodyScansForUser(prisma, userId, file(sampleScan({ measured_at: "2026-10-18T06:00:00+07:00" })));
    const [scan] = await listBodyScans(prisma, userId);
    expect(scan.scan_date).toBe("2026-10-18");
  });

  it("re-importing the same measured_at replaces the scan, clearing fields left out", async () => {
    const { userId } = await createTestUser();
    await importBodyScansForUser(prisma, userId, file(sampleScan()));
    const result = await importBodyScansForUser(
      prisma,
      userId,
      file({ measured_at: "2026-10-18T02:58:00Z", weight_kg: 79.5 })
    );
    expect(result).toEqual({ imported: 1, replaced: 1 });

    const scans = await listBodyScans(prisma, userId);
    expect(scans).toHaveLength(1);
    expect(scans[0]).toMatchObject({ weight_kg: 79.5, bmi: null, segments: null, report: null });
  });

  it("rejects bad files with a translatable code", async () => {
    const { userId } = await createTestUser();
    await expect(importBodyScansForUser(prisma, userId, { version: 2, scans: [] })).rejects.toMatchObject({
      code: "unsupportedVersion",
    });
    await expect(
      importBodyScansForUser(prisma, userId, file({ measured_at: "2026-10-18T09:58:00", weight_kg: 80 }))
    ).rejects.toBeInstanceOf(BodyImportError);
    expect(await listBodyScans(prisma, userId)).toEqual([]);
  });

  it("returns null for a malformed or unknown id", async () => {
    const { userId } = await createTestUser();
    expect(await getBodyScan(prisma, userId, "not-a-uuid")).toBeNull();
    expect(await getBodyScan(prisma, userId, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  // Isolation: replaces the RLS guarantee now that queries run on a direct connection.
  it("never reads, replaces or deletes another user's scan", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await importBodyScansForUser(prisma, b.userId, file(sampleScan()));
    const [theirs] = await listBodyScans(prisma, b.userId);

    expect(await listBodyScans(prisma, a.userId)).toEqual([]);
    expect(await getBodyScan(prisma, a.userId, theirs.id)).toBeNull();
    expect(await getLatestBodySummary(prisma, a.userId)).toBeNull();
    await expect(deleteBodyScanForUser(prisma, a.userId, theirs.id)).rejects.toThrow();

    // Same measured_at from A creates A's own row and leaves B's untouched.
    const result = await importBodyScansForUser(prisma, a.userId, file(sampleScan({ weight_kg: 60 })));
    expect(result.replaced).toBe(0);
    expect((await getBodyScan(prisma, b.userId, theirs.id))?.weight_kg).toBe(80);

    await deleteBodyScanForUser(prisma, b.userId, theirs.id);
    expect(await listBodyScans(prisma, b.userId)).toEqual([]);
    expect(await listBodyScans(prisma, a.userId)).toHaveLength(1);
  });

  it("summarizes the latest scan and the one before it", async () => {
    const { userId } = await createTestUser();
    expect(await getLatestBodySummary(prisma, userId)).toBeNull();

    await importBodyScansForUser(prisma, userId, file(sampleScan({ measured_at: "2026-10-01T07:00:00+07:00", weight_kg: 82 })));
    expect(await getLatestBodySummary(prisma, userId)).toMatchObject({ latest: { weight_kg: 82 }, previous: null });

    await importBodyScansForUser(prisma, userId, file(sampleScan()));
    expect(await getLatestBodySummary(prisma, userId)).toMatchObject({
      latest: { weight_kg: 80 },
      previous: { weight_kg: 82 },
    });
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `DOTENV_CONFIG_PATH=.env.local npx vitest run --config vitest.db.config.ts lib/body/service.test.ts`
Expected: FAIL — cannot find module `./service`.

- [ ] **Step 6: Implement the service**

`lib/body/service.ts`:

```ts
import { Prisma, type PrismaClient, type body_scans } from "@prisma/client";
import { z } from "zod";
import { toScanDateString } from "./metrics";
import {
  SCAN_METRIC_KEYS,
  parseBodyImport,
  type BodyImportErrorCode,
  type BodyReport,
  type BodyScanInput,
  type BodySegments,
  type ScanMetricKey,
} from "./schema";

export type BodyScan = {
  id: string;
  // ISO instant.
  measured_at: string;
  // YYYY-MM-DD in TIME_ZONE.
  scan_date: string;
  source: string;
  segments: BodySegments | null;
  report: BodyReport | null;
} & Record<ScanMetricKey, number | null>;

export type BodySummary = { latest: BodyScan; previous: BodyScan | null };

// A rejected import file. `code` is what the UI translates (errors.body.*); `message` stays
// English for logs.
export class BodyImportError extends Error {
  constructor(
    public readonly code: BodyImportErrorCode,
    message: string
  ) {
    super(message);
    this.name = "BodyImportError";
  }
}

function toBodyScan(row: body_scans): BodyScan {
  const metrics = {} as Record<ScanMetricKey, number | null>;
  for (const key of SCAN_METRIC_KEYS) {
    const value = row[key];
    metrics[key] = value === null ? null : Number(value);
  }
  return {
    id: row.id,
    measured_at: row.measured_at.toISOString(),
    scan_date: toScanDateString(row.measured_at),
    source: row.source,
    // Validated by bodyScanInputSchema on the way in.
    segments: (row.segments as BodySegments | null) ?? null,
    report: (row.report as BodyReport | null) ?? null,
    ...metrics,
  };
}

// Every metric column, null when the scan omits it — so a re-import fully replaces the row.
function metricData(scan: BodyScanInput) {
  const data = {} as Record<ScanMetricKey, number | null>;
  for (const key of SCAN_METRIC_KEYS) data[key] = scan[key] ?? null;
  return { ...data, weight_kg: scan.weight_kg };
}

// Upserts every scan in the file by (user_id, measured_at) in one transaction: re-importing a
// scan replaces it (that's how a misread value gets fixed). `replaced` counts rows that existed.
export async function importBodyScansForUser(
  db: PrismaClient,
  userId: string,
  raw: unknown
): Promise<{ imported: number; replaced: number }> {
  const parsed = parseBodyImport(raw);
  if (!parsed.ok) throw new BodyImportError(parsed.code, `Invalid body-scan import (${parsed.code})`);
  const { source, scans } = parsed.data;

  return db.$transaction(
    async (tx) => {
      const replaced = await tx.body_scans.count({
        where: { user_id: userId, measured_at: { in: scans.map((s) => new Date(s.measured_at)) } },
      });
      for (const scan of scans) {
        const measuredAt = new Date(scan.measured_at);
        const data = {
          source,
          ...metricData(scan),
          // Prisma needs DbNull (not null) to write SQL NULL into a Json? column.
          segments: (scan.segments ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
          report: (scan.report ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
        };
        await tx.body_scans.upsert({
          where: { user_id_measured_at: { user_id: userId, measured_at: measuredAt } },
          create: { user_id: userId, measured_at: measuredAt, ...data },
          update: data,
        });
      }
      return { imported: scans.length, replaced };
    },
    { timeout: 30_000 }
  );
}

// Oldest first (chart order); the history list reverses it.
export async function listBodyScans(db: PrismaClient, userId: string): Promise<BodyScan[]> {
  const rows = await db.body_scans.findMany({ where: { user_id: userId }, orderBy: { measured_at: "asc" } });
  return rows.map(toBodyScan);
}

export async function getBodyScan(db: PrismaClient, userId: string, scanId: string): Promise<BodyScan | null> {
  // A malformed id in the URL is a 404, not a Prisma error.
  if (!z.uuid().safeParse(scanId).success) return null;
  const row = await db.body_scans.findFirst({ where: { id: scanId, user_id: userId } });
  return row ? toBodyScan(row) : null;
}

export async function deleteBodyScanForUser(db: PrismaClient, userId: string, scanId: string): Promise<void> {
  // Scoped by user_id; count === 0 means it doesn't exist or isn't theirs.
  const result = await db.body_scans.deleteMany({ where: { id: scanId, user_id: userId } });
  if (result.count === 0) throw new Error("Body scan not found or not owned by user");
}

export async function getLatestBodySummary(db: PrismaClient, userId: string): Promise<BodySummary | null> {
  const rows = await db.body_scans.findMany({
    where: { user_id: userId },
    orderBy: { measured_at: "desc" },
    take: 2,
  });
  if (rows.length === 0) return null;
  return { latest: toBodyScan(rows[0]), previous: rows[1] ? toBodyScan(rows[1]) : null };
}
```

If `tsc` rejects the `segments`/`report` casts, use `scan.segments ? (scan.segments as Prisma.InputJsonValue) : Prisma.DbNull` (same for `report`) — the behavior must stay: JSON when present, SQL NULL otherwise.

- [ ] **Step 7: Run tests to verify they pass**

Run: `DOTENV_CONFIG_PATH=.env.local npx vitest run --config vitest.db.config.ts lib/body/service.test.ts && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 8: Commit**

```bash
git add prisma/migrations/0003_body_scans prisma/schema.prisma lib/body/service.ts lib/body/service.test.ts
git commit -m "feat(body): body_scans/body_goals tables and scan import service

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Goals + training set counts service

**Files:**
- Modify: `lib/body/service.ts`, `lib/body/service.test.ts`

**Interfaces:**
- Consumes: `bodyGoalsInputSchema`, `GOAL_METRICS`, `GoalMetric` (Task 1); session helpers from `lib/sessions/service.ts` in tests: `startSessionForUser(db, userId, { sessionDate })`, `addExerciseToSessionForUser(db, userId, sessionId, exerciseId)`, `logSetForUser(db, userId, { sessionExerciseId, weightKg, reps, isWarmup })`, `finishSessionForUser(db, userId, sessionId)`.
- Produces:
  - `type BodyGoal = { metric: GoalMetric; target: number; start_value: number }`
  - `listBodyGoals(db, userId): Promise<BodyGoal[]>` (in `GOAL_METRICS` order)
  - `replaceBodyGoalsForUser(db, userId, input: unknown): Promise<BodyGoal[]>`
  - `countWorkingSetsByMuscleGroup(db, userId, fromDate: string, toDate: string): Promise<{ muscle_group: string | null; sets: number }[]>` (inclusive `YYYY-MM-DD` bounds, completed sessions, working sets only)

- [ ] **Step 1: Write the failing tests** (append to `lib/body/service.test.ts`; extend the imports)

Change the `./service` import to also bring in `countWorkingSetsByMuscleGroup`, `listBodyGoals`, `replaceBodyGoalsForUser`, and add:

```ts
import {
  addExerciseToSessionForUser,
  finishSessionForUser,
  logSetForUser,
  startSessionForUser,
} from "@/lib/sessions/service";
```

Append:

```ts
describe("body goals", () => {
  it("starts new goals from the latest scan and keeps start_value when only the target changes", async () => {
    const { userId } = await createTestUser();
    await importBodyScansForUser(
      prisma,
      userId,
      file(sampleScan({ measured_at: "2026-10-01T07:00:00+07:00", weight_kg: 82 }), sampleScan())
    );

    expect(
      await replaceBodyGoalsForUser(prisma, userId, [
        { metric: "weight_kg", target: 75 },
        { metric: "skeletal_muscle_kg", target: 37 },
      ])
    ).toEqual([
      { metric: "weight_kg", target: 75, start_value: 80 },
      { metric: "skeletal_muscle_kg", target: 37, start_value: 35 },
    ]);

    await importBodyScansForUser(prisma, userId, file(sampleScan({ measured_at: "2026-10-25T07:00:00+07:00", weight_kg: 78 })));
    // Muscle goal dropped; weight goal keeps its original start.
    expect(await replaceBodyGoalsForUser(prisma, userId, [{ metric: "weight_kg", target: 74 }])).toEqual([
      { metric: "weight_kg", target: 74, start_value: 80 },
    ]);
    expect(await listBodyGoals(prisma, userId)).toEqual([{ metric: "weight_kg", target: 74, start_value: 80 }]);
  });

  it("switching fat goal metric replaces the old fat goal", async () => {
    const { userId } = await createTestUser();
    await importBodyScansForUser(prisma, userId, file(sampleScan()));
    await replaceBodyGoalsForUser(prisma, userId, [{ metric: "body_fat_pct", target: 15 }]);
    expect(await replaceBodyGoalsForUser(prisma, userId, [{ metric: "body_fat_kg", target: 12 }])).toEqual([
      { metric: "body_fat_kg", target: 12, start_value: 17.6 },
    ]);
  });

  it("rejects invalid goal sets and goals with no baseline scan", async () => {
    const { userId } = await createTestUser();
    await expect(replaceBodyGoalsForUser(prisma, userId, [{ metric: "weight_kg", target: 75 }])).rejects.toThrow();
    await importBodyScansForUser(prisma, userId, file(sampleScan()));
    await expect(
      replaceBodyGoalsForUser(prisma, userId, [
        { metric: "body_fat_pct", target: 15 },
        { metric: "body_fat_kg", target: 12 },
      ])
    ).rejects.toThrow();
    expect(await listBodyGoals(prisma, userId)).toEqual([]);
  });

  it("isolation: goals are per user", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await importBodyScansForUser(prisma, a.userId, file(sampleScan()));
    await importBodyScansForUser(prisma, b.userId, file(sampleScan({ weight_kg: 90 })));
    await replaceBodyGoalsForUser(prisma, a.userId, [{ metric: "weight_kg", target: 75 }]);
    await replaceBodyGoalsForUser(prisma, b.userId, [{ metric: "weight_kg", target: 85 }]);

    // Clearing A's goals leaves B's alone.
    await replaceBodyGoalsForUser(prisma, a.userId, []);
    expect(await listBodyGoals(prisma, a.userId)).toEqual([]);
    expect(await listBodyGoals(prisma, b.userId)).toEqual([{ metric: "weight_kg", target: 85, start_value: 90 }]);
  });
});

describe("countWorkingSetsByMuscleGroup", () => {
  it("counts completed working sets per muscle group within the window, for the user only", async () => {
    const { userId } = await createTestUser();
    const other = await createTestUser();
    const legs = await prisma.exercises.findFirstOrThrow({ where: { is_preset: true, muscle_group: "Legs" } });
    const chest = await prisma.exercises.findFirstOrThrow({ where: { is_preset: true, muscle_group: "Chest" } });

    async function logSession(
      ownerId: string,
      date: string,
      sets: { exerciseId: string; isWarmup: boolean }[],
      finish = true
    ) {
      const session = await startSessionForUser(prisma, ownerId, { sessionDate: date });
      const seByExercise = new Map<string, string>();
      for (const { exerciseId, isWarmup } of sets) {
        if (!seByExercise.has(exerciseId)) {
          const se = await addExerciseToSessionForUser(prisma, ownerId, session.id, exerciseId);
          seByExercise.set(exerciseId, se.id);
        }
        await logSetForUser(prisma, ownerId, {
          sessionExerciseId: seByExercise.get(exerciseId),
          weightKg: 50,
          reps: 5,
          isWarmup,
        });
      }
      if (finish) await finishSessionForUser(prisma, ownerId, session.id);
    }

    await logSession(userId, "2026-10-10", [
      { exerciseId: legs.id, isWarmup: true },
      { exerciseId: legs.id, isWarmup: false },
      { exerciseId: legs.id, isWarmup: false },
      { exerciseId: chest.id, isWarmup: false },
    ]);
    await logSession(userId, "2026-09-01", [{ exerciseId: legs.id, isWarmup: false }]); // before the window
    await logSession(userId, "2026-10-12", [{ exerciseId: chest.id, isWarmup: false }], false); // in progress
    await logSession(other.userId, "2026-10-10", [{ exerciseId: legs.id, isWarmup: false }]);

    const counts = await countWorkingSetsByMuscleGroup(prisma, userId, "2026-10-01", "2026-10-28");
    expect([...counts].sort((x, y) => String(x.muscle_group).localeCompare(String(y.muscle_group)))).toEqual([
      { muscle_group: "Chest", sets: 1 },
      { muscle_group: "Legs", sets: 2 },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `DOTENV_CONFIG_PATH=.env.local npx vitest run --config vitest.db.config.ts lib/body/service.test.ts`
Expected: FAIL — `replaceBodyGoalsForUser` / `listBodyGoals` / `countWorkingSetsByMuscleGroup` not exported.

- [ ] **Step 3: Implement** (append to `lib/body/service.ts`; add `type body_goals` to the `@prisma/client` import and `GOAL_METRICS`, `bodyGoalsInputSchema`, `type GoalMetric` to the `./schema` import)

```ts
export type BodyGoal = { metric: GoalMetric; target: number; start_value: number };

// Goals come back in GOAL_METRICS order (weight, fat, muscle). Not created_at: goals saved in one
// transaction share its now(), so that order would be arbitrary.
function toBodyGoals(rows: body_goals[]): BodyGoal[] {
  return rows
    .map((row) => ({ metric: row.metric as GoalMetric, target: Number(row.target), start_value: Number(row.start_value) }))
    .sort((a, b) => GOAL_METRICS.indexOf(a.metric) - GOAL_METRICS.indexOf(b.metric));
}

export async function listBodyGoals(db: PrismaClient, userId: string): Promise<BodyGoal[]> {
  return toBodyGoals(await db.body_goals.findMany({ where: { user_id: userId } }));
}

// Replaces the user's whole goal set. A goal whose metric already exists keeps its start_value
// (only the target changes), so nudging a target doesn't reset progress; a new goal starts from
// the latest scan's value and fails if there's no scan with that value yet.
export async function replaceBodyGoalsForUser(
  db: PrismaClient,
  userId: string,
  input: unknown
): Promise<BodyGoal[]> {
  const goals = bodyGoalsInputSchema.parse(input);
  return db.$transaction(async (tx) => {
    await tx.body_goals.deleteMany({
      where: { user_id: userId, metric: { notIn: goals.map((g) => g.metric) } },
    });
    const existing = new Set(
      (await tx.body_goals.findMany({ where: { user_id: userId }, select: { metric: true } })).map((g) => g.metric)
    );
    const latest = await tx.body_scans.findFirst({ where: { user_id: userId }, orderBy: { measured_at: "desc" } });

    for (const goal of goals) {
      if (existing.has(goal.metric)) {
        await tx.body_goals.update({
          where: { user_id_metric: { user_id: userId, metric: goal.metric } },
          data: { target: goal.target },
        });
        continue;
      }
      const start = latest?.[goal.metric] ?? null;
      if (start === null) throw new Error(`No scan with ${goal.metric} to start a goal from`);
      await tx.body_goals.create({
        data: { user_id: userId, metric: goal.metric, target: goal.target, start_value: start },
      });
    }

    return toBodyGoals(await tx.body_goals.findMany({ where: { user_id: userId } }));
  });
}

// Working sets per muscle group in completed sessions dated fromDate..toDate (inclusive,
// YYYY-MM-DD) — the "where your sets go" side of the balance card.
export async function countWorkingSetsByMuscleGroup(
  db: PrismaClient,
  userId: string,
  fromDate: string,
  toDate: string
): Promise<{ muscle_group: string | null; sets: number }[]> {
  return db.$queryRaw<{ muscle_group: string | null; sets: number }[]>(Prisma.sql`
    select e.muscle_group, count(*)::int as sets
    from sets st
    join session_exercises se on se.id = st.session_exercise_id
    join sessions s on s.id = se.session_id
    join exercises e on e.id = st.exercise_id
    where st.user_id::text = ${userId} and s.user_id::text = ${userId}
      and not st.is_warmup and s.completed_at is not null
      and s.session_date >= ${fromDate}::date and s.session_date <= ${toDate}::date
    group by e.muscle_group`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `DOTENV_CONFIG_PATH=.env.local npx vitest run --config vitest.db.config.ts lib/body/service.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/body/service.ts lib/body/service.test.ts
git commit -m "feat(body): body goals and working-set counts per muscle group

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Actions, i18n, navigation, `/body` page (snapshot + history)

**Files:**
- Create: `lib/actions/body.ts`, `app/(app)/body/page.tsx`, `app/(app)/body/loading.tsx`, `app/(app)/body/LatestSnapshot.tsx`, `app/(app)/body/DeltaBadge.tsx`
- Modify: `messages/en.json`, `messages/th.json`, `app/(app)/nav-items.ts`, `app/(app)/TopBar.tsx`, `app/(app)/AccountMenu.tsx`

**Interfaces:**
- Consumes: Task 4/5 service functions; `METRIC_UNITS`, `scanDelta`, `deltaTone` (Task 2).
- Produces:
  - `importBodyScans(rawFile: unknown): Promise<BodyImportResult>` where `BodyImportResult = { error: BodyImportErrorCode | "importFailed" | null; imported: number; replaced: number }`
  - `deleteBodyScan(scanId: string): Promise<void>`
  - `saveBodyGoals(goals: unknown): Promise<void>`
  - `TOP_NAV_ITEMS` in `nav-items.ts`
  - `<DeltaBadge metric={ScanMetricKey} delta={number | null} />`, `<LatestSnapshot latest={BodyScan} previous={BodyScan | null} />`
  - All i18n keys used by Tasks 7–12 (added here once).

- [ ] **Step 1: Add every message key for the feature**

Run this from the repo root (the files round-trip through `JSON.stringify(…, 2)` unchanged, so only additions show in the diff):

```bash
node - <<'EOF'
const fs = require("fs");
const merge = (target, delta) => {
  for (const [k, v] of Object.entries(delta)) {
    if (v && typeof v === "object" && !Array.isArray(v)) merge((target[k] ??= {}), v);
    else target[k] = v;
  }
};
const metricsEn = {
  weight_kg: "Weight", bmi: "BMI", body_fat_pct: "Body fat %", body_fat_kg: "Body fat mass",
  skeletal_muscle_kg: "Skeletal muscle", skeletal_muscle_pct: "Skeletal muscle %", muscle_mass_pct: "Muscle mass %",
  soft_lean_mass_kg: "Soft lean mass", fat_free_mass_kg: "Fat-free mass", body_water_l: "Body water",
  body_water_pct: "Body water %", protein_kg: "Protein", protein_pct: "Protein %", bone_mass_kg: "Bone mass",
  bone_mass_pct: "Bone mass %", visceral_fat: "Visceral fat", subcutaneous_fat_pct: "Subcutaneous fat %",
  subcutaneous_fat_kg: "Subcutaneous fat", bmr_kcal: "BMR", smi: "SMI", waist_hip_ratio: "Waist-hip ratio",
  fitness_score: "Fitness score", height_cm: "Height", age: "Age",
};
const metricsTh = {
  weight_kg: "น้ำหนัก", bmi: "BMI", body_fat_pct: "ไขมันในร่างกาย (%)", body_fat_kg: "มวลไขมัน",
  skeletal_muscle_kg: "กล้ามเนื้อโครงร่าง", skeletal_muscle_pct: "กล้ามเนื้อโครงร่าง (%)", muscle_mass_pct: "มวลกล้ามเนื้อ (%)",
  soft_lean_mass_kg: "มวลเนื้อเยื่อไร้ไขมัน", fat_free_mass_kg: "มวลไร้ไขมัน", body_water_l: "น้ำในร่างกาย",
  body_water_pct: "น้ำในร่างกาย (%)", protein_kg: "โปรตีน", protein_pct: "โปรตีน (%)", bone_mass_kg: "มวลกระดูก",
  bone_mass_pct: "มวลกระดูก (%)", visceral_fat: "ไขมันช่องท้อง", subcutaneous_fat_pct: "ไขมันใต้ผิวหนัง (%)",
  subcutaneous_fat_kg: "ไขมันใต้ผิวหนัง", bmr_kcal: "อัตราเผาผลาญพื้นฐาน", smi: "SMI", waist_hip_ratio: "สัดส่วนเอวต่อสะโพก",
  fitness_score: "คะแนนสุขภาพ", height_cm: "ส่วนสูง", age: "อายุ",
};
const deltas = {
  en: {
    nav: { body: "Body" },
    account: { body: "Body" },
    dashboard: {
      bodyTitle: "Body",
      bodyLastScan: "Last scan: {when}",
      bodyEmptyTitle: "Track your body composition",
      bodyEmptyDescription: "Import a scale report to see weight, fat and muscle next to your training.",
    },
    errors: {
      body: {
        invalidJson: "That isn't valid JSON.",
        invalidFile: "This isn't a body-scan import file.",
        unsupportedVersion: "Unsupported import version.",
        importFailed: "Could not import the scan.",
        deleteScan: "Failed to delete the scan.",
        saveGoals: "Failed to save goals.",
      },
    },
    body: {
      title: "Body",
      latest: "Latest scan",
      measuredOn: "Measured {date}",
      history: "Scans",
      emptyTitle: "No scans yet",
      emptyDescription: "Import your first scale report to start tracking.",
      importButton: "Import scan",
      importTitle: "Import a scale scan",
      importHelp: "Paste the JSON Claude Code made from your arboleaf PDF, or choose the .json file.",
      importPlaceholder: "Paste JSON here",
      importPickFile: "Choose file",
      importPreview: "Check before saving",
      importConfirm: "Save {count, plural, one {# scan} other {# scans}}",
      importReplaces: "Replaces saved",
      trend: "Trend",
      trendLabel: "Chart metric",
      trendNeedsMore: "Import another scan to see a trend.",
      goalLine: "Goal",
      trendMetrics: { weight_kg: "Weight", body_fat_pct: "Fat %", body_fat_kg: "Fat kg", skeletal_muscle_kg: "Muscle" },
      goals: "Goals",
      goalsEmpty: "No goals yet.",
      editGoals: "Edit",
      goalsTitle: "Body goals",
      goalsHelp: "Leave a field empty for no goal. Progress counts from your latest scan when a goal is first set.",
      goalNone: "No goal",
      fatGoalMetric: "Fat goal as",
      useSuggestion: "Use arboleaf's suggestion",
      goalRange: "{start} → {target} {unit}",
      goalPercent: "{percent}%",
      balance: "Muscle balance vs training",
      leftRight: "Left vs right (lean mass)",
      left: "L",
      right: "R",
      difference: "{pct}% apart",
      regionShare: "Where your muscle is vs where your sets go",
      leanShareLabel: "Lean mass (latest scan)",
      trainingShareLabel: "Working sets, last 4 weeks",
      noTrainingSets: "No working sets in the last 4 weeks.",
      regions: { arms: "Arms", trunk: "Trunk", legs: "Legs" },
      detailTitle: "Scan report",
      values: "Values",
      range: "Normal {min}–{max}",
      rangeMax: "Normal ≤ {max}",
      rangeMin: "Normal ≥ {min}",
      assessments: "Assessment",
      weightControl: "Weight control",
      weightControlKeys: {
        normal_weight_kg: "Normal weight",
        weight_kg: "Weight change",
        fat_kg: "Fat change",
        muscle_kg: "Muscle change",
      },
      segments: "Segments",
      segmentLean: "Lean",
      segmentFat: "Fat",
      segmentNames: { left_arm: "Left arm", right_arm: "Right arm", trunk: "Trunk", left_leg: "Left leg", right_leg: "Right leg" },
      advice: "Advice",
      deleteLabel: "Delete scan",
      deleteTitle: "Delete this scan?",
      deleteDescription: "The scan from {date} will be permanently deleted.",
      metrics: metricsEn,
    },
  },
  th: {
    nav: { body: "ร่างกาย" },
    account: { body: "ร่างกาย" },
    dashboard: {
      bodyTitle: "ร่างกาย",
      bodyLastScan: "ชั่งล่าสุด: {when}",
      bodyEmptyTitle: "ติดตามองค์ประกอบร่างกาย",
      bodyEmptyDescription: "นำเข้าผลจากเครื่องชั่งเพื่อดูน้ำหนัก ไขมัน และกล้ามเนื้อคู่กับการฝึก",
    },
    errors: {
      body: {
        invalidJson: "ข้อความนี้ไม่ใช่ JSON ที่ถูกต้อง",
        invalidFile: "ไฟล์นี้ไม่ใช่ไฟล์นำเข้าผลชั่ง",
        unsupportedVersion: "ไม่รองรับเวอร์ชันของไฟล์นำเข้านี้",
        importFailed: "นำเข้าผลชั่งไม่สำเร็จ",
        deleteScan: "ลบผลชั่งไม่สำเร็จ",
        saveGoals: "บันทึกเป้าหมายไม่สำเร็จ",
      },
    },
    body: {
      title: "ร่างกาย",
      latest: "ผลชั่งล่าสุด",
      measuredOn: "ชั่งเมื่อ {date}",
      history: "ประวัติการชั่ง",
      emptyTitle: "ยังไม่มีผลชั่ง",
      emptyDescription: "นำเข้ารายงานจากเครื่องชั่งครั้งแรกเพื่อเริ่มติดตาม",
      importButton: "นำเข้าผลชั่ง",
      importTitle: "นำเข้าผลชั่ง",
      importHelp: "วาง JSON ที่ Claude Code สร้างจาก PDF ของ arboleaf หรือเลือกไฟล์ .json",
      importPlaceholder: "วาง JSON ที่นี่",
      importPickFile: "เลือกไฟล์",
      importPreview: "ตรวจสอบก่อนบันทึก",
      importConfirm: "บันทึก {count, plural, other {# ครั้ง}}",
      importReplaces: "แทนที่ของเดิม",
      trend: "แนวโน้ม",
      trendLabel: "ค่าที่แสดงในกราฟ",
      trendNeedsMore: "นำเข้าผลชั่งอีกครั้งเพื่อดูแนวโน้ม",
      goalLine: "เป้าหมาย",
      trendMetrics: { weight_kg: "น้ำหนัก", body_fat_pct: "ไขมัน %", body_fat_kg: "ไขมัน kg", skeletal_muscle_kg: "กล้ามเนื้อ" },
      goals: "เป้าหมาย",
      goalsEmpty: "ยังไม่ได้ตั้งเป้าหมาย",
      editGoals: "แก้ไข",
      goalsTitle: "เป้าหมายร่างกาย",
      goalsHelp: "เว้นว่างไว้ถ้าไม่ต้องการตั้งเป้าค่านั้น ความคืบหน้านับจากผลชั่งล่าสุดตอนที่ตั้งเป้าครั้งแรก",
      goalNone: "ไม่ตั้งเป้า",
      fatGoalMetric: "ตั้งเป้าไขมันเป็น",
      useSuggestion: "ใช้ค่าที่ arboleaf แนะนำ",
      goalRange: "{start} → {target} {unit}",
      goalPercent: "{percent}%",
      balance: "สมดุลกล้ามเนื้อเทียบกับการฝึก",
      leftRight: "ซ้ายเทียบขวา (มวลไร้ไขมัน)",
      left: "ซ้าย",
      right: "ขวา",
      difference: "ต่างกัน {pct}%",
      regionShare: "กล้ามเนื้ออยู่ตรงไหน เทียบกับเซ็ตที่ฝึก",
      leanShareLabel: "มวลไร้ไขมัน (ผลชั่งล่าสุด)",
      trainingShareLabel: "เซ็ตที่ฝึก 4 สัปดาห์ล่าสุด",
      noTrainingSets: "ไม่มีเซ็ตที่ฝึกใน 4 สัปดาห์ล่าสุด",
      regions: { arms: "แขน", trunk: "ลำตัว", legs: "ขา" },
      detailTitle: "รายงานผลชั่ง",
      values: "ค่าที่วัดได้",
      range: "ปกติ {min}–{max}",
      rangeMax: "ปกติ ≤ {max}",
      rangeMin: "ปกติ ≥ {min}",
      assessments: "ผลประเมิน",
      weightControl: "การควบคุมน้ำหนัก",
      weightControlKeys: {
        normal_weight_kg: "น้ำหนักที่เหมาะสม",
        weight_kg: "ปรับน้ำหนัก",
        fat_kg: "ปรับไขมัน",
        muscle_kg: "ปรับกล้ามเนื้อ",
      },
      segments: "แยกตามส่วน",
      segmentLean: "ไร้ไขมัน",
      segmentFat: "ไขมัน",
      segmentNames: { left_arm: "แขนซ้าย", right_arm: "แขนขวา", trunk: "ลำตัว", left_leg: "ขาซ้าย", right_leg: "ขาขวา" },
      advice: "คำแนะนำ",
      deleteLabel: "ลบผลชั่ง",
      deleteTitle: "ลบผลชั่งนี้?",
      deleteDescription: "ผลชั่งวันที่ {date} จะถูกลบถาวร",
      metrics: metricsTh,
    },
  },
};
for (const locale of ["en", "th"]) {
  const path = `messages/${locale}.json`;
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  merge(data, deltas[locale]);
  fs.writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}
EOF
git diff --stat messages/
npx vitest run i18n/messages.test.ts
```

Expected: only insertions in `messages/*.json`; `i18n/messages.test.ts` PASS.

- [ ] **Step 2: Server actions**

`lib/actions/body.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import {
  BodyImportError,
  deleteBodyScanForUser,
  importBodyScansForUser,
  replaceBodyGoalsForUser,
} from "@/lib/body/service";
import type { BodyImportErrorCode } from "@/lib/body/schema";

export type BodyImportResult = {
  error: BodyImportErrorCode | "importFailed" | null;
  imported: number;
  replaced: number;
};

function revalidateBody() {
  revalidatePath("/body");
  revalidatePath("/dashboard");
}

export async function importBodyScans(rawFile: unknown): Promise<BodyImportResult> {
  const userId = await requireUserId();
  try {
    const { imported, replaced } = await importBodyScansForUser(prisma, userId, rawFile);
    revalidateBody();
    return { error: null, imported, replaced };
  } catch (err) {
    if (err instanceof BodyImportError) return { error: err.code, imported: 0, replaced: 0 };
    console.error(err);
    return { error: "importFailed", imported: 0, replaced: 0 };
  }
}

export async function deleteBodyScan(scanId: string) {
  const userId = await requireUserId();
  await deleteBodyScanForUser(prisma, userId, scanId);
  revalidateBody();
}

export async function saveBodyGoals(goals: unknown) {
  const userId = await requireUserId();
  await replaceBodyGoalsForUser(prisma, userId, goals);
  revalidateBody();
}
```

- [ ] **Step 3: Navigation**

`app/(app)/nav-items.ts` — replace the file with:

```ts
import { House, ClipboardText, Barbell, ClockCounterClockwise, PersonSimple } from "@phosphor-icons/react/ssr";

// labelKey is a key in the `nav` message namespace.
export const NAV_ITEMS = [
  { href: "/dashboard", labelKey: "dashboard", icon: House },
  { href: "/routines", labelKey: "routines", icon: ClipboardText },
  { href: "/exercises", labelKey: "exercises", icon: Barbell },
  { href: "/history", labelKey: "history", icon: ClockCounterClockwise },
] as const;

// The phone's bottom bar is full (two links, the log FAB, two links), so Body is only in the
// desktop top bar; phones reach it from the dashboard Body card and the account menu.
export const TOP_NAV_ITEMS = [...NAV_ITEMS, { href: "/body", labelKey: "body", icon: PersonSimple }] as const;
```

`app/(app)/TopBar.tsx`: change `import { NAV_ITEMS } from "./nav-items";` to `import { TOP_NAV_ITEMS } from "./nav-items";` and `{NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {` to `{TOP_NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {`. Leave `TOP_LEVEL_ROUTES` alone (on phones `/body` keeps the back button, since it's reached from the dashboard/menu).

`app/(app)/AccountMenu.tsx`: add `PersonSimple` to the phosphor import (`import { User, CaretDown, Gear, SignOut, PersonSimple } from "@phosphor-icons/react/ssr";`) and insert before the `href="/profile"` `<Link>`:

```tsx
          <Link
            href="/body"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={`${ITEM_CLASS} text-foreground hover:bg-surface-muted`}
          >
            <PersonSimple className="h-4 w-4 text-muted" />
            {t("body")}
          </Link>
```

- [ ] **Step 4: Display pieces**

`app/(app)/body/DeltaBadge.tsx`:

```tsx
import { useFormatter } from "next-intl";
import { Badge } from "@/components/ui/Badge";
import { deltaTone } from "@/lib/body/metrics";
import type { ScanMetricKey } from "@/lib/body/schema";

// "+0.4" / "-1.2" vs the previous scan, green when it moved the good way (see goodDirection).
export function DeltaBadge({ metric, delta }: { metric: ScanMetricKey; delta: number | null }) {
  const format = useFormatter();
  if (delta === null || delta === 0) return null;
  return (
    <Badge tone={deltaTone(metric, delta)}>
      {format.number(delta, { maximumFractionDigits: 2, signDisplay: "always" })}
    </Badge>
  );
}
```

`app/(app)/body/LatestSnapshot.tsx`:

```tsx
import { useFormatter, useTranslations } from "next-intl";
import { StatCard } from "@/components/ui/StatCard";
import { METRIC_UNITS, scanDelta } from "@/lib/body/metrics";
import type { ScanMetricKey } from "@/lib/body/schema";
import type { BodyScan } from "@/lib/body/service";
import { DeltaBadge } from "./DeltaBadge";

const SNAPSHOT_METRICS: ScanMetricKey[] = ["weight_kg", "body_fat_pct", "skeletal_muscle_kg", "visceral_fat"];

export function LatestSnapshot({ latest, previous }: { latest: BodyScan; previous: BodyScan | null }) {
  const t = useTranslations("body");
  const format = useFormatter();
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {SNAPSHOT_METRICS.map((metric) => {
        const value = latest[metric];
        return (
          <StatCard
            key={metric}
            label={t(`metrics.${metric}`)}
            value={value === null ? "–" : format.number(value, { maximumFractionDigits: 2 })}
            unit={METRIC_UNITS[metric] || undefined}
            badge={<DeltaBadge metric={metric} delta={previous ? scanDelta(value, previous[metric]) : null} />}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: The page and its skeleton**

`app/(app)/body/loading.tsx`:

```tsx
import { PageSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <PageSkeleton tiles={4} rows={3} />;
}
```

`app/(app)/body/page.tsx`:

```tsx
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { CaretRight, PersonSimple } from "@phosphor-icons/react/ssr";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getTodayString } from "@/lib/date";
import { listBodyScans } from "@/lib/body/service";
import { formatRelativeDate } from "@/lib/sessions/summary";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LatestSnapshot } from "./LatestSnapshot";

export default async function BodyPage() {
  const user = await getAuthUser();
  const today = getTodayString();
  const scans = await listBodyScans(prisma, user!.id);
  const [locale, t, tc, format] = await Promise.all([
    getLocale(),
    getTranslations("body"),
    getTranslations("common"),
    getFormatter(),
  ]);
  const relativeLabels = { today: tc("today"), yesterday: tc("yesterday") };
  const n = (value: number) => format.number(value, { maximumFractionDigits: 2 });
  const latest = scans.at(-1) ?? null;
  const previous = scans.at(-2) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
      </div>

      {!latest ? (
        <EmptyState
          icon={<PersonSimple className="h-6 w-6" />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <>
          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-medium">{t("latest")}</h2>
              <span className="text-sm text-muted">
                {t("measuredOn", { date: formatRelativeDate(latest.scan_date, today, locale, relativeLabels) })}
              </span>
            </div>
            <LatestSnapshot latest={latest} previous={previous} />
          </section>

          <section className="space-y-2">
            <h2 className="font-medium">{t("history")}</h2>
            <div className="space-y-2">
              {[...scans].reverse().map((scan) => (
                <Card key={scan.id} padding={false}>
                  <Link href={`/body/${scan.id}`} className="flex items-center justify-between gap-2 p-4">
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {formatRelativeDate(scan.scan_date, today, locale, relativeLabels)}
                      </span>
                      <span className="block truncate text-sm text-muted">
                        {n(scan.weight_kg ?? 0)} kg
                        {scan.body_fat_pct !== null && ` · ${t("metrics.body_fat_pct")} ${n(scan.body_fat_pct)}`}
                        {scan.skeletal_muscle_kg !== null &&
                          ` · ${t("metrics.skeletal_muscle_kg")} ${n(scan.skeletal_muscle_kg)} kg`}
                      </span>
                    </span>
                    <CaretRight className="h-4 w-4 shrink-0 text-muted" />
                  </Link>
                </Card>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. (If `tsc` reports `Cannot find name 'LayoutProps'`, run `npx next typegen` first.)

Manual: restart `next dev` (message JSON is cached) — `preview_start` with the launch.json config; with the user signed in, `/body` shows the empty state; the desktop top bar shows "ร่างกาย/Body"; the account menu has the Body item.

- [ ] **Step 7: Commit**

```bash
git add lib/actions/body.ts "app/(app)/body" "app/(app)/nav-items.ts" "app/(app)/TopBar.tsx" "app/(app)/AccountMenu.tsx" messages/en.json messages/th.json
git commit -m "feat(body): /body page with latest snapshot and scan history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Import sheet

**Files:**
- Create: `app/(app)/body/ImportScanSheet.tsx`
- Modify: `app/(app)/body/page.tsx`

**Interfaces:**
- Consumes: `importBodyScans` (Task 6), `parseBodyImportText`, `BodyImportFile` (Task 1), `toScanDateString` (Task 2), `formatShortDate(dateStr, locale)` from `lib/sessions/summary.ts`.
- Produces: `<ImportScanSheet existingMeasuredAt={string[]} variant?: "primary" | "secondary" />` (`existingMeasuredAt` = the saved scans' ISO `measured_at`s).

- [ ] **Step 1: Component**

`app/(app)/body/ImportScanSheet.tsx`:

```tsx
"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { FileArrowUp, UploadSimple, X } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Sheet } from "@/components/ui/Sheet";
import { importBodyScans } from "@/lib/actions/body";
import { toScanDateString } from "@/lib/body/metrics";
import { parseBodyImportText, type BodyImportFile } from "@/lib/body/schema";
import { formatShortDate } from "@/lib/sessions/summary";

// Paste (or pick) the import JSON → validate + preview with the same zod schema the server uses
// → save. The preview only renders after user input, so client-side date formatting can't cause
// a hydration mismatch.
export function ImportScanSheet({
  existingMeasuredAt,
  variant = "secondary",
}: {
  existingMeasuredAt: string[];
  variant?: "primary" | "secondary";
}) {
  const t = useTranslations("body");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const titleId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<BodyImportFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const existing = new Set(existingMeasuredAt);
  const n = (value: number) => format.number(value, { maximumFractionDigits: 2 });

  function close() {
    setOpen(false);
    setText("");
    setPreview(null);
    setError(null);
  }

  function check(raw: string) {
    setText(raw);
    if (raw.trim() === "") {
      setPreview(null);
      setError(null);
      return;
    }
    const result = parseBodyImportText(raw);
    setPreview(result.ok ? result.data : null);
    setError(result.ok ? null : te(`body.${result.code}`));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so re-picking the same file still fires onChange.
    e.target.value = "";
    if (file) check(await file.text());
  }

  async function handleSave() {
    if (!preview) return;
    setSaving(true);
    setError(null);
    try {
      const result = await importBodyScans(preview);
      if (result.error) {
        setError(te(`body.${result.error}`));
        return;
      }
      close();
      router.refresh();
    } catch (err) {
      console.error(err);
      setError(te("body.importFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant={variant} icon={<UploadSimple className="h-5 w-5" />} onClick={() => setOpen(true)}>
        {t("importButton")}
      </Button>

      <Sheet open={open} onClose={close} labelledBy={titleId}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 id={titleId} className="font-semibold">
            {t("importTitle")}
          </h2>
          <IconButton icon={<X className="h-5 w-5" />} aria-label={tc("dismiss")} onClick={close} />
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <p className="text-sm text-muted">{t("importHelp")}</p>
          <textarea
            aria-label={t("importPlaceholder")}
            placeholder={t("importPlaceholder")}
            value={text}
            onChange={(e) => check(e.target.value)}
            spellCheck={false}
            className="min-h-40 w-full rounded-lg border border-border bg-surface-muted p-3 font-mono text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="secondary"
            icon={<FileArrowUp className="h-5 w-5" />}
            onClick={() => fileInputRef.current?.click()}
          >
            {t("importPickFile")}
          </Button>

          {error && <p className="text-sm text-danger">{error}</p>}

          {preview && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("importPreview")}</h3>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {preview.scans.map((scan, index) => {
                  const instant = new Date(scan.measured_at);
                  return (
                    <li key={`${scan.measured_at}-${index}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block font-medium">
                          {formatShortDate(toScanDateString(instant), locale)}
                        </span>
                        <span className="block truncate text-muted">
                          {n(scan.weight_kg)} kg
                          {scan.body_fat_pct != null && ` · ${n(scan.body_fat_pct)}%`}
                          {scan.skeletal_muscle_kg != null && ` · ${n(scan.skeletal_muscle_kg)} kg`}
                        </span>
                      </span>
                      {existing.has(instant.toISOString()) && <Badge>{t("importReplaces")}</Badge>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="border-t border-border p-4">
          <Button className="w-full" onClick={handleSave} loading={saving} disabled={!preview}>
            {preview ? t("importConfirm", { count: preview.scans.length }) : t("importButton")}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 2: Wire into the page**

In `app/(app)/body/page.tsx`: add `import { ImportScanSheet } from "./ImportScanSheet";` and `const existingMeasuredAt = scans.map((scan) => scan.measured_at);` after `const previous = …`. Replace

```tsx
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
      </div>
```

with

```tsx
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {latest && <ImportScanSheet existingMeasuredAt={existingMeasuredAt} />}
      </div>
```

and give the `EmptyState` an `action={<ImportScanSheet existingMeasuredAt={existingMeasuredAt} variant="primary" />}` prop.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Manual (signed in, local dev): `/body` → Import → paste `JSON.stringify({ version: 1, scans: [<sampleScan() literal>] })` → preview shows date + values → Save → snapshot + history appear. Paste the same JSON again → preview row shows "Replaces saved"; save → still one history row. Paste `{` → "That isn't valid JSON."; `{"version":2,"scans":[]}` → unsupported version message. Check Thai and English.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/body/ImportScanSheet.tsx" "app/(app)/body/page.tsx"
git commit -m "feat(body): import sheet with validated preview

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Scan report page + delete

**Files:**
- Create: `app/(app)/body/[scanId]/page.tsx`, `app/(app)/body/[scanId]/loading.tsx`, `app/(app)/body/[scanId]/DeleteScanButton.tsx`

**Interfaces:**
- Consumes: `getBodyScan` (Task 4), `deleteBodyScan` (Task 6), `SCAN_METRIC_KEYS`, `SEGMENT_KEYS` (Task 1), `METRIC_UNITS` (Task 2), `formatSessionDate(dateStr, locale)` from `lib/sessions/summary.ts`.

- [ ] **Step 1: Delete button**

`app/(app)/body/[scanId]/DeleteScanButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash } from "@phosphor-icons/react/ssr";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconButton } from "@/components/ui/IconButton";
import { deleteBodyScan } from "@/lib/actions/body";

export function DeleteScanButton({ scanId, dateLabel }: { scanId: string; dateLabel: string }) {
  const t = useTranslations("body");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      await deleteBodyScan(scanId);
      setConfirmOpen(false);
      router.push("/body");
    } catch (err) {
      console.error(err);
      setError(te("body.deleteScan"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <IconButton
        icon={<Trash className="h-4 w-4" />}
        aria-label={t("deleteLabel")}
        variant="danger"
        onClick={() => setConfirmOpen(true)}
      />
      <ConfirmDialog
        open={confirmOpen}
        title={t("deleteTitle")}
        description={t("deleteDescription", { date: dateLabel })}
        confirmLabel={tc("delete")}
        tone="danger"
        loading={pending}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Report page + skeleton**

`app/(app)/body/[scanId]/loading.tsx`:

```tsx
import { PageSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <PageSkeleton rows={4} rowClassName="h-32" />;
}
```

`app/(app)/body/[scanId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getBodyScan } from "@/lib/body/service";
import { METRIC_UNITS } from "@/lib/body/metrics";
import { SCAN_METRIC_KEYS, SEGMENT_KEYS } from "@/lib/body/schema";
import { formatSessionDate } from "@/lib/sessions/summary";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DeleteScanButton } from "./DeleteScanButton";

const WEIGHT_CONTROL_KEYS = ["normal_weight_kg", "weight_kg", "fat_kg", "muscle_kg"] as const;

export default async function BodyScanPage({ params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  const user = await getAuthUser();
  const scan = await getBodyScan(prisma, user!.id, scanId);
  if (!scan) notFound();

  const [locale, t, format] = await Promise.all([getLocale(), getTranslations("body"), getFormatter()]);
  const n = (value: number) => format.number(value, { maximumFractionDigits: 2 });
  const signed = (value: number) => format.number(value, { maximumFractionDigits: 2, signDisplay: "exceptZero" });
  const dateLabel = formatSessionDate(scan.scan_date, locale);
  const ranges = scan.report?.ranges ?? {};
  const evaluations = scan.report?.evaluations ?? {};
  const assessments = Object.entries(scan.report?.assessments ?? {});
  const weightControl = scan.report?.weight_control;
  const segments = SEGMENT_KEYS.flatMap((key) => {
    const segment = scan.segments?.[key];
    return segment ? [{ key, segment }] : [];
  });

  function rangeLabel(range: [number | null, number | null] | undefined): string | null {
    if (!range) return null;
    const [min, max] = range;
    if (min !== null && max !== null) return t("range", { min: n(min), max: n(max) });
    if (max !== null) return t("rangeMax", { max: n(max) });
    if (min !== null) return t("rangeMin", { min: n(min) });
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{t("detailTitle")}</h1>
          <p className="text-sm text-muted">{dateLabel}</p>
        </div>
        <DeleteScanButton scanId={scan.id} dateLabel={dateLabel} />
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">{t("values")}</h2>
        <Card padding={false}>
          <dl className="divide-y divide-border">
            {SCAN_METRIC_KEYS.map((key) => {
              const value = scan[key];
              if (value === null) return null;
              const range = rangeLabel(ranges[key]);
              const verdict = evaluations[key];
              return (
                <div key={key} className="flex items-center justify-between gap-3 px-4 py-3">
                  <dt className="min-w-0">
                    <span className="block text-sm">{t(`metrics.${key}`)}</span>
                    {range && <span className="block text-xs text-muted">{range}</span>}
                  </dt>
                  <dd className="flex shrink-0 items-center gap-2">
                    {verdict && <Badge>{verdict}</Badge>}
                    <span className="font-mono tabular-nums">
                      {n(value)}
                      {METRIC_UNITS[key] && ` ${METRIC_UNITS[key]}`}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
        </Card>
      </section>

      {segments.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">{t("segments")}</h2>
          <Card padding={false}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    <span className="sr-only">{t("segments")}</span>
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">{t("segmentLean")}</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">{t("segmentFat")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {segments.map(({ key, segment }) => (
                  <tr key={key}>
                    <th scope="row" className="px-4 py-2 text-left font-normal">{t(`segmentNames.${key}`)}</th>
                    <td className="px-2 py-2 text-right">
                      <span className="font-mono tabular-nums">
                        {segment.lean_kg != null ? `${n(segment.lean_kg)} kg` : "–"}
                      </span>
                      {segment.lean_eval && <span className="block text-xs text-muted">{segment.lean_eval}</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="font-mono tabular-nums">
                        {segment.fat_kg != null ? `${n(segment.fat_kg)} kg` : "–"}
                      </span>
                      {segment.fat_eval && <span className="block text-xs text-muted">{segment.fat_eval}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      {assessments.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">{t("assessments")}</h2>
          <Card padding={false}>
            <dl className="divide-y divide-border">
              {assessments.map(([label, verdict]) => (
                <div key={label} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <dt>{label}</dt>
                  <dd><Badge>{verdict}</Badge></dd>
                </div>
              ))}
            </dl>
          </Card>
        </section>
      )}

      {weightControl && (
        <section className="space-y-2">
          <h2 className="font-medium">{t("weightControl")}</h2>
          <Card padding={false}>
            <dl className="divide-y divide-border">
              {WEIGHT_CONTROL_KEYS.map((key) => {
                const value = weightControl[key];
                if (value == null) return null;
                return (
                  <div key={key} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <dt>{t(`weightControlKeys.${key}`)}</dt>
                    <dd className="font-mono tabular-nums">
                      {key === "normal_weight_kg" ? n(value) : signed(value)} kg
                    </dd>
                  </div>
                );
              })}
            </dl>
          </Card>
        </section>
      )}

      {scan.report?.advice && (
        <section className="space-y-2">
          <h2 className="font-medium">{t("advice")}</h2>
          <Card>
            <p className="text-sm">{scan.report.advice}</p>
          </Card>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Manual: open a scan from the history list → values with ranges/verdict badges, segment table, assessment, weight control, advice; `/body/not-a-uuid` → 404; delete → confirm → back on `/body` without it.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/body/[scanId]"
git commit -m "feat(body): full scan report page with delete

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Goals card

**Files:**
- Create: `app/(app)/body/GoalProgress.tsx`, `app/(app)/body/GoalsCard.tsx`
- Modify: `app/(app)/body/page.tsx`

**Interfaces:**
- Consumes: `listBodyGoals`, `BodyGoal` (Task 5), `saveBodyGoals` (Task 6), `goalProgress`, `METRIC_UNITS`, `suggestedGoalTargets` (Task 2), `GoalMetric` (Task 1).
- Produces: `<GoalProgress label unit start target current />` (also used by Task 12), `<GoalsCard goals current suggestion />`.

- [ ] **Step 1: Progress row**

`app/(app)/body/GoalProgress.tsx`:

```tsx
import { useFormatter, useTranslations } from "next-intl";
import { goalProgress } from "@/lib/body/metrics";

// One goal: "label   start → target unit · 40%" over a 0–100% bar (see goalProgress).
export function GoalProgress({
  label,
  unit,
  start,
  target,
  current,
}: {
  label: string;
  unit: string;
  start: number;
  target: number;
  current: number | null;
}) {
  const t = useTranslations("body");
  const format = useFormatter();
  const n = (value: number) => format.number(value, { maximumFractionDigits: 2 });
  const pct = current === null ? 0 : goalProgress(start, target, current);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-medium">{label}</span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
          {t("goalRange", { start: n(start), target: n(target), unit })} · {t("goalPercent", { percent: pct })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-2 overflow-hidden rounded-full bg-surface-muted"
      >
        <div className={`h-full rounded-full ${pct >= 100 ? "bg-success" : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Card + editor**

`app/(app)/body/GoalsCard.tsx`:

```tsx
"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PencilSimple, Sparkle, X } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import { saveBodyGoals } from "@/lib/actions/body";
import { METRIC_UNITS } from "@/lib/body/metrics";
import type { GoalMetric } from "@/lib/body/schema";
import type { BodyGoal } from "@/lib/body/service";
import { GoalProgress } from "./GoalProgress";

type FatMetric = "body_fat_pct" | "body_fat_kg";
const FAT_METRICS: FatMetric[] = ["body_fat_pct", "body_fat_kg"];
type Draft = { weight_kg: string; fat: string; fatMetric: FatMetric; skeletal_muscle_kg: string };

function toDraft(goals: BodyGoal[]): Draft {
  const find = (metric: GoalMetric) => goals.find((g) => g.metric === metric);
  const fat = find("body_fat_pct") ?? find("body_fat_kg");
  return {
    weight_kg: find("weight_kg")?.target.toString() ?? "",
    fat: fat?.target.toString() ?? "",
    fatMetric: (fat?.metric as FatMetric | undefined) ?? "body_fat_pct",
    skeletal_muscle_kg: find("skeletal_muscle_kg")?.target.toString() ?? "",
  };
}

// A blank field means "no goal". Anything unparsable reaches the server schema and is rejected.
function toGoals(draft: Draft): { metric: GoalMetric; target: number }[] {
  const fields: [GoalMetric, string][] = [
    ["weight_kg", draft.weight_kg],
    [draft.fatMetric, draft.fat],
    ["skeletal_muscle_kg", draft.skeletal_muscle_kg],
  ];
  return fields.filter(([, value]) => value.trim() !== "").map(([metric, value]) => ({ metric, target: Number(value) }));
}

export function GoalsCard({
  goals,
  current,
  suggestion,
}: {
  goals: BodyGoal[];
  current: Record<GoalMetric, number | null>;
  suggestion: Partial<Record<GoalMetric, number>>;
}) {
  const t = useTranslations("body");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(goals));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasSuggestion = Object.keys(suggestion).length > 0;

  function openEditor() {
    setDraft(toDraft(goals));
    setError(null);
    setOpen(true);
  }

  function applySuggestion() {
    setDraft((d) => ({
      weight_kg: suggestion.weight_kg?.toString() ?? d.weight_kg,
      fat: suggestion.body_fat_kg?.toString() ?? d.fat,
      fatMetric: suggestion.body_fat_kg !== undefined ? "body_fat_kg" : d.fatMetric,
      skeletal_muscle_kg: suggestion.skeletal_muscle_kg?.toString() ?? d.skeletal_muscle_kg,
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveBodyGoals(toGoals(draft));
      setOpen(false);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError(te("body.saveGoals"));
    } finally {
      setSaving(false);
    }
  }

  const numberProps = { type: "number", inputMode: "decimal", step: "0.1", min: "0", placeholder: t("goalNone") } as const;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">{t("goals")}</h2>
        <Button variant="ghost" icon={<PencilSimple className="h-4 w-4" />} onClick={openEditor}>
          {t("editGoals")}
        </Button>
      </div>
      <Card className="space-y-4">
        {goals.length === 0 ? (
          <p className="text-sm text-muted">{t("goalsEmpty")}</p>
        ) : (
          goals.map((goal) => (
            <GoalProgress
              key={goal.metric}
              label={t(`metrics.${goal.metric}`)}
              unit={METRIC_UNITS[goal.metric]}
              start={goal.start_value}
              target={goal.target}
              current={current[goal.metric]}
            />
          ))
        )}
      </Card>

      <Sheet open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 id={titleId} className="font-semibold">
            {t("goalsTitle")}
          </h2>
          <IconButton icon={<X className="h-5 w-5" />} aria-label={tc("dismiss")} onClick={() => setOpen(false)} />
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {hasSuggestion && (
            <Button variant="secondary" icon={<Sparkle className="h-4 w-4" />} onClick={applySuggestion}>
              {t("useSuggestion")}
            </Button>
          )}
          <Input
            label={`${t("metrics.weight_kg")} (kg)`}
            {...numberProps}
            value={draft.weight_kg}
            onChange={(e) => setDraft((d) => ({ ...d, weight_kg: e.target.value }))}
          />
          <div className="space-y-2">
            <span className="text-sm font-medium">{t("fatGoalMetric")}</span>
            <div role="radiogroup" aria-label={t("fatGoalMetric")} className="flex gap-1 rounded-xl bg-surface-muted p-1">
              {FAT_METRICS.map((metric) => (
                <button
                  key={metric}
                  type="button"
                  role="radio"
                  aria-checked={draft.fatMetric === metric}
                  onClick={() => setDraft((d) => ({ ...d, fatMetric: metric }))}
                  className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-medium transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    draft.fatMetric === metric ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
                  }`}
                >
                  {t(`metrics.${metric}`)}
                </button>
              ))}
            </div>
            <Input
              label={`${t(`metrics.${draft.fatMetric}`)} (${METRIC_UNITS[draft.fatMetric]})`}
              {...numberProps}
              value={draft.fat}
              onChange={(e) => setDraft((d) => ({ ...d, fat: e.target.value }))}
            />
          </div>
          <Input
            label={`${t("metrics.skeletal_muscle_kg")} (kg)`}
            {...numberProps}
            value={draft.skeletal_muscle_kg}
            onChange={(e) => setDraft((d) => ({ ...d, skeletal_muscle_kg: e.target.value }))}
          />
          <p className="text-xs text-muted">{t("goalsHelp")}</p>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        <div className="border-t border-border p-4">
          <Button className="w-full" onClick={handleSave} loading={saving}>
            {tc("save")}
          </Button>
        </div>
      </Sheet>
    </section>
  );
}
```

- [ ] **Step 3: Wire into the page**

In `app/(app)/body/page.tsx`:
- Import `listBodyGoals` alongside `listBodyScans`, `suggestedGoalTargets` from `@/lib/body/metrics`, and `{ GoalsCard } from "./GoalsCard"`.
- Replace `const scans = await listBodyScans(prisma, user!.id);` with
  `const [scans, goals] = await Promise.all([listBodyScans(prisma, user!.id), listBodyGoals(prisma, user!.id)]);`
- Insert right after the "latest" `</section>`:

```tsx
          <GoalsCard
            goals={goals}
            current={{
              weight_kg: latest.weight_kg,
              body_fat_pct: latest.body_fat_pct,
              body_fat_kg: latest.body_fat_kg,
              skeletal_muscle_kg: latest.skeletal_muscle_kg,
            }}
            suggestion={suggestedGoalTargets(latest)}
          />
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Manual: Edit → "Use arboleaf's suggestion" fills weight/fat kg/muscle → Save → three bars at 0%. Import a newer scan with lower weight → weight bar moves. Edit a target → bar recomputes from the original start. Clear all fields → Save → "No goals yet."

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/body/GoalProgress.tsx" "app/(app)/body/GoalsCard.tsx" "app/(app)/body/page.tsx"
git commit -m "feat(body): goals card with arboleaf suggestion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Trend chart

**Files:**
- Create: `app/(app)/body/TrendChart.tsx`, `app/(app)/body/TrendChartInner.tsx`
- Modify: `app/(app)/body/page.tsx`

**Interfaces:**
- Consumes: `GOAL_METRICS`, `GoalMetric` (Task 1), `METRIC_UNITS` (Task 2), `formatAxisDate`, `formatShortDate` from `lib/sessions/summary.ts`.
- Produces: `type TrendPoint = { date: string } & Record<GoalMetric, number | null>`; `<TrendChart data={TrendPoint[]} goalTargets={Partial<Record<GoalMetric, number>>} />`.

- [ ] **Step 1: Wrapper (lazy-loads recharts, metric toggle)**

`app/(app)/body/TrendChart.tsx`:

```tsx
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { GOAL_METRICS, type GoalMetric } from "@/lib/body/schema";

// Same lazy-loading as the exercise ProgressChart: recharts stays out of the route's initial JS.
const TrendChartInner = dynamic(() => import("./TrendChartInner"), {
  ssr: false,
  loading: () => <div className="h-64 w-full rounded-lg motion-safe:animate-pulse bg-surface-muted" />,
});

export type TrendPoint = { date: string } & Record<GoalMetric, number | null>;

export function TrendChart({
  data,
  goalTargets,
}: {
  data: TrendPoint[];
  goalTargets: Partial<Record<GoalMetric, number>>;
}) {
  const t = useTranslations("body");
  // Only offer metrics the scans actually report.
  const metrics = GOAL_METRICS.filter((metric) => data.some((point) => point[metric] !== null));
  const [metric, setMetric] = useState<GoalMetric>(metrics[0] ?? "weight_kg");

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={t("trendLabel")} className="flex gap-1 rounded-xl bg-surface-muted p-1">
        {metrics.map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={metric === key}
            onClick={() => setMetric(key)}
            className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-medium transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              metric === key ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            {t(`trendMetrics.${key}`)}
          </button>
        ))}
      </div>
      <TrendChartInner data={data} metric={metric} goal={goalTargets[metric]} />
    </div>
  );
}
```

- [ ] **Step 2: Chart**

`app/(app)/body/TrendChartInner.tsx`:

```tsx
"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { METRIC_UNITS } from "@/lib/body/metrics";
import type { GoalMetric } from "@/lib/body/schema";
import { formatAxisDate, formatShortDate } from "@/lib/sessions/summary";
import type { TrendPoint } from "./TrendChart";

export default function TrendChartInner({
  data,
  metric,
  goal,
}: {
  data: TrendPoint[];
  metric: GoalMetric;
  goal: number | undefined;
}) {
  const locale = useLocale();
  const t = useTranslations("body");
  const format = useFormatter();
  const unit = METRIC_UNITS[metric];
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            stroke="var(--border)"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickFormatter={(date: string) => formatAxisDate(date, locale)}
            minTickGap={16}
          />
          <YAxis
            stroke="var(--border)"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            width={40}
            domain={["auto", "auto"]}
          />
          <Tooltip
            separator=": "
            contentStyle={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--foreground)",
            }}
            labelStyle={{ color: "var(--muted)" }}
            labelFormatter={(label) => formatShortDate(String(label), locale)}
            formatter={(value) => [
              `${format.number(Number(value), { maximumFractionDigits: 2 })} ${unit}`.trim(),
              t(`metrics.${metric}`),
            ]}
          />
          {goal !== undefined && (
            <ReferenceLine
              y={goal}
              stroke="var(--success)"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
              label={{ value: t("goalLine"), fill: "var(--muted)", fontSize: 12, position: "insideTopRight" }}
            />
          )}
          <Line
            type="monotone"
            dataKey={metric}
            connectNulls
            stroke="var(--chart-line)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--chart-line)" }}
            activeDot={{ r: 5 }}
            name={t(`metrics.${metric}`)}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Wire into the page**

In `app/(app)/body/page.tsx`: import `{ TrendChart } from "./TrendChart"`, and insert after `<GoalsCard … />`:

```tsx
          <section className="space-y-2">
            <h2 className="font-medium">{t("trend")}</h2>
            <Card>
              {scans.length >= 2 ? (
                <TrendChart
                  data={scans.map((scan) => ({
                    date: scan.scan_date,
                    weight_kg: scan.weight_kg,
                    body_fat_pct: scan.body_fat_pct,
                    body_fat_kg: scan.body_fat_kg,
                    skeletal_muscle_kg: scan.skeletal_muscle_kg,
                  }))}
                  goalTargets={Object.fromEntries(goals.map((goal) => [goal.metric, goal.target]))}
                />
              ) : (
                <p className="text-sm text-muted">{t("trendNeedsMore")}</p>
              )}
            </Card>
          </section>
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Manual: with one scan → hint text; with ≥2 → line chart; toggle chips; a weight goal shows a dashed "Goal" line and the Y axis extends to include it; check dark mode.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/body/TrendChart.tsx" "app/(app)/body/TrendChartInner.tsx" "app/(app)/body/page.tsx"
git commit -m "feat(body): trend chart with goal line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Balance vs training card

**Files:**
- Create: `app/(app)/body/BalanceCard.tsx`
- Modify: `app/(app)/body/page.tsx`

**Interfaces:**
- Consumes: `BODY_REGIONS`, `leanShare`, `trainingShare`, `limbImbalancePct`, `BodyRegion`, `RegionShare` (Task 3); `countWorkingSetsByMuscleGroup` (Task 5); `addDays` from `lib/date.ts`.
- Produces: `<BalanceCard segments={BodySegments | null} setCounts={{ muscle_group: string | null; sets: number }[]} />`.

- [ ] **Step 1: Component**

`app/(app)/body/BalanceCard.tsx`:

```tsx
import { useFormatter, useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import {
  BODY_REGIONS,
  leanShare,
  limbImbalancePct,
  trainingShare,
  type BodyRegion,
  type RegionShare,
} from "@/lib/body/balance";
import type { BodySegments } from "@/lib/body/schema";

// Full static class names (Tailwind can't see `bg-muscle-${x}`). Trunk uses the core color.
const REGION_BG: Record<BodyRegion, string> = {
  arms: "bg-muscle-arms",
  trunk: "bg-muscle-core",
  legs: "bg-muscle-legs",
};

function ShareBar({ label, share }: { label: string; share: RegionShare }) {
  const t = useTranslations("body");
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-muted">
        {BODY_REGIONS.map((region) => (
          <div key={region} className={REGION_BG[region]} style={{ width: `${share[region]}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {BODY_REGIONS.map((region) => (
          <span key={region} className="flex items-center gap-1">
            <span aria-hidden className={`h-2 w-2 rounded-full ${REGION_BG[region]}`} />
            {t(`regions.${region}`)} {share[region]}%
          </span>
        ))}
      </div>
    </div>
  );
}

function LimbRow({ label, left, right }: { label: string; left: number; right: number }) {
  const t = useTranslations("body");
  const format = useFormatter();
  const n = (value: number) => format.number(value, { maximumFractionDigits: 2 });
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="font-medium">{label}</span>
      <span className="font-mono text-xs tabular-nums text-muted">
        {t("left")} {n(left)} kg · {t("right")} {n(right)} kg ·{" "}
        {t("difference", { pct: n(limbImbalancePct(left, right) ?? 0) })}
      </span>
    </div>
  );
}

// Informational only: sets aren't recorded per side, so L/R can't be tied to training — only the
// arms/trunk/legs split can.
export function BalanceCard({
  segments,
  setCounts,
}: {
  segments: BodySegments | null;
  setCounts: { muscle_group: string | null; sets: number }[];
}) {
  const t = useTranslations("body");
  const lean = leanShare(segments);
  const training = trainingShare(setCounts);
  const limbs = [
    { label: t("regions.arms"), left: segments?.left_arm?.lean_kg, right: segments?.right_arm?.lean_kg },
    { label: t("regions.legs"), left: segments?.left_leg?.lean_kg, right: segments?.right_leg?.lean_kg },
  ].flatMap(({ label, left, right }) =>
    left != null && right != null && limbImbalancePct(left, right) !== null ? [{ label, left, right }] : []
  );
  if (!lean && limbs.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="font-medium">{t("balance")}</h2>
      <Card className="space-y-5">
        {limbs.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm text-muted">{t("leftRight")}</h3>
            {limbs.map((limb) => (
              <LimbRow key={limb.label} {...limb} />
            ))}
          </div>
        )}
        {lean && (
          <div className="space-y-3">
            <h3 className="text-sm text-muted">{t("regionShare")}</h3>
            <ShareBar label={t("leanShareLabel")} share={lean} />
            {training ? (
              <ShareBar label={t("trainingShareLabel")} share={training} />
            ) : (
              <p className="text-sm text-muted">{t("noTrainingSets")}</p>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
```

- [ ] **Step 2: Wire into the page**

In `app/(app)/body/page.tsx`:
- Import `addDays` with `getTodayString` (`import { addDays, getTodayString } from "@/lib/date";`), `countWorkingSetsByMuscleGroup` from the service, `{ BalanceCard } from "./BalanceCard"`.
- Above the component add:

```ts
// The balance card compares the latest scan with this many days of training (today inclusive).
const BALANCE_WINDOW_DAYS = 28;
```

- Change the data fetch to:

```ts
  const [scans, goals, setCounts] = await Promise.all([
    listBodyScans(prisma, user!.id),
    listBodyGoals(prisma, user!.id),
    countWorkingSetsByMuscleGroup(prisma, user!.id, addDays(today, -(BALANCE_WINDOW_DAYS - 1)), today),
  ]);
```

- Insert after the trend `</section>`: `<BalanceCard segments={latest.segments} setCounts={setCounts} />`

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Manual: with the sample scan imported → arms/legs L/R rows and the lean-mass bar; with no workouts in 28 days → "No working sets…"; after finishing a workout with Legs + Chest sets → the training bar appears. Check light/dark colors are distinguishable.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/body/BalanceCard.tsx" "app/(app)/body/page.tsx"
git commit -m "feat(body): muscle balance vs training card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Dashboard Body card

**Files:**
- Create: `app/(app)/dashboard/BodyCard.tsx`
- Modify: `app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getLatestBodySummary`, `listBodyGoals`, `BodySummary`, `BodyGoal` (Tasks 4–5), `METRIC_UNITS`, `scanDelta` (Task 2), `DeltaBadge` (Task 6), `GoalProgress` (Task 9), `formatRelativeDate`.

- [ ] **Step 1: Component**

`app/(app)/dashboard/BodyCard.tsx`:

```tsx
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { CaretRight, PersonSimple } from "@phosphor-icons/react/ssr";
import { Card } from "@/components/ui/Card";
import { METRIC_UNITS, scanDelta } from "@/lib/body/metrics";
import type { ScanMetricKey } from "@/lib/body/schema";
import type { BodyGoal, BodySummary } from "@/lib/body/service";
import { formatRelativeDate } from "@/lib/sessions/summary";
import { DeltaBadge } from "../body/DeltaBadge";
import { GoalProgress } from "../body/GoalProgress";

const CARD_METRICS: ScanMetricKey[] = ["weight_kg", "body_fat_pct", "skeletal_muscle_kg"];

const LINK_CLASS =
  "block rounded-2xl p-4 transition [touch-action:manipulation] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// The phone's way into /body (it has no bottom-nav tab), so it's shown even with no scans.
export function BodyCard({
  summary,
  goals,
  today,
}: {
  summary: BodySummary | null;
  goals: BodyGoal[];
  today: string;
}) {
  const t = useTranslations("dashboard");
  const tb = useTranslations("body");
  const tc = useTranslations("common");
  const locale = useLocale();
  const format = useFormatter();

  if (!summary) {
    return (
      <Card padding={false}>
        <Link href="/body" className={`${LINK_CLASS} flex items-center gap-3`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <PersonSimple className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{t("bodyEmptyTitle")}</span>
            <span className="block text-sm text-muted">{t("bodyEmptyDescription")}</span>
          </span>
          <CaretRight className="h-4 w-4 shrink-0 text-muted" />
        </Link>
      </Card>
    );
  }

  const { latest, previous } = summary;
  const when = formatRelativeDate(latest.scan_date, today, locale, {
    today: tc("today"),
    yesterday: tc("yesterday"),
  });

  return (
    <Card padding={false}>
      <Link href="/body" className={`${LINK_CLASS} space-y-4`}>
        <div className="flex items-center justify-between gap-2 text-sm text-muted">
          <span>{t("bodyLastScan", { when })}</span>
          <CaretRight className="h-4 w-4 shrink-0" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {CARD_METRICS.map((metric) => {
            const value = latest[metric];
            return (
              <div key={metric} className="min-w-0 space-y-1">
                <div className="truncate text-xs font-medium text-muted">{tb(`metrics.${metric}`)}</div>
                <div className="font-mono text-lg font-semibold tabular-nums">
                  {value === null ? "–" : format.number(value, { maximumFractionDigits: 2 })}
                  {METRIC_UNITS[metric] && (
                    <span className="ml-1 text-xs font-normal text-muted">{METRIC_UNITS[metric]}</span>
                  )}
                </div>
                <DeltaBadge metric={metric} delta={previous ? scanDelta(value, previous[metric]) : null} />
              </div>
            );
          })}
        </div>
        {goals.length > 0 && (
          <div className="space-y-3">
            {goals.map((goal) => (
              <GoalProgress
                key={goal.metric}
                label={tb(`metrics.${goal.metric}`)}
                unit={METRIC_UNITS[goal.metric]}
                start={goal.start_value}
                target={goal.target}
                current={latest[goal.metric]}
              />
            ))}
          </div>
        )}
      </Link>
    </Card>
  );
}
```

- [ ] **Step 2: Wire into the dashboard**

In `app/(app)/dashboard/page.tsx`:
- Add imports: `import { getLatestBodySummary, listBodyGoals } from "@/lib/body/service";` and `import { BodyCard } from "./BodyCard";`.
- Extend the `Promise.all`:

```ts
  const [inProgress, newPrs, overview, weeklyVolume, topPrs, recentWorkouts, bodySummary, bodyGoals] =
    await Promise.all([
      getInProgressSessions(),
      listPrsFromLastCompletedSession(prisma, user!.id),
      getOverviewStats(prisma, user!.id, today),
      getWeeklyVolume(prisma, user!.id, 8, today),
      listTopPrs(prisma, user!.id, MAX_PRS),
      listCompletedSessions(prisma, user!.id, { take: 5 }),
      getLatestBodySummary(prisma, user!.id),
      listBodyGoals(prisma, user!.id),
    ]);
```

- Insert directly after the Overview `</section>` (before `{hasWeeklyVolume && (`):

```tsx
      <section className="space-y-2">
        <h2 className="font-medium">{t("bodyTitle")}</h2>
        <BodyCard summary={bodySummary} goals={bodyGoals} today={today} />
      </section>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Manual: user with no scans → compact "Track your body composition" card linking to `/body`; with scans → three values + deltas + goal bars, "Last scan: Today"; mobile width (375px) has no overflow.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard/BodyCard.tsx" "app/(app)/dashboard/page.tsx"
git commit -m "feat(dashboard): body composition card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: arboleaf → JSON skill, docs, final verification

**Files:**
- Create: `.claude/skills/arboleaf-to-json/SKILL.md`
- Modify: `CLAUDE.md`, `todo.md`

- [ ] **Step 1: Project skill**

`.claude/skills/arboleaf-to-json/SKILL.md`:

````markdown
---
name: arboleaf-to-json
description: Convert an arboleaf body-composition PDF export into the workout tracker's body-scan import JSON (version 1). Use when the user shares an arboleaf PDF or asks to import a scale scan into the Body page.
---

# arboleaf PDF → body-scan import JSON

arboleaf exports one **image-only** PDF per measurement (no text layer — read it with the Read tool,
which renders the pages as images). Two layouts exist (2-page and 3-page); both carry the same values.
`lib/body/schema.ts` is the source of truth for the format — re-read it if anything here disagrees.

If the PDF is under `~/Downloads`, Read may fail with `EPERM` (macOS privacy). Ask the user to copy it
into the repo root (`*.pdf` is gitignored).

## Output

Write `body-scans/<YYYY-MM-DD-HHmm>.json` (gitignored — never commit it, never `git add -f`). Several
scans can go in one file. Then tell the user to open **ร่างกาย / Body → Import scan** and choose the file
(or paste its contents); the page validates and previews before saving. Re-importing the same scan
time replaces the saved one, so fixing a misread value is just "edit the JSON, import again".

```json
{ "version": 1, "source": "arboleaf", "scans": [ { …scan… } ] }
```

## Rules

- `measured_at`: the report's "Time" is `DD/MM/YYYY HH:mm` Bangkok local →
  `"YYYY-MM-DDTHH:mm:00+07:00"`. Never write a time without the offset.
- Numbers only — strip `kg`, `%`, `L`, `kcal`. Omit anything the report doesn't show; never estimate.
- Read every number twice against the image before writing; the values are small and easy to misread.
- Verdicts and labels stay in the report's own English (they're shown verbatim).

## Field mapping

| JSON key | Report label |
|---|---|
| `weight_kg` | Weight (kg) |
| `bmi` | BMI |
| `body_fat_pct` | PBF / Body Fat Percentage |
| `body_fat_kg` | Body Fat Mass |
| `skeletal_muscle_kg` | Skeletal Muscle (kg) |
| `skeletal_muscle_pct` | Skeletal Muscle (%) |
| `muscle_mass_pct` | Muscle Mass Percentage |
| `soft_lean_mass_kg` | Soft Lean Mass |
| `fat_free_mass_kg` | Fat Free Mass / LBM |
| `body_water_l` | Body Water (L) |
| `body_water_pct` | Body Water Percentage |
| `protein_kg` | Protein (kg) |
| `protein_pct` | Protein Percentage |
| `bone_mass_kg` | Bone Mass (kg) |
| `bone_mass_pct` | Bone Mass Percentage |
| `visceral_fat` | Visceral Fat |
| `subcutaneous_fat_pct` | Subcutaneous Fat Percentage |
| `subcutaneous_fat_kg` | Subcutaneous Fat (kg) |
| `bmr_kcal` | BMR |
| `smi` | SMI |
| `waist_hip_ratio` | Waist-Hip Ratio |
| `fitness_score` | Fitness score (the number out of 100) |
| `height_cm`, `age` | Header: Height, Age |

`segments` — keys `left_arm`, `right_arm`, `trunk`, `left_leg`, `right_leg` (the figure's L/R labels;
the trunk is the middle callout):
- "Muscle Balance" callout `3.1kg / 94.4% Sufficient` → `lean_kg: 3.1, lean_pct: 94.4, lean_eval: "Sufficient"`
- "Segmental Fat Analysis" callout `0.89kg / 141.8% Sufficient` → `fat_kg`, `fat_pct`, `fat_eval`
- "Balanced muscle mass ratio" % → `muscle_ratio_pct`; "Segmental fat percentage analysis" % → `fat_ratio_pct`

`report`:
- `ranges`: each "Normal Range" as `[min, max]` under the metric's JSON key; open ends are `null`
  (`<=0.9` → `[null, 0.9]`).
- `evaluations`: verdicts that belong to one metric, under its JSON key — Nutrition Evaluation (Body
  Water → `body_water_l`, Protein → `protein_kg`, Body Fat Mass → `body_fat_kg`, Bone Mass →
  `bone_mass_kg`) and Fat Analysis (BMI → `bmi`, PBF → `body_fat_pct`). Use the checked box's text.
- `assessments`: the other checklist rows, labelled as in the report: `"Upper extremity balance"`,
  `"Lower extremity balance"`, `"Upper and lower extremities balance"`, `"Upper extremity strength"`,
  `"Lower extremity strength"`, `"Muscle strength"` → the checked box's text.
- `weight_control`: Normal weight → `normal_weight_kg`; Weight Control → `weight_kg`; Fat mass control →
  `fat_kg`; Muscle control → `muscle_kg` (keep the sign).
- `advice`: the "Analysis and Advice" paragraph.

## Example (synthetic numbers)

```json
{
  "version": 1,
  "source": "arboleaf",
  "scans": [
    {
      "measured_at": "2026-10-18T09:58:00+07:00",
      "weight_kg": 80, "bmi": 24.7, "body_fat_pct": 22, "body_fat_kg": 17.6,
      "skeletal_muscle_kg": 35, "skeletal_muscle_pct": 43.8, "muscle_mass_pct": 72.5,
      "soft_lean_mass_kg": 58, "fat_free_mass_kg": 62.4, "body_water_l": 45.5, "body_water_pct": 56.9,
      "protein_kg": 12.4, "protein_pct": 15.5, "bone_mass_kg": 4, "bone_mass_pct": 5,
      "visceral_fat": 8, "subcutaneous_fat_pct": 19.5, "subcutaneous_fat_kg": 15.6, "bmr_kcal": 1720,
      "smi": 8.4, "waist_hip_ratio": 0.9, "fitness_score": 72, "height_cm": 180, "age": 35,
      "segments": {
        "left_arm": { "lean_kg": 3.4, "lean_pct": 98, "lean_eval": "Sufficient", "fat_kg": 0.9, "fat_pct": 140, "fat_eval": "Sufficient", "muscle_ratio_pct": 4.3, "fat_ratio_pct": 1.1 },
        "right_arm": { "lean_kg": 3.6, "lean_pct": 101, "lean_eval": "Sufficient", "fat_kg": 0.9, "fat_pct": 140, "fat_eval": "Sufficient", "muscle_ratio_pct": 4.5, "fat_ratio_pct": 1.1 },
        "trunk": { "lean_kg": 28, "lean_pct": 99, "lean_eval": "Sufficient", "fat_kg": 9, "fat_pct": 200, "fat_eval": "Over", "muscle_ratio_pct": 35, "fat_ratio_pct": 11.3 },
        "left_leg": { "lean_kg": 10, "lean_pct": 103, "lean_eval": "Sufficient", "fat_kg": 2.7, "fat_pct": 145, "fat_eval": "Sufficient", "muscle_ratio_pct": 12.5, "fat_ratio_pct": 3.4 },
        "right_leg": { "lean_kg": 10.4, "lean_pct": 104, "lean_eval": "Sufficient", "fat_kg": 2.7, "fat_pct": 145, "fat_eval": "Sufficient", "muscle_ratio_pct": 13, "fat_ratio_pct": 3.4 }
      },
      "report": {
        "ranges": { "weight_kg": [60, 81], "body_fat_pct": [10, 20], "waist_hip_ratio": [null, 0.9] },
        "evaluations": { "body_fat_pct": "Mild obesity", "bmi": "Normal" },
        "assessments": { "Lower extremity balance": "Slightly uneven" },
        "weight_control": { "normal_weight_kg": 74, "weight_kg": -6, "fat_kg": -7, "muscle_kg": 1 },
        "advice": "Combine strength training with cardio."
      }
    }
  ]
}
```
````

- [ ] **Step 2: Docs**

`CLAUDE.md` — add this bullet to **Gotchas** (after the "Referral codes are vestigial" bullet):

```markdown
- **Body scans (`/body`) are imported, not typed.** Claude Code turns an arboleaf PDF (image-only) into version-1 JSON with the `arboleaf-to-json` project skill (`.claude/skills/`); the user pastes/picks it on `/body`, validated by `lib/body/schema.ts` (same zod schema client preview + server) and upserted by `(user_id, measured_at)` — re-importing replaces. JSON keys = `body_scans` columns; `segments`/`report` are jsonb (report verdicts/labels/advice are shown verbatim, untranslated). Goals (`body_goals`, ≤1 fat goal) keep `start_value` when only the target changes. `/body` has no bottom-nav tab (phone bar is full) — phones get there via the dashboard Body card / account menu; desktop via `TOP_NAV_ITEMS`. `0003_body_scans` is hand-written SQL applied with `migrate deploy` (`migrate dev` would drop the unmodeled `users` FKs). Scans/goals are **not** in the JSON backup yet. `*.pdf` and `/body-scans/` are gitignored — health data, never commit.
```

`todo.md` — insert at the top, under `# TODO`:

```markdown
## Next — Body scans follow-ups

- Include `body_scans` / `body_goals` in the JSON backup (`exportUserData`, `ImportSummary`, and the
  `import_backup` SQL function).
- In-app PDF upload: send the PDF to the Claude API for extraction, then reuse the `/body` import
  preview/confirm flow.
- Strength relative to bodyweight on exercise pages (e1RM ÷ weight at that date).

## Done — Body composition tracking (2026-10-31)

`/body`: import arboleaf scans as JSON (made by Claude Code via the `arboleaf-to-json` skill), latest
snapshot with deltas, goals (with arboleaf's suggestion), trend chart, muscle balance vs training,
full per-scan report; dashboard Body card. Spec/plan in `docs/superpowers/{specs,plans}/2026-10-31-*`.
```

- [ ] **Step 3: Full verification**

```bash
npm test
DOTENV_CONFIG_PATH=.env.local npm run test:db
npx tsc --noEmit && npm run lint
git status --short   # no *.pdf, nothing under body-scans/
```

Expected: all green; status shows only intended files.

Manual end-to-end (restart `next dev` first — message JSON is cached): follow the skill on the real arboleaf PDF in the repo root → write `body-scans/…json` → import on `/body` → snapshot, goals ("use suggestion" → save), detail report, balance card; dashboard card; Thai + English, light + dark, 375px width. Authenticated pages need the user's Google sign-in in the browser pane — if not signed in, ask the user to sign in (never enter credentials).

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/arboleaf-to-json/SKILL.md CLAUDE.md todo.md
git commit -m "docs(body): arboleaf-to-json skill, CLAUDE.md and todo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
