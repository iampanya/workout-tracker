# Faster Set Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the active workout logging screen, prefill each exercise's weight/reps inputs from that exercise's previous set, and show each exercise's all-time PR (max non-warmup weight) on its card.

**Architecture:** Feature 1 (prefill) is entirely client-side state in `LoggingClient.tsx`. Feature 2 (PR badge) adds one batched Supabase query (`getPriorMaxWeights`) used at page load and one existing per-exercise lookup (`getPriorMaxWeight`) reused when adding an exercise mid-session; the PR value then flows through `LoggingClient.tsx` state and bumps up live when a new PR is logged, mirroring the existing `prBanner` logic.

**Tech Stack:** Next.js (App Router, server components + server actions), React (client component with `useState`/`@tanstack/react-query`), Supabase (Postgres + PostgREST), Vitest for DB-backed service tests.

## Global Constraints

- First set of an exercise in a session always starts blank — no cross-session defaults (spec non-goal).
- The PR badge only ever moves **up** live during a session (when a new PR is logged); edits/deletes that would lower it are not reconciled until the next page load — this is intentional (spec non-goal).
- The warmup checkbox is never carried over when prefilling — always resets to unchecked.
- `exercise_prs` is a live Postgres view (`max(weight_kg)` per user+exercise, excluding warmup) — never cache or denormalize its value; always read it fresh.
- This repo has no component-level (`.tsx`) test harness — only `lib/**/*.test.ts`. UI behavior (prefill, live badge update) is verified manually in the browser, not with automated component tests.
- DB-backed tests require a running local Supabase and `.env.local` populated (see `README.md`); run them with `DOTENV_CONFIG_PATH=.env.local npm run test:db`, or target a single file with `DOTENV_CONFIG_PATH=.env.local npx vitest run <path>`.
- Typecheck with `npx tsc --noEmit` and lint with `npm run lint` after each code task — there is no separate `typecheck` script.

---

### Task 1: Batched PR lookup service function

**Files:**
- Modify: `lib/sessions/service.ts:107-120` (add a new function right after `getPriorMaxWeight`)
- Test: `lib/sessions/service.test.ts`

**Interfaces:**
- Consumes: existing `getPriorMaxWeight(supabase, userId, exerciseId): Promise<number | null>` pattern already in this file (same `exercise_prs` view, same client type).
- Produces: `getPriorMaxWeights(supabase: SupabaseClient<Database>, userId: string, exerciseIds: string[]): Promise<Record<string, number>>` — keys are `exercise_id`s that have a PR; exercises with no PR yet are simply absent from the object (no `null` entries). Task 2 relies on this exact name, signature, and "absent key means no PR" contract.

- [ ] **Step 1: Write the failing test**

Add `getPriorMaxWeights` to the import from `"./service"` at the top of `lib/sessions/service.test.ts`:

```ts
import {
  startSessionForUser,
  addExerciseToSessionForUser,
  logSetForUser,
  updateSetForUser,
  deleteSetForUser,
  finishSessionForUser,
  discardSessionForUser,
  getPriorMaxWeights,
} from "./service";
```

Add these two `it` blocks inside the `describe("sessions service", ...)` block (e.g. right after the `"marks an edited set as a new PR..."` test, before `"rejects updating another user's set"`):

```ts
  it("batches PR lookups across multiple exercises, omitting exercises with no PR yet", async () => {
    const benchedExercise = await createCustomExerciseForUser(client, userId, {
      name: uniqueExerciseName("Batch PR Bench"),
      muscleGroup: "Chest",
    });
    const untouchedExercise = await createCustomExerciseForUser(client, userId, {
      name: uniqueExerciseName("Batch PR Untouched"),
      muscleGroup: "Legs",
    });
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-17" });
    const sessionExercise = await addExerciseToSessionForUser(
      client,
      userId,
      session.id,
      benchedExercise.id
    );
    await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 82.5,
      reps: 5,
      isWarmup: false,
    });

    const prs = await getPriorMaxWeights(client, userId, [benchedExercise.id, untouchedExercise.id]);

    expect(prs).toEqual({ [benchedExercise.id]: 82.5 });
  });

  it("returns an empty object when given no exercise ids", async () => {
    const prs = await getPriorMaxWeights(client, userId, []);
    expect(prs).toEqual({});
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `DOTENV_CONFIG_PATH=.env.local npx vitest run lib/sessions/service.test.ts`
Expected: FAIL — `getPriorMaxWeights` is not exported from `./service` (TypeScript/import error).

(This requires a running local Supabase — see `README.md` step 2, `supabase start` — and `.env.local` populated from `.env.local.example`. If Supabase isn't running yet, start it first.)

- [ ] **Step 3: Implement `getPriorMaxWeights`**

In `lib/sessions/service.ts`, add this function immediately after `getPriorMaxWeight` (after line 120):

```ts
export async function getPriorMaxWeights(
  supabase: SupabaseClient<Database>,
  userId: string,
  exerciseIds: string[]
): Promise<Record<string, number>> {
  if (exerciseIds.length === 0) return {};
  const { data, error } = await supabase
    .from("exercise_prs")
    .select("exercise_id, pr_weight_kg")
    .eq("user_id", userId)
    .in("exercise_id", exerciseIds);
  if (error) throw new Error(error.message);
  return Object.fromEntries(
    (data ?? [])
      .filter(
        (row): row is { exercise_id: string; pr_weight_kg: number } =>
          row.exercise_id !== null && row.pr_weight_kg !== null
      )
      .map((row) => [row.exercise_id, Number(row.pr_weight_kg)])
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `DOTENV_CONFIG_PATH=.env.local npx vitest run lib/sessions/service.test.ts`
Expected: PASS (all tests in the file, including the two new ones)

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add lib/sessions/service.ts lib/sessions/service.test.ts
git commit -m "feat: add batched PR lookup for multiple exercises"
```

---

### Task 2: Plumb PR data into the logging page and the add-exercise action

**Files:**
- Modify: `app/(app)/log/[sessionId]/page.tsx` (whole file, 51 lines)
- Modify: `lib/actions/sessions.ts:1-32` (imports + `addExerciseToSession`)

**Interfaces:**
- Consumes: `getPriorMaxWeights` and `getPriorMaxWeight` from `lib/sessions/service.ts` (Task 1 adds the former; the latter already exists at `lib/sessions/service.ts:107-120`).
- Produces: `page.tsx`'s `exercises` array now includes `prWeightKg: number | null` per entry, passed to `LoggingClient` as part of `initialExercises`. `addExerciseToSession(sessionId, exerciseId)` now resolves to `SessionExercise & { prWeightKg: number | null }` instead of plain `SessionExercise`. Task 3 relies on both of these exact shapes.

- [ ] **Step 1: Update `page.tsx` to fetch and attach PR data**

Replace the full contents of `app/(app)/log/[sessionId]/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listExercises } from "@/lib/exercises/service";
import { getPriorMaxWeights } from "@/lib/sessions/service";
import { QueryProvider } from "./QueryProvider";
import { LoggingClient } from "./LoggingClient";

export default async function LogSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: session } = await supabase.from("sessions").select("*").eq("id", sessionId).single();
  if (!session) {
    notFound();
  }
  const [{ data: sessionExercises }, availableExercises] = await Promise.all([
    supabase
      .from("session_exercises")
      .select("*, exercise:exercises(id, name), sets(*)")
      .eq("session_id", sessionId)
      .order("position"),
    listExercises(supabase),
  ]);

  const exerciseIds = [...new Set((sessionExercises ?? []).map((se) => se.exercise_id))];
  const prMap = await getPriorMaxWeights(supabase, user!.id, exerciseIds);

  const exercises = (sessionExercises ?? []).map((se) => ({
    sessionExerciseId: se.id,
    exerciseId: se.exercise_id,
    exerciseName: (se as unknown as { exercise: { name: string } }).exercise.name,
    sets: ((se as unknown as { sets: { set_number: number }[] }).sets ?? []).sort(
      (a, b) => a.set_number - b.set_number
    ),
    prWeightKg: prMap[se.exercise_id] ?? null,
  }));

  return (
    <QueryProvider>
      <LoggingClient
        sessionId={sessionId}
        sessionName={session.name ?? "Workout"}
        initialExercises={exercises as never}
        availableExercises={availableExercises.map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
        }))}
      />
    </QueryProvider>
  );
}
```

- [ ] **Step 2: Update `addExerciseToSession` to also return the new exercise's PR**

In `lib/actions/sessions.ts`, update the import block at the top (currently importing `startSessionForUser, addExerciseToSessionForUser, logSetForUser, updateSetForUser, deleteSetForUser, finishSessionForUser, discardSessionForUser` from `@/lib/sessions/service`) to also import `getPriorMaxWeight`:

```ts
import {
  startSessionForUser,
  addExerciseToSessionForUser,
  logSetForUser,
  updateSetForUser,
  deleteSetForUser,
  finishSessionForUser,
  discardSessionForUser,
  getPriorMaxWeight,
} from "@/lib/sessions/service";
```

Replace the `addExerciseToSession` function:

```ts
export async function addExerciseToSession(sessionId: string, exerciseId: string) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  const sessionExercise = await addExerciseToSessionForUser(supabase, userId, sessionId, exerciseId);
  const prWeightKg = await getPriorMaxWeight(supabase, userId, exerciseId);
  return { ...sessionExercise, prWeightKg };
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: errors in `LoggingClient.tsx` are fine at this point (its `ExerciseEntry` type doesn't have `prWeightKg` yet — that's Task 3). Confirm there are no errors in `page.tsx` or `lib/actions/sessions.ts` themselves, and no *new* errors beyond the expected `LoggingClient.tsx` ones about `prWeightKg` being unused/missing.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/log/\[sessionId\]/page.tsx lib/actions/sessions.ts
git commit -m "feat: fetch exercise PRs on the logging page and when adding an exercise"
```

---

### Task 3: Show the PR badge on each exercise card, with live updates

**Files:**
- Modify: `app/(app)/log/[sessionId]/LoggingClient.tsx`

**Interfaces:**
- Consumes: `ExerciseEntry.prWeightKg` and `addExerciseToSession(...)`'s `prWeightKg` field, both produced by Task 2. `result.isPr` from `logSetMutation`/`updateSetMutation`, already returned by `logSetForUser`/`updateSetForUser` (`lib/sessions/service.ts:122-207`).
- Produces: nothing new consumed by later tasks — this is a leaf UI change.

- [ ] **Step 1: Add `prWeightKg` to the `ExerciseEntry` type**

In `app/(app)/log/[sessionId]/LoggingClient.tsx`, update the type (currently at the top of the file):

```ts
type ExerciseEntry = {
  sessionExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  sets: SetEntry[];
  prWeightKg: number | null;
};
```

- [ ] **Step 2: Import the `Trophy` icon**

Update the `lucide-react` import line:

```ts
import { Plus, Trash2, Pencil, Check, X, CheckCircle2, Trophy } from "lucide-react";
```

- [ ] **Step 3: Bump `prWeightKg` locally when a new PR is logged**

In `logSetMutation`'s `onSuccess`, change:

```ts
    onSuccess: (result, vars) => {
      setExercises((prev) =>
        prev.map((ex) =>
          ex.sessionExerciseId === vars.sessionExerciseId
            ? {
                ...ex,
                sets: ex.sets.map((s) => (s.id === vars.tempId ? { ...result.set, pending: false } : s)),
              }
            : ex
        )
      );
```

to:

```ts
    onSuccess: (result, vars) => {
      setExercises((prev) =>
        prev.map((ex) =>
          ex.sessionExerciseId === vars.sessionExerciseId
            ? {
                ...ex,
                sets: ex.sets.map((s) => (s.id === vars.tempId ? { ...result.set, pending: false } : s)),
                prWeightKg: result.isPr ? vars.weightKg : ex.prWeightKg,
              }
            : ex
        )
      );
```

In `updateSetMutation`'s `onSuccess`, change:

```ts
    onSuccess: (result, vars) => {
      setExercises((prev) =>
        prev.map((ex) =>
          ex.sessionExerciseId === vars.sessionExerciseId
            ? { ...ex, sets: ex.sets.map((s) => (s.id === vars.setId ? { ...result.set } : s)) }
            : ex
        )
      );
```

to:

```ts
    onSuccess: (result, vars) => {
      setExercises((prev) =>
        prev.map((ex) =>
          ex.sessionExerciseId === vars.sessionExerciseId
            ? {
                ...ex,
                sets: ex.sets.map((s) => (s.id === vars.setId ? { ...result.set } : s)),
                prWeightKg: result.isPr ? vars.weightKg : ex.prWeightKg,
              }
            : ex
        )
      );
```

- [ ] **Step 4: Carry `prWeightKg` through when adding an exercise mid-session**

In `handleAddExercise`, change:

```ts
      setExercises((prev) => [
        ...prev,
        {
          sessionExerciseId: sessionExercise.id,
          exerciseId: pickerExerciseId,
          exerciseName,
          sets: [],
        },
      ]);
```

to:

```ts
      setExercises((prev) => [
        ...prev,
        {
          sessionExerciseId: sessionExercise.id,
          exerciseId: pickerExerciseId,
          exerciseName,
          sets: [],
          prWeightKg: sessionExercise.prWeightKg,
        },
      ]);
```

- [ ] **Step 5: Render the PR badge on the card**

Change the card header line:

```tsx
            <h2 className="font-medium">{exercise.exerciseName}</h2>
```

to:

```tsx
            <div className="flex items-center gap-2">
              <h2 className="font-medium">{exercise.exerciseName}</h2>
              {exercise.prWeightKg !== null && (
                <span className="flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                  <Trophy className="h-3 w-3" />
                  PR {exercise.prWeightKg}kg
                </span>
              )}
            </div>
```

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors (the `prWeightKg`-related errors from Task 2's Step 3 are now resolved)

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/log/\[sessionId\]/LoggingClient.tsx
git commit -m "feat: show PR badge on exercise cards, updating live on a new PR"
```

---

### Task 4: Prefill weight/reps from the previous set

**Files:**
- Modify: `app/(app)/log/[sessionId]/LoggingClient.tsx`

**Interfaces:**
- Consumes: `ExerciseEntry`, `SetFormInput` types already in this file (`SetFormInput = { weight: string; reps: string; warmup: boolean }`).
- Produces: nothing consumed by other tasks — this is a leaf UI change, independent of Task 3's PR badge work (both land in the same file; do this task after Task 3 to avoid overlapping edits to the same lines).

- [ ] **Step 1: Add a helper that derives initial input values from each exercise's last set**

Add this function in `app/(app)/log/[sessionId]/LoggingClient.tsx`, after the `AvailableExercise` type declaration and before `export function LoggingClient`:

```ts
function buildInputsFromExercises(list: ExerciseEntry[]): Record<string, SetFormInput> {
  const result: Record<string, SetFormInput> = {};
  for (const exercise of list) {
    const lastSet = exercise.sets[exercise.sets.length - 1];
    result[exercise.sessionExerciseId] = lastSet
      ? { weight: String(lastSet.weight_kg), reps: String(lastSet.reps), warmup: false }
      : { weight: "", reps: "", warmup: false };
  }
  return result;
}
```

- [ ] **Step 2: Seed the `inputs` state from existing sets on load**

Change:

```ts
  const [inputs, setInputs] = useState<Record<string, SetFormInput>>({});
```

to:

```ts
  const [inputs, setInputs] = useState<Record<string, SetFormInput>>(() =>
    buildInputsFromExercises(initialExercises)
  );
```

- [ ] **Step 3: Re-seed the row with the just-submitted values instead of blanking it**

Change `handleAddSet`:

```ts
  function handleAddSet(sessionExerciseId: string) {
    const input = inputs[sessionExerciseId];
    if (!input?.weight || !input?.reps) return;
    logSetMutation.mutate({
      sessionExerciseId,
      weightKg: Number(input.weight),
      reps: Number(input.reps),
      isWarmup: input.warmup ?? false,
      tempId: `temp-${Date.now()}-${Math.random()}`,
    });
    setInputs((prev) => ({ ...prev, [sessionExerciseId]: { weight: "", reps: "", warmup: false } }));
  }
```

to:

```ts
  function handleAddSet(sessionExerciseId: string) {
    const input = inputs[sessionExerciseId];
    if (!input?.weight || !input?.reps) return;
    logSetMutation.mutate({
      sessionExerciseId,
      weightKg: Number(input.weight),
      reps: Number(input.reps),
      isWarmup: input.warmup ?? false,
      tempId: `temp-${Date.now()}-${Math.random()}`,
    });
    setInputs((prev) => ({
      ...prev,
      [sessionExerciseId]: { weight: input.weight, reps: input.reps, warmup: false },
    }));
  }
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/log/\[sessionId\]/LoggingClient.tsx
git commit -m "feat: prefill weight/reps from the exercise's previous set"
```

---

### Task 5: Manual end-to-end verification

**Files:** none (verification only)

**Interfaces:**
- Consumes: the full feature built in Tasks 1-4.
- Produces: nothing — this task exists because the repo has no component test harness for `LoggingClient.tsx`; this is the closest thing to a system test for this feature.

- [ ] **Step 1: Run the full DB-backed test suite**

Run: `DOTENV_CONFIG_PATH=.env.local npm run test:db`
Expected: PASS (confirms Task 1's new tests plus every existing `sessions service` PR-detection test, e.g. "marks the first logged set... as a PR", "recomputes PR live after a correction", still pass unmodified)

- [ ] **Step 2: Start the dev server and open a workout session**

Run: `npm run dev`

Navigate to `/dashboard`, start a new workout (freeform or from a routine), and open its logging screen (`/log/[sessionId]`).

- [ ] **Step 3: Verify prefill behavior**

For an exercise with no sets yet: confirm the weight/reps inputs are blank. Log a set (e.g. 60kg × 8). Confirm the input row now shows `60` / `8` again (not blank) and the warmup checkbox is unchecked. Log a second set without retyping — confirm it saves with the same values. Refresh the page — confirm the input row still shows the last logged set's values.

- [ ] **Step 4: Verify PR badge behavior**

For an exercise with no PR yet (e.g. a freshly created custom exercise, or one never logged for this account), confirm its card shows no PR badge. Log a working (non-warmup) set — confirm a "PR {weight}kg" badge with a trophy icon appears on the card immediately, without a page refresh, and that the existing "New PR" banner still appears too. Log a second, lighter set for the same exercise — confirm the badge stays at the higher value. Use "Add Exercise" to add an exercise you already have history for (log at least one set for it in an earlier session first, if needed) — confirm its card shows the correct PR badge as soon as it's added.

- [ ] **Step 5: Confirm no regressions in set editing/deleting**

Edit an existing set's weight up past the current PR — confirm the badge updates immediately. Delete a set — confirm nothing errors (per the spec's non-goal, the badge is not expected to drop until the next refresh).

- [ ] **Step 6: Report results**

If all checks pass, note that in the session (no commit needed — this task doesn't change files). If anything fails, treat it as a bug against the specific task that introduced it and fix there before proceeding.
