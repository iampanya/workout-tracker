# Per-exercise Weight Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The log screen's next-session target adds or removes weight by a per-exercise step (custom → inferred from logged weights → muscle-group default) instead of a muscle-group constant, so targets match the gym's real equipment.

**Architecture:** Pure step resolution lives next to `nextTarget` in `lib/insights/progression.ts`. A new per-user table `exercise_settings` stores custom steps; `lib/exercises/settings.ts` loads/saves them and infers from `sets`. A shared `WeightStepSheet` client component edits the step from the log screen's target chip and from `/exercises/[id]`.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7 + Postgres, zod 4, next-intl 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-07-exercise-weight-step-design.md`

## Global Constraints

- Every service query filters by `user_id`; an exercise is usable only if `user_id IS NULL` (preset) or `user_id = userId`. Every service gets cross-user isolation tests.
- `lib/<domain>/*.ts` services never import `lib/session.ts` / next-auth / next-intl.
- Schema changes: hand-written migration folder (never plain `prisma migrate dev`, see CLAUDE.md "Known drift"), additive only (expand/contract).
- Postgres `numeric` → Prisma `Decimal`: coerce with `Number()` before returning.
- No hardcoded UI strings: every visible string, aria-label and placeholder goes in **both** `messages/en.json` and `messages/th.json`. Client catch blocks show a translated `te("…")`, never `err.message`.
- Icons from `@phosphor-icons/react/ssr` only.
- Sheets/dialogs use `components/ui/Sheet.tsx` (portal) — no inline modals.
- The weight field's +/− stepper keeps `WEIGHT_STEP` (2.5 kg) — do not change it.
- Weights are kg everywhere, no unit conversion.
- No Prettier; formatting is ESLint-only.
- After editing `messages/*.json`, restart `next dev` before browser checks.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/insights/progression.ts` | modify | `WeightStep` type, `WEIGHT_STEP_PRESETS`, `inferStepFromWeights`, `resolveWeightStep` (pure) |
| `lib/insights/progression.test.ts` | modify | tests for the above |
| `lib/validation.ts` / `lib/validation.test.ts` | modify | `updateWeightStepSchema` |
| `prisma/migrations/0006_exercise_weight_step/migration.sql` | create | `exercise_settings` table |
| `prisma/schema.prisma` | modify | `exercise_settings` model + back-relation on `exercises` |
| `lib/exercises/settings.ts` | create | `getWeightSteps`, `setWeightStepForUser` |
| `lib/exercises/settings.test.ts` | create | DB tests incl. isolation |
| `lib/actions/exercises.ts` | modify | `setExerciseWeightStep` action |
| `lib/actions/sessions.ts` | modify | `addExerciseToSession` also returns `weightStep` |
| `components/exercises/WeightStepSheet.tsx` | create | shared edit sheet |
| `messages/en.json`, `messages/th.json` | modify | `weightStep` namespace + `errors.weightStep` |
| `app/(app)/log/[sessionId]/types.ts` | modify | `ExerciseEntry.weightStep`, `.recentSessions` |
| `app/(app)/log/[sessionId]/page.tsx` | modify | load steps, compute target with them |
| `app/(app)/log/[sessionId]/LoggingClient.tsx` | modify | added-exercise step, step-saved handler |
| `app/(app)/log/[sessionId]/ExerciseCard.tsx` | modify | target chip, sheet, form reset on target change |
| `app/(app)/exercises/[exerciseId]/WeightStepRow.tsx` | create | step row + sheet on the exercise page |
| `app/(app)/exercises/[exerciseId]/page.tsx` | modify | load step, render row |
| `CLAUDE.md`, `CONTEXT.md` | modify | docs |

---

### Task 1: Pure step resolution + validation schema

**Files:**
- Modify: `lib/insights/progression.ts` (after `stepFor`, ~line 30)
- Modify: `lib/insights/progression.test.ts`
- Modify: `lib/validation.ts` (after `updateRoutineRepRangeSchema`, ~line 68)
- Modify: `lib/validation.test.ts`

**Interfaces:**
- Consumes: existing `stepFor(muscleGroup: string | null): number`, `round2` (private, same file).
- Produces:
  ```ts
  export type WeightStepSource = "custom" | "history" | "default";
  export type WeightStep = { kg: number; source: WeightStepSource; autoKg: number; autoSource: "history" | "default" };
  export const WEIGHT_STEP_PRESETS: number[]; // [1, 1.25, 2, 2.5, 4.5, 5, 10]
  export function inferStepFromWeights(weights: number[]): number | null;
  export function resolveWeightStep(input: { customKg: number | null; loggedWeights: number[]; muscleGroup: string | null }): WeightStep;
  // lib/validation.ts
  export const updateWeightStepSchema: z.ZodObject<{ weightStepKg: number | null }>;
  ```

- [ ] **Step 1: Write the failing tests**

In `lib/insights/progression.test.ts`, extend the import and append:

```ts
import {
  DEFAULT_REP_RANGE,
  REP_RANGE_PRESETS,
  WEIGHT_STEP_PRESETS,
  inferStepFromWeights,
  nextTarget,
  parseRepRange,
  repRangeValue,
  resolveWeightStep,
  stepFor,
} from "./progression";
```

```ts
describe("inferStepFromWeights", () => {
  it("returns the most common gap between neighbouring weights", () => {
    expect(inferStepFromWeights([10, 12, 14, 16])).toBe(2);
    expect(inferStepFromWeights([40, 45, 50, 52.5])).toBe(5);
  });

  it("ignores duplicates, order and non-positive weights", () => {
    expect(inferStepFromWeights([14, 10, 12, 12, 0, 10])).toBe(2);
  });

  it("is not dragged down by a single typo once there is enough history", () => {
    expect(inferStepFromWeights([60, 61, 65, 70, 75])).toBe(5);
  });

  it("breaks a tie with the smaller gap", () => {
    expect(inferStepFromWeights([20, 22.5, 27.5])).toBe(2.5); // gaps 2.5, 5
  });

  it("handles fractional machine and plate steps", () => {
    expect(inferStepFromWeights([4.5, 9, 13.5, 18])).toBe(4.5);
    expect(inferStepFromWeights([20, 21.25, 22.5])).toBe(1.25);
  });

  it("returns null with fewer than two distinct weights", () => {
    expect(inferStepFromWeights([])).toBeNull();
    expect(inferStepFromWeights([60, 60])).toBeNull();
    expect(inferStepFromWeights([0, 60])).toBeNull();
  });
});

describe("resolveWeightStep", () => {
  it("prefers the custom step but still reports the automatic one", () => {
    expect(resolveWeightStep({ customKg: 5, loggedWeights: [10, 12, 14], muscleGroup: "Shoulders" })).toEqual({
      kg: 5,
      source: "custom",
      autoKg: 2,
      autoSource: "history",
    });
  });

  it("falls back to the history inference", () => {
    expect(resolveWeightStep({ customKg: null, loggedWeights: [10, 12, 14], muscleGroup: "Legs" })).toEqual({
      kg: 2,
      source: "history",
      autoKg: 2,
      autoSource: "history",
    });
  });

  it("falls back to the muscle-group default without history", () => {
    expect(resolveWeightStep({ customKg: null, loggedWeights: [60], muscleGroup: "Legs" })).toEqual({
      kg: 5,
      source: "default",
      autoKg: 5,
      autoSource: "default",
    });
    expect(resolveWeightStep({ customKg: 2, loggedWeights: [], muscleGroup: null })).toEqual({
      kg: 2,
      source: "custom",
      autoKg: 1.25,
      autoSource: "default",
    });
  });
});

describe("nextTarget with a per-exercise step", () => {
  it("adds and removes exactly the step it is given", () => {
    expect(nextTarget([session([set(12, 12), set(12, 12)])], R, 2)).toEqual({
      weightKg: 14,
      reps: 8,
      reason: "addWeight",
    });
    const stalled = [session([set(50, 6)]), session([set(50, 6)], "2026-09-24")];
    expect(nextTarget(stalled, R, 5)).toEqual({ weightKg: 45, reps: 8, reason: "reset" });
  });
});

describe("WEIGHT_STEP_PRESETS", () => {
  it("is sorted and every value is a positive 2-decimal step", () => {
    expect([...WEIGHT_STEP_PRESETS].sort((a, b) => a - b)).toEqual(WEIGHT_STEP_PRESETS);
    for (const kg of WEIGHT_STEP_PRESETS) expect(Math.round(kg * 100) / 100).toBe(kg);
  });
});
```

In `lib/validation.test.ts`, add `updateWeightStepSchema` to the existing `@/lib/validation` (or `./validation`) import and append:

```ts
describe("updateWeightStepSchema", () => {
  it("accepts a positive step up to 50 kg with at most two decimals, or null", () => {
    for (const weightStepKg of [0.5, 1.25, 2, 4.5, 50, null]) {
      expect(updateWeightStepSchema.safeParse({ weightStepKg }).success).toBe(true);
    }
  });

  it("rejects zero, negatives, over 50 kg and more than two decimals", () => {
    for (const weightStepKg of [0, -1, 50.01, 1.234, Number.NaN]) {
      expect(updateWeightStepSchema.safeParse({ weightStepKg }).success).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/insights/progression.test.ts lib/validation.test.ts`
Expected: FAIL — `inferStepFromWeights` / `resolveWeightStep` / `WEIGHT_STEP_PRESETS` / `updateWeightStepSchema` are not exported.

- [ ] **Step 3: Implement**

In `lib/insights/progression.ts`, after the existing `round2` helper (~line 31), add:

```ts
// Where the weight step for an exercise came from. "custom" = set by the user
// (exercise_settings), "history" = inferred from the weights they have logged, "default" = stepFor.
export type WeightStepSource = "custom" | "history" | "default";
// kg = the step in use; autoKg/autoSource = what it would be with no custom value.
export type WeightStep = {
  kg: number;
  source: WeightStepSource;
  autoKg: number;
  autoSource: "history" | "default";
};

// Chips in WeightStepSheet: dumbbell racks (1, 2, 2.5), fractional plates (1.25), lb-based stacks
// (4.5 ≈ 10 lb), plate pairs and stacks (5, 10).
export const WEIGHT_STEP_PRESETS = [1, 1.25, 2, 2.5, 4.5, 5, 10];

// The most common gap between neighbouring distinct weights (tie → the smaller gap), or null with
// fewer than two. The mode rather than the smallest gap, so one typo needs to be outvoted rather
// than winning outright.
export function inferStepFromWeights(weights: number[]): number | null {
  const distinct = [...new Set(weights.filter((w) => w > 0))].sort((a, b) => a - b);
  if (distinct.length < 2) return null;
  const counts = new Map<number, number>();
  for (let i = 1; i < distinct.length; i++) {
    const gap = round2(distinct[i] - distinct[i - 1]);
    counts.set(gap, (counts.get(gap) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [gap, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && gap < best)) {
      best = gap;
      bestCount = count;
    }
  }
  return best;
}

// custom → inferred from logged working weights → muscle-group default.
export function resolveWeightStep({
  customKg,
  loggedWeights,
  muscleGroup,
}: {
  customKg: number | null;
  loggedWeights: number[];
  muscleGroup: string | null;
}): WeightStep {
  const inferred = inferStepFromWeights(loggedWeights);
  const autoKg = inferred ?? stepFor(muscleGroup);
  const autoSource = inferred !== null ? "history" : "default";
  return customKg !== null
    ? { kg: customKg, source: "custom", autoKg, autoSource }
    : { kg: autoKg, source: autoSource, autoKg, autoSource };
}
```

Also update the `stepFor` comment to: `// Muscle-group default weight step, used when an exercise has no custom step and too little history (resolveWeightStep).`

In `lib/validation.ts`, after `updateRoutineRepRangeSchema`:

```ts
// Per-exercise weight step for the next-session target (exercise_settings.weight_step_kg,
// numeric(5,2) with CHECK > 0 AND <= 50). null = back to automatic.
export const updateWeightStepSchema = z.object({
  weightStepKg: z
    .number()
    .positive()
    .max(50)
    .refine((kg) => Math.abs(Math.round(kg * 100) - kg * 100) < 1e-6)
    .nullable(),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/insights/progression.test.ts lib/validation.test.ts`
Expected: PASS (all, including the pre-existing `nextTarget` tests).

- [ ] **Step 5: Commit**

```bash
git add lib/insights/progression.ts lib/insights/progression.test.ts lib/validation.ts lib/validation.test.ts
git commit -m "feat(insights): resolve a per-exercise weight step (custom, history, default)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `exercise_settings` table + settings service

**Files:**
- Create: `prisma/migrations/0006_exercise_weight_step/migration.sql`
- Modify: `prisma/schema.prisma` (`model exercises` ~line 50; new model after it)
- Create: `lib/exercises/settings.ts`
- Test: `lib/exercises/settings.test.ts` (picked up by `test:db` automatically — it runs every test file not in its `--exclude` list; do **not** add it to `npm test`)

**Interfaces:**
- Consumes: `resolveWeightStep`, `WeightStep` (Task 1, `@/lib/insights/progression`); `updateWeightStepSchema` (Task 1, `@/lib/validation`).
- Produces:
  ```ts
  export async function getWeightSteps(db: PrismaClient, userId: string, exerciseIds: string[]): Promise<Record<string, WeightStep>>;
  export async function setWeightStepForUser(db: PrismaClient, userId: string, exerciseId: string, input: unknown /* { weightStepKg: number | null } */): Promise<WeightStep>;
  ```
  `getWeightSteps` omits exercises the user can't see (another user's custom exercise, unknown id).

- [ ] **Step 1: Write the migration**

`prisma/migrations/0006_exercise_weight_step/migration.sql`:

```sql
-- Per-user weight step for an exercise, used by the next-session target (resolveWeightStep in
-- lib/insights/progression.ts). Presets are shared rows (exercises.user_id IS NULL), so the step
-- can't live on exercises. Additive only: old deployments never read this table.
CREATE TABLE public.exercise_settings (
    user_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    weight_step_kg numeric(5,2) NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exercise_settings_pkey PRIMARY KEY (user_id, exercise_id),
    CONSTRAINT exercise_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT exercise_settings_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE,
    CONSTRAINT exercise_settings_weight_step_check CHECK (weight_step_kg > 0 AND weight_step_kg <= 50)
);
```

- [ ] **Step 2: Add the Prisma model (hand-written, no `db pull`)**

In `prisma/schema.prisma`, inside `model exercises` add the back-relation line after `sets sets[]`:

```prisma
  exercise_settings exercise_settings[]
```

and add after `model exercises { … }`:

```prisma
model exercise_settings {
  user_id        String    @db.Uuid
  exercise_id    String    @db.Uuid
  weight_step_kg Decimal   @db.Decimal(5, 2)
  updated_at     DateTime  @default(now()) @db.Timestamptz(6)
  exercises      exercises @relation(fields: [exercise_id], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@id([user_id, exercise_id])
}
```

(Like the other tables, the `user_id → users` FK is not modeled — that is the documented known drift.)

- [ ] **Step 3: Apply locally and check drift**

Save a schema fingerprint first, outside the repo (your scratchpad if you have one):
```bash
psql "$DATABASE_URL" -AtqXf scripts/schema-fingerprint.sql > <scratch>/fp-before.txt
```
(`DATABASE_URL` from `.env.local`; export it in the shell first.) Then:
```bash
npm run db:migrate
npx prisma generate
psql "$DATABASE_URL" -AtqXf scripts/schema-fingerprint.sql > <scratch>/fp-after.txt
diff <scratch>/fp-before.txt <scratch>/fp-after.txt
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```
Expected: `migrate deploy` applies `0006_exercise_weight_step`; the fingerprint diff shows only the new table, its PK, two FKs and the CHECK. The `migrate diff` output contains only the known-drift statements listed in CLAUDE.md (`DROP CONSTRAINT …_user_id_fkey` for every table, now including `exercise_settings_user_id_fkey`, plus the `accounts` FK swap, `accounts_user_id_idx`, `exercises_user_name_key`) and **nothing** about `exercise_settings_exercise_id_fkey`, its PK or its columns. If it does, fix the model until it doesn't.

- [ ] **Step 4: Write the failing DB tests**

`lib/exercises/settings.test.ts`:

```ts
import "dotenv/config";
import { describe, it, expect } from "vitest";
import { createTestUser } from "@/lib/test-helpers";
import { prisma } from "@/lib/db";
import { createCustomExerciseForUser } from "./service";
import {
  startSessionForUser,
  addExerciseToSessionForUser,
  logSetForUser,
  finishSessionForUser,
} from "@/lib/sessions/service";
import { getWeightSteps, setWeightStepForUser } from "./settings";

// One completed session of `exerciseId` with the given working (and warmup) weights.
async function logWeights(userId: string, exerciseId: string, working: number[], warmups: number[] = []) {
  const session = await startSessionForUser(prisma, userId, { sessionDate: "2026-10-01" });
  const se = await addExerciseToSessionForUser(prisma, userId, session.id, exerciseId);
  for (const weightKg of warmups) {
    await logSetForUser(prisma, userId, { sessionExerciseId: se.id, weightKg, reps: 10, isWarmup: true });
  }
  for (const weightKg of working) {
    await logSetForUser(prisma, userId, { sessionExerciseId: se.id, weightKg, reps: 8, isWarmup: false });
  }
  await finishSessionForUser(prisma, userId, session.id);
}

async function shoulderPresets() {
  return prisma.exercises.findMany({
    where: { is_preset: true, muscle_group: "Shoulders" },
    orderBy: { name: "asc" },
    take: 2,
  });
}

describe("getWeightSteps", () => {
  it("returns {} for no ids", async () => {
    const { userId } = await createTestUser();
    expect(await getWeightSteps(prisma, userId, [])).toEqual({});
  });

  it("uses the muscle-group default without history", async () => {
    const { userId } = await createTestUser();
    const [preset] = await shoulderPresets();
    expect((await getWeightSteps(prisma, userId, [preset.id]))[preset.id]).toEqual({
      kg: 1.25,
      source: "default",
      autoKg: 1.25,
      autoSource: "default",
    });
  });

  it("infers from logged working weights, ignoring warmups", async () => {
    const { userId } = await createTestUser();
    const [preset] = await shoulderPresets();
    // Warmups 11/13 would make the gap 1 if they counted.
    await logWeights(userId, preset.id, [10, 12, 14], [11, 13]);
    expect((await getWeightSteps(prisma, userId, [preset.id]))[preset.id]).toEqual({
      kg: 2,
      source: "history",
      autoKg: 2,
      autoSource: "history",
    });
  });
});

describe("setWeightStepForUser", () => {
  it("sets, updates and clears a custom step", async () => {
    const { userId } = await createTestUser();
    const [preset] = await shoulderPresets();
    await logWeights(userId, preset.id, [10, 12, 14]);

    expect(await setWeightStepForUser(prisma, userId, preset.id, { weightStepKg: 5 })).toEqual({
      kg: 5,
      source: "custom",
      autoKg: 2,
      autoSource: "history",
    });
    expect((await setWeightStepForUser(prisma, userId, preset.id, { weightStepKg: 2.5 })).kg).toBe(2.5);
    expect((await getWeightSteps(prisma, userId, [preset.id]))[preset.id].kg).toBe(2.5);

    expect(await setWeightStepForUser(prisma, userId, preset.id, { weightStepKg: null })).toEqual({
      kg: 2,
      source: "history",
      autoKg: 2,
      autoSource: "history",
    });
    expect(await prisma.exercise_settings.count({ where: { user_id: userId } })).toBe(0);
  });

  it("rejects invalid steps and unknown exercises", async () => {
    const { userId } = await createTestUser();
    const [preset] = await shoulderPresets();
    for (const weightStepKg of [0, 51, 1.234]) {
      await expect(setWeightStepForUser(prisma, userId, preset.id, { weightStepKg })).rejects.toThrow();
    }
    await expect(
      setWeightStepForUser(prisma, userId, "00000000-0000-0000-0000-000000000000", { weightStepKg: 2 })
    ).rejects.toThrow();
  });

  // Isolation: replaces the RLS guarantee now that queries run on a direct connection.
  it("keeps steps, custom exercises and history per user", async () => {
    const a = (await createTestUser()).userId;
    const b = (await createTestUser()).userId;
    const [p1, p2] = await shoulderPresets();

    // A's custom step on a shared preset is invisible to B.
    await setWeightStepForUser(prisma, a, p1.id, { weightStepKg: 5 });
    expect((await getWeightSteps(prisma, b, [p1.id]))[p1.id].source).toBe("default");

    // B can't read or set a step on A's custom exercise.
    const mine = await createCustomExerciseForUser(prisma, a, { name: "A Machine Press", muscleGroup: "Chest" });
    expect(await getWeightSteps(prisma, b, [mine.id])).toEqual({});
    await expect(setWeightStepForUser(prisma, b, mine.id, { weightStepKg: 2 })).rejects.toThrow();
    expect(await prisma.exercise_settings.count({ where: { exercise_id: mine.id } })).toBe(0);

    // B's history doesn't feed A's inference.
    await logWeights(b, p2.id, [20, 25, 30]);
    expect((await getWeightSteps(prisma, a, [p2.id]))[p2.id].source).toBe("default");
    expect((await getWeightSteps(prisma, b, [p2.id]))[p2.id]).toMatchObject({ kg: 5, source: "history" });
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `DOTENV_CONFIG_PATH=.env.local npx vitest run --config vitest.db.config.ts lib/exercises/settings.test.ts`
Expected: FAIL — cannot resolve `./settings`.

- [ ] **Step 6: Implement the service**

`lib/exercises/settings.ts`:

```ts
// Per-user exercise settings. Today that is only the weight step used by the next-session target:
// a custom value from exercise_settings, else inferred from the user's logged working weights, else
// the muscle-group default (resolveWeightStep). Every query is scoped to the user (no RLS).
import { Prisma, type PrismaClient } from "@prisma/client";
import { resolveWeightStep, type WeightStep } from "@/lib/insights/progression";
import { updateWeightStepSchema } from "@/lib/validation";

// Exercises the user can't see (another user's custom exercise, unknown id) are left out.
export async function getWeightSteps(
  db: PrismaClient,
  userId: string,
  exerciseIds: string[]
): Promise<Record<string, WeightStep>> {
  const ids = [...new Set(exerciseIds)];
  if (ids.length === 0) return {};
  const [exercises, settings, weights] = await Promise.all([
    db.exercises.findMany({
      where: { id: { in: ids }, OR: [{ user_id: null }, { user_id: userId }] },
      select: { id: true, muscle_group: true },
    }),
    db.exercise_settings.findMany({
      where: { user_id: userId, exercise_id: { in: ids } },
      select: { exercise_id: true, weight_step_kg: true },
    }),
    // Distinct working weights per exercise (sets_user_exercise_idx covers the filter).
    db.$queryRaw<{ exercise_id: string; weight_kg: Prisma.Decimal | number }[]>(Prisma.sql`
      select distinct exercise_id::text as exercise_id, weight_kg
      from sets
      where user_id = ${userId}::uuid
        and exercise_id::text in (${Prisma.join(ids)})
        and not is_warmup
        and weight_kg > 0`),
  ]);

  const custom = new Map(settings.map((row) => [row.exercise_id, Number(row.weight_step_kg)]));
  const logged = new Map<string, number[]>();
  for (const row of weights) {
    const list = logged.get(row.exercise_id) ?? [];
    list.push(Number(row.weight_kg));
    logged.set(row.exercise_id, list);
  }
  return Object.fromEntries(
    exercises.map((exercise) => [
      exercise.id,
      resolveWeightStep({
        customKg: custom.get(exercise.id) ?? null,
        loggedWeights: logged.get(exercise.id) ?? [],
        muscleGroup: exercise.muscle_group,
      }),
    ])
  );
}

// `{ weightStepKg: null }` deletes the custom value (back to automatic). Returns the resolved step.
export async function setWeightStepForUser(
  db: PrismaClient,
  userId: string,
  exerciseId: string,
  input: unknown
): Promise<WeightStep> {
  const { weightStepKg } = updateWeightStepSchema.parse(input);
  const exercise = await db.exercises.findFirst({
    where: { id: exerciseId, OR: [{ user_id: null }, { user_id: userId }] },
    select: { id: true },
  });
  if (!exercise) throw new Error("Exercise not found");

  if (weightStepKg === null) {
    await db.exercise_settings.deleteMany({ where: { user_id: userId, exercise_id: exerciseId } });
  } else {
    await db.exercise_settings.upsert({
      where: { user_id_exercise_id: { user_id: userId, exercise_id: exerciseId } },
      create: { user_id: userId, exercise_id: exerciseId, weight_step_kg: weightStepKg },
      update: { weight_step_kg: weightStepKg, updated_at: new Date() },
    });
  }
  return (await getWeightSteps(db, userId, [exerciseId]))[exerciseId];
}
```

- [ ] **Step 7: Run to verify it passes**

Run: `DOTENV_CONFIG_PATH=.env.local npx vitest run --config vitest.db.config.ts lib/exercises/settings.test.ts`
Expected: PASS. Then `npx tsc --noEmit` — expected clean.

- [ ] **Step 8: Commit**

```bash
git add prisma/migrations/0006_exercise_weight_step prisma/schema.prisma lib/exercises/settings.ts lib/exercises/settings.test.ts
git commit -m "feat(exercises): per-user weight step table and service

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Server action, i18n and `WeightStepSheet`

**Files:**
- Modify: `lib/actions/exercises.ts`
- Modify: `messages/en.json`, `messages/th.json`
- Create: `components/exercises/WeightStepSheet.tsx`

**Interfaces:**
- Consumes: `setWeightStepForUser` (Task 2), `WeightStep`, `WEIGHT_STEP_PRESETS` (Task 1), `updateWeightStepSchema` (Task 1), `Sheet`, `Button`, `NumberField`/`applyStep` (existing).
- Produces:
  ```ts
  // lib/actions/exercises.ts
  export async function setExerciseWeightStep(exerciseId: string, weightStepKg: number | null): Promise<WeightStep>;
  // components/exercises/WeightStepSheet.tsx
  export function WeightStepSheet(props: {
    open: boolean;
    onClose: () => void;
    exerciseId: string;
    weightStep: WeightStep;
    onSaved: (step: WeightStep) => void;
  }): JSX.Element;
  ```
  Message keys: `weightStep.{chip, chipAuto, chipLabel, title, description, auto, autoFromHistory, autoDefault, other, customLabel, row, rowAuto, edit}`, `errors.weightStep`.

- [ ] **Step 1: Add the action**

In `lib/actions/exercises.ts` add the import and function:

```ts
import { setWeightStepForUser } from "@/lib/exercises/settings";
```

```ts
export async function setExerciseWeightStep(exerciseId: string, weightStepKg: number | null) {
  const userId = await requireUserId();
  const step = await setWeightStepForUser(prisma, userId, exerciseId, { weightStepKg });
  revalidatePath(`/exercises/${exerciseId}`);
  return step;
}
```

- [ ] **Step 2: Add messages**

`messages/en.json` — add `"weightStep": "Failed to save the weight step"` inside `errors` (next to `updateRepRange`), and a new top-level namespace (place it after `exercises`):

```json
"weightStep": {
  "chip": "step {kg} kg",
  "chipAuto": "step {kg} kg · auto",
  "chipLabel": "Weight step {kg} kg, tap to change",
  "title": "Weight step",
  "description": "How much the target weight goes up or down for this exercise. Set it to the smallest jump your equipment allows.",
  "auto": "Automatic",
  "autoFromHistory": "{kg} kg, from the weights you've logged",
  "autoDefault": "{kg} kg, default for this muscle group",
  "other": "Other",
  "customLabel": "Step (kg)",
  "row": "Weight step {kg} kg",
  "rowAuto": "Weight step {kg} kg (auto)",
  "edit": "Change weight step"
}
```

`messages/th.json` — `"weightStep": "บันทึกขนาดการขยับน้ำหนักไม่สำเร็จ"` inside `errors`, and:

```json
"weightStep": {
  "chip": "ขยับทีละ {kg} kg",
  "chipAuto": "ขยับทีละ {kg} kg · อัตโนมัติ",
  "chipLabel": "ขยับน้ำหนักทีละ {kg} kg แตะเพื่อเปลี่ยน",
  "title": "ขนาดการขยับน้ำหนัก",
  "description": "น้ำหนักเป้าหมายของท่านี้จะเพิ่มหรือลดครั้งละเท่านี้ ให้ตั้งเท่ากับช่วงน้ำหนักที่เล็กที่สุดที่อุปกรณ์ขยับได้",
  "auto": "อัตโนมัติ",
  "autoFromHistory": "{kg} kg จากน้ำหนักที่เคยบันทึก",
  "autoDefault": "{kg} kg ค่าเริ่มต้นของกลุ่มกล้ามเนื้อนี้",
  "other": "ค่าอื่น",
  "customLabel": "ขนาด (kg)",
  "row": "ขยับน้ำหนักทีละ {kg} kg",
  "rowAuto": "ขยับน้ำหนักทีละ {kg} kg (อัตโนมัติ)",
  "edit": "เปลี่ยนขนาดการขยับน้ำหนัก"
}
```

Run: `npx vitest run i18n/messages.test.ts`
Expected: PASS (same keys and ICU args in both locales).

- [ ] **Step 3: Create the sheet**

`components/exercises/WeightStepSheet.tsx`:

```tsx
"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { NumberField, applyStep } from "@/components/ui/NumberField";
import { WEIGHT_STEP_PRESETS, type WeightStep } from "@/lib/insights/progression";
import { updateWeightStepSchema } from "@/lib/validation";
import { setExerciseWeightStep } from "@/lib/actions/exercises";

type Choice = "auto" | "other" | number;

// Edits an exercise's weight step (exercise_settings). Shared by the log screen's target chip and
// the exercise page. The form only mounts while open (Sheet renders nothing when closed), so every
// open starts from the current step.
export function WeightStepSheet({
  open,
  onClose,
  exerciseId,
  weightStep,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  exerciseId: string;
  weightStep: WeightStep;
  onSaved: (step: WeightStep) => void;
}) {
  const titleId = useId();
  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId}>
      <WeightStepForm
        titleId={titleId}
        exerciseId={exerciseId}
        weightStep={weightStep}
        onClose={onClose}
        onSaved={onSaved}
      />
    </Sheet>
  );
}

const OTHER_STEP = 0.5;

function chipClass(active: boolean) {
  return `flex min-h-11 items-center justify-center rounded-lg border px-2 text-sm font-medium tabular-nums transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
    active
      ? "border-accent bg-accent text-accent-foreground"
      : "border-border bg-surface-muted text-foreground hover:bg-border/40"
  }`;
}

function WeightStepForm({
  titleId,
  exerciseId,
  weightStep,
  onClose,
  onSaved,
}: {
  titleId: string;
  exerciseId: string;
  weightStep: WeightStep;
  onClose: () => void;
  onSaved: (step: WeightStep) => void;
}) {
  const t = useTranslations("weightStep");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const custom = weightStep.source === "custom" ? weightStep.kg : null;
  const [choice, setChoice] = useState<Choice>(
    custom === null ? "auto" : WEIGHT_STEP_PRESETS.includes(custom) ? custom : "other"
  );
  const [other, setOther] = useState(
    custom !== null && !WEIGHT_STEP_PRESETS.includes(custom) ? String(custom) : ""
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherKg = Number(other);
  const otherValid =
    other.trim() !== "" && updateWeightStepSchema.safeParse({ weightStepKg: otherKg }).success;
  // undefined = nothing valid to save yet.
  const value: number | null | undefined =
    choice === "auto" ? null : choice === "other" ? (otherValid ? otherKg : undefined) : choice;

  async function save() {
    if (value === undefined) return;
    setPending(true);
    setError(null);
    try {
      onSaved(await setExerciseWeightStep(exerciseId, value));
      onClose();
    } catch (err) {
      console.error(err);
      setError(te("weightStep"));
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex shrink-0 justify-center pt-2 sm:hidden" aria-hidden="true">
        <span className="h-1 w-10 rounded-full bg-border" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-2 sm:pt-4">
        <div>
          <h2 id={titleId} className="text-lg font-semibold">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-muted">{t("description")}</p>
        </div>

        <button
          type="button"
          aria-pressed={choice === "auto"}
          disabled={pending}
          onClick={() => setChoice("auto")}
          className={`${chipClass(choice === "auto")} flex-col items-start px-3 py-2 text-left`}
        >
          <span>{t("auto")}</span>
          <span className={`text-xs font-normal ${choice === "auto" ? "" : "text-muted"}`}>
            {weightStep.autoSource === "history"
              ? t("autoFromHistory", { kg: weightStep.autoKg })
              : t("autoDefault", { kg: weightStep.autoKg })}
          </span>
        </button>

        <div className="grid grid-cols-4 gap-2">
          {WEIGHT_STEP_PRESETS.map((kg) => (
            <button
              key={kg}
              type="button"
              aria-pressed={choice === kg}
              disabled={pending}
              onClick={() => setChoice(kg)}
              className={chipClass(choice === kg)}
            >
              {kg}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={choice === "other"}
            disabled={pending}
            onClick={() => setChoice("other")}
            className={chipClass(choice === "other")}
          >
            {t("other")}
          </button>
        </div>

        {choice === "other" && (
          <NumberField
            label={t("customLabel")}
            value={other}
            onChange={setOther}
            onStep={(delta) => setOther((prev) => applyStep(prev, delta, OTHER_STEP))}
            step={OTHER_STEP}
          />
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      <div className="flex shrink-0 gap-2 border-t border-border p-4">
        <Button variant="secondary" className="flex-1" disabled={pending} onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          loading={pending}
          disabled={value === undefined}
          onClick={save}
        >
          {tc("save")}
        </Button>
      </div>
    </>
  );
}
```

Note: `onStep` uses a functional updater (`setOther((prev) => …)`) per the CLAUDE.md stepper rule.

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. (The sheet is not mounted anywhere yet; it is exercised in Tasks 4–5.)

- [ ] **Step 5: Commit**

```bash
git add lib/actions/exercises.ts messages/en.json messages/th.json components/exercises/WeightStepSheet.tsx
git commit -m "feat(exercises): weight step sheet and server action

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Log screen uses the per-exercise step

**Files:**
- Modify: `app/(app)/log/[sessionId]/types.ts`
- Modify: `app/(app)/log/[sessionId]/page.tsx`
- Modify: `lib/actions/sessions.ts` (`addExerciseToSession`, ~line 29)
- Modify: `app/(app)/log/[sessionId]/LoggingClient.tsx` (imports ~line 24, `handleAddExercise` ~line 253, `<ExerciseCard` ~line 380)
- Modify: `app/(app)/log/[sessionId]/ExerciseCard.tsx`

**Interfaces:**
- Consumes: `getWeightSteps` (Task 2), `resolveWeightStep`/`WeightStep`/`nextTarget` (Task 1), `WeightStepSheet` (Task 3), message keys `weightStep.chip|chipAuto|chipLabel`.
- Produces: `ExerciseEntry.weightStep: WeightStep`, `ExerciseEntry.recentSessions: LastSession[]`; `ExerciseCard` prop `onWeightStepSaved: (step: WeightStep) => void`; `addExerciseToSession` returns `weightStep: WeightStep | null`.

- [ ] **Step 1: Extend `ExerciseEntry`**

In `types.ts`, change the progression import to `import type { NextTarget, RepRange, WeightStep } from "@/lib/insights/progression";` and add to `ExerciseEntry` after `repRange`:

```ts
  // The exercise's last completed sessions, newest first (getRecentSessionSets), kept so the
  // client can recompute `target` when the weight step changes.
  recentSessions: LastSession[];
  // Step used by `target` (custom → inferred from logged weights → muscle-group default).
  weightStep: WeightStep;
```

- [ ] **Step 2: Server page**

In `page.tsx`:
- Replace the progression import with `import { DEFAULT_REP_RANGE, nextTarget, resolveWeightStep } from "@/lib/insights/progression";` and add `import { getWeightSteps } from "@/lib/exercises/settings";`.
- Add to the second `Promise.all`:
  ```ts
  const [prMap, recentSessions, routineTargets, weightSteps] = await Promise.all([
    getPriorPrs(prisma, userId, exerciseIds),
    getRecentSessionSets(prisma, userId, exerciseIds, sessionId),
    session.routine_id
      ? getRoutineTargets(prisma, userId, session.routine_id)
      : Promise.resolve({} as Record<string, RoutineTarget>),
    getWeightSteps(prisma, userId, exerciseIds),
  ]);
  ```
- In the `sessionExercises.map`, after `const repRange = …`:
  ```ts
  const weightStep =
    weightSteps[se.exercise_id] ??
    resolveWeightStep({ customKg: null, loggedWeights: [], muscleGroup: se.exercises.muscle_group });
  ```
  and replace the `target:` line with:
  ```ts
      target: nextTarget(recent, repRange, weightStep.kg),
      repRange,
      recentSessions: recent,
      weightStep,
  ```

- [ ] **Step 3: Added-exercise action**

In `lib/actions/sessions.ts` add `import { getWeightSteps } from "@/lib/exercises/settings";` and change `addExerciseToSession`:

```ts
export async function addExerciseToSession(sessionId: string, exerciseId: string) {
  const userId = await requireUserId();
  const sessionExercise = await addExerciseToSessionForUser(prisma, userId, sessionId, exerciseId);
  const [pr, recent, steps] = await Promise.all([
    getPriorPr(prisma, userId, exerciseId),
    getRecentSessionSets(prisma, userId, [exerciseId], sessionId),
    getWeightSteps(prisma, userId, [exerciseId]),
  ]);
  const recentSessions = recent[exerciseId] ?? [];
  return {
    ...sessionExercise,
    pr,
    lastSession: recentSessions[0] ?? null,
    recentSessions,
    weightStep: steps[exerciseId] ?? null,
  };
}
```

- [ ] **Step 4: LoggingClient**

- Import: `import { DEFAULT_REP_RANGE, nextTarget, resolveWeightStep, type WeightStep } from "@/lib/insights/progression";` (drop `stepFor`).
- In `handleAddExercise`, before `setExercises`:
  ```ts
  const weightStep =
    added.weightStep ??
    resolveWeightStep({ customKg: null, loggedWeights: [], muscleGroup: exercise.muscleGroup });
  ```
  and in the new entry replace the `target:` line with:
  ```ts
        target: nextTarget(added.recentSessions, DEFAULT_REP_RANGE, weightStep.kg),
        repRange: DEFAULT_REP_RANGE,
        recentSessions: added.recentSessions,
        weightStep,
  ```
  (remove the old `repRange: DEFAULT_REP_RANGE,` line so it isn't duplicated).
- Add a handler next to `handleAddExercise`:
  ```ts
  // A step belongs to the exercise, so it applies to every entry of it in this session.
  function handleWeightStepSaved(exerciseId: string, weightStep: WeightStep) {
    setExercises((prev) =>
      prev.map((ex) =>
        ex.exerciseId === exerciseId
          ? { ...ex, weightStep, target: nextTarget(ex.recentSessions, ex.repRange, weightStep.kg) }
          : ex
      )
    );
  }
  ```
- Pass it to each card: `onWeightStepSaved={(step) => handleWeightStepSaved(exercise.exerciseId, step)}`.

- [ ] **Step 5: ExerciseCard chip, sheet and form reset**

In `ExerciseCard.tsx`:
- Imports: add `Sliders` to the phosphor import list; add `import { WeightStepSheet } from "@/components/exercises/WeightStepSheet";` and `import type { WeightStep } from "@/lib/insights/progression";`.
- Replace `TargetHint` with:

```tsx
function TargetHint({ exercise, onEditStep }: { exercise: ExerciseEntry; onEditStep: () => void }) {
  const t = useTranslations("log");
  const tw = useTranslations("weightStep");
  const { target, repRange, weightStep } = exercise;
  if (!target) return null;
  const reason = {
    addReps: t("targetReason.addReps"),
    addWeight: t("targetReason.addWeight", { max: repRange.max }),
    reset: t("targetReason.reset", { min: repRange.min }),
    repsOnly: t("targetReason.repsOnly"),
  }[target.reason];
  return (
    <p className="mt-0.5 flex items-start gap-1 text-xs text-accent">
      <Target className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">
        {t("target", { weight: target.weightKg, reps: target.reps })} · {reason}
        {/* Bodyweight targets (repsOnly) never change weight, so the step is irrelevant there. */}
        {target.reason !== "repsOnly" && (
          <>
            {" "}
            <button
              type="button"
              onClick={onEditStep}
              aria-label={tw("chipLabel", { kg: weightStep.kg })}
              className="ml-0.5 inline-flex min-h-6 items-center gap-1 rounded-full border border-accent/40 px-2 align-middle text-[11px] font-medium [touch-action:manipulation] hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Sliders className="h-3 w-3" aria-hidden />
              {weightStep.source === "custom"
                ? tw("chip", { kg: weightStep.kg })
                : tw("chipAuto", { kg: weightStep.kg })}
            </button>
          </>
        )}
      </span>
    </p>
  );
}
```

- Add `onWeightStepSaved` to the props destructuring and type:
  ```ts
  onWeightStepSaved,
  …
  onWeightStepSaved: (step: WeightStep) => void;
  ```
- After `const [editingSetId, setEditingSetId] = …` add:

```ts
  const [stepSheetOpen, setStepSheetOpen] = useState(false);
  // A new target (the weight step changed) re-prefills the add-set form, but only while nothing
  // is logged yet; after that the form repeats the last set. Adjusting state during render is
  // React's pattern for "reset when a prop changes" (no effect, no flash of the old value).
  const [prefilledTarget, setPrefilledTarget] = useState(exercise.target);
  if (exercise.target !== prefilledTarget) {
    setPrefilledTarget(exercise.target);
    if (exercise.sets.length === 0) setInput(initialInput(exercise));
  }
```

  (`target` keeps its object identity across every other `setExercises` update because they spread `...ex`; only `handleWeightStepSaved` creates a new one.)
- In the expanded branch replace `<TargetHint exercise={exercise} />` with `<TargetHint exercise={exercise} onEditStep={() => setStepSheetOpen(true)} />`, and render the sheet once inside the expanded `<Card>` (e.g. right after the closing `</div>` of the header row):

```tsx
      <WeightStepSheet
        open={stepSheetOpen}
        onClose={() => setStepSheetOpen(false)}
        exerciseId={exercise.exerciseId}
        weightStep={exercise.weightStep}
        onSaved={onWeightStepSaved}
      />
```

- [ ] **Step 6: Typecheck, lint, unit tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean/PASS. If `tsc` reports `Cannot find name 'LayoutProps'`, run `npx next typegen` first (fresh checkout).

- [ ] **Step 7: Browser check (log screen)**

Start the dev server (restart it if it was running — messages changed): `preview_start` with the project's launch config (create `.claude/launch.json` with `npm run dev` on port 3000 if missing). Sign in with Google in the pane (ask the user to do it if needed). Then:
1. Start a workout with an exercise that has ≥2 completed sessions at different weights (if none exists locally, log two short sessions: e.g. a dumbbell exercise at 10 kg and 12 kg with 12 reps on every set, so the next target is `addWeight`).
2. Expected: target line ends with chip "ขยับทีละ 2 kg · อัตโนมัติ" and the target is last weight + 2.
3. Tap the chip → sheet opens; "อัตโนมัติ" is selected and shows "2 kg จากน้ำหนักที่เคยบันทึก". Pick 5 → Save. Expected: chip "ขยับทีละ 5 kg", target weight = last + 5, the add-set weight input shows the new target (no sets logged yet).
4. Reload → still 5. Re-open → 5 is preselected. Pick "อัตโนมัติ" → Save → back to 2 kg · อัตโนมัติ.
5. Android/browser Back while the sheet is open closes the sheet, not the page.
6. `read_console_messages` with `onlyErrors: true` → no hydration or runtime errors.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/log/[sessionId]" lib/actions/sessions.ts
git commit -m "feat(log): next target uses the per-exercise weight step, editable from the card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Weight step on the exercise page

**Files:**
- Create: `app/(app)/exercises/[exerciseId]/WeightStepRow.tsx`
- Modify: `app/(app)/exercises/[exerciseId]/page.tsx`

**Interfaces:**
- Consumes: `getWeightSteps` (Task 2), `resolveWeightStep`/`WeightStep` (Task 1), `WeightStepSheet` (Task 3), message keys `weightStep.row|rowAuto|edit`.
- Produces: `WeightStepRow({ exerciseId: string; initial: WeightStep })`.

- [ ] **Step 1: Client row**

`app/(app)/exercises/[exerciseId]/WeightStepRow.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PencilSimple } from "@phosphor-icons/react/ssr";
import { IconButton } from "@/components/ui/IconButton";
import { WeightStepSheet } from "@/components/exercises/WeightStepSheet";
import type { WeightStep } from "@/lib/insights/progression";

export function WeightStepRow({ exerciseId, initial }: { exerciseId: string; initial: WeightStep }) {
  const t = useTranslations("weightStep");
  const [step, setStep] = useState(initial);
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 flex items-center gap-1 text-sm text-muted">
      <span>{step.source === "custom" ? t("row", { kg: step.kg }) : t("rowAuto", { kg: step.kg })}</span>
      <IconButton
        icon={<PencilSimple className="h-4 w-4" />}
        aria-label={t("edit")}
        onClick={() => setOpen(true)}
      />
      <WeightStepSheet
        open={open}
        onClose={() => setOpen(false)}
        exerciseId={exerciseId}
        weightStep={step}
        onSaved={setStep}
      />
    </div>
  );
}
```

- [ ] **Step 2: Page**

In `page.tsx`:
- Imports: `import { getWeightSteps } from "@/lib/exercises/settings";`, `import { resolveWeightStep } from "@/lib/insights/progression";`, `import { WeightStepRow } from "./WeightStepRow";`.
- Extend the `Promise.all`:
  ```ts
  const [exercise, history, pr, weightSteps] = await Promise.all([
    …existing three…,
    getWeightSteps(prisma, userId, [exerciseId]),
  ]);
  ```
- After `notFound()`:
  ```ts
  const weightStep =
    weightSteps[exerciseId] ??
    resolveWeightStep({ customKg: null, loggedWeights: [], muscleGroup: exercise.muscle_group });
  ```
- Under the muscle-group `<p>` in the header `<div>` add `<WeightStepRow exerciseId={exerciseId} initial={weightStep} />`.

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 4: Browser check**

Open `/exercises/<id>` for the exercise used in Task 4. Expected: "ขยับน้ำหนักทีละ 2 kg (อัตโนมัติ)" (or the custom value if one is set). Edit → pick 2.5 → Save → row shows "ขยับน้ำหนักทีละ 2.5 kg" without reload; reload keeps it; start/resume a workout with that exercise → its chip shows 2.5 kg. Switch the language to English (Settings) and check the row, chip and sheet strings. Check at mobile width (`resize_window` preset `mobile`), then reset with preset `desktop`. No console errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/exercises/[exerciseId]"
git commit -m "feat(exercises): show and edit the weight step on the exercise page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Docs and full verification

**Files:**
- Modify: `CLAUDE.md` ("Training insights are rule-based and pure" gotcha)
- Modify: `CONTEXT.md` (glossary: **Next target**, new **Weight step**)

- [ ] **Step 1: CLAUDE.md**

In the "Training insights are rule-based and pure" bullet, after the sentence about `getRoutineTargets` / `DEFAULT_REP_RANGE`, add:

```markdown
The target's weight step is per exercise: `resolveWeightStep` (`progression.ts`) = custom value from `exercise_settings` (per user — presets are shared rows; `0006_exercise_weight_step`, hand-written) → the most common gap between the user's logged working weights (`inferStepFromWeights`) → `stepFor(muscle_group)`. Loaded by `getWeightSteps` (`lib/exercises/settings.ts`), edited in `WeightStepSheet` (`components/exercises/`) from the log card's target chip and `/exercises/[id]`. Not in the JSON backup yet. The weight field's +/− stepper still uses the global `WEIGHT_STEP` (2.5 kg) on purpose.
```

- [ ] **Step 2: CONTEXT.md**

Replace the **Next target** entry's parenthetical `(Legs +5, Chest/Back +2.5, others +1.25 kg)` with `by the exercise's **Weight step**`, and add after it:

```markdown
**Weight step**:
How much an exercise's next target adds or removes when it changes weight. The user's custom value for that exercise (`exercise_settings`), else the most common gap between the weights they have logged for it, else the muscle-group default (Legs +5, Chest/Back +2.5, others +1.25 kg). Separate from the +/− stepper on the weight field, which always moves 2.5 kg.
```

- [ ] **Step 3: Full verification**

Run each and confirm:
```bash
npm test
DOTENV_CONFIG_PATH=.env.local npm run test:db
npx tsc --noEmit && npm run lint
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```
Expected: all tests PASS; tsc/lint clean; the diff contains only the documented known-drift statements (plus the `exercise_settings_user_id_fkey` drop).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md CONTEXT.md
git commit -m "docs: per-exercise weight step

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Deployment note (do not push without the user's go-ahead): `git push origin main` after merging runs `prisma migrate deploy` on prod before `next build`; `0006` is additive, so the live deployment keeps working while it applies.
