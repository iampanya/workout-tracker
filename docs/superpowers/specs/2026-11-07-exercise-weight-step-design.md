# Per-exercise weight step

## Context

The log screen's next-session target (`nextTarget` in `lib/insights/progression.ts`) adds or removes
weight by `stepFor(muscleGroup)`: Legs +5 kg, Chest/Back +2.5 kg, everything else +1.25 kg. That is a
fixed kg step, not a percentage, and it is tied to the **muscle group**, not the **equipment**. So the
target is often a weight the gym does not have: +1.25 kg on a dumbbell shoulder press when the rack
moves in 2 kg, or +2.5 kg on a chest machine whose stack moves in 5 kg. The user hits this with
dumbbells, plate-loaded/stack machines and cables, and barbells, and ends up correcting the prefilled
weight every time.

Goal: the target weight (both `addWeight` and `reset`) lands on a weight the equipment actually has, by
using a step per exercise, resolved in this order:

1. **custom**: the step the user set for this exercise;
2. **history**: inferred from the weights the user has logged for this exercise;
3. **default**: today's `stepFor(muscleGroup)`.

This supersedes the training-insights spec's "No per-exercise setting" decision
(`2026-11-01-training-insights-design.md`).

Decisions made in brainstorming:
- Per-exercise custom step, with history inference when it is unset.
- Settable from the log screen (exercise card) **and** from the exercise page `/exercises/[id]`.
- The weight field's +/− stepper keeps its global `WEIGHT_STEP` (2.5 kg). Only the target uses the
  per-exercise step.

Out of scope: an explicit list of available weights (non-uniform dumbbell racks), an equipment type
per exercise, and including the setting in the JSON backup (same as body scans today).

## 1. Data: `exercise_settings` (migration `0006_exercise_weight_step`, hand-written)

Preset exercises are shared (`exercises.user_id` is null), so the step cannot live on `exercises`. It
gets a per-user table:

```sql
create table public.exercise_settings (
  user_id uuid not null references public.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  weight_step_kg numeric(5,2) not null check (weight_step_kg > 0 and weight_step_kg <= 50),
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
```

Additive only, so it is backward-compatible with the deployment that is live while the migration
runs. Hand-write the migration folder like `0003_body_scans`/`0004_routine_rep_range` (never plain
`prisma migrate dev`; see the known-drift note in CLAUDE.md), apply with `npm run db:migrate`, then
`prisma db pull` and check that the pull changed nothing except adding the `exercise_settings` model
(and its back-relations).

## 2. Pure logic (`lib/insights/progression.ts`)

```ts
export type WeightStepSource = "custom" | "history" | "default";
// kg = the step in use; autoKg = what it would be with no custom value (history, else default).
export type WeightStep = { kg: number; source: WeightStepSource; autoKg: number };

export const WEIGHT_STEP_PRESETS = [1, 1.25, 2, 2.5, 4.5, 5, 10];

export function inferStepFromWeights(weights: number[]): number | null;
export function resolveWeightStep(input: {
  customKg: number | null;
  loggedWeights: number[];
  muscleGroup: string | null;
}): WeightStep;
```

- `inferStepFromWeights`: take the distinct weights > 0, sort ascending, compute the differences
  between neighbours (rounded to 2 decimals), and return the **most frequent** difference. A tie goes
  to the smaller difference. Fewer than two distinct weights → `null`. The mode, not the smallest
  difference, so one typo (e.g. 61 among 60/65/70) does not drag the step down to 1.
  - `[10, 12, 14, 16]` → 2
  - `[40, 45, 50, 52.5]` → 5
  - `[60, 61, 65, 70]` → 5 (diffs 1, 4, 5, 5)
  - `[60]` → null
- `resolveWeightStep`: `autoKg = inferStepFromWeights(loggedWeights) ?? stepFor(muscleGroup)`.
  With `customKg` set → `{ kg: customKg, source: "custom", autoKg }`; else `kg = autoKg` with source
  `"history"` or `"default"` depending on which branch produced it.
- `nextTarget(recent, range, step)` is unchanged. Callers pass `weightStep.kg` instead of
  `stepFor(...)`, so `addWeight` and `reset` both use it.

## 3. Service (`lib/exercises/settings.ts`)

- `getWeightSteps(db, userId, exercises: { id: string; muscle_group: string | null }[]):
  Promise<Record<string, WeightStep>>`. Two queries in parallel: the user's `exercise_settings` rows
  for those ids, and the distinct working weights:
  `select distinct exercise_id, weight_kg from sets where user_id = $1 and exercise_id in (...) and
  not is_warmup and weight_kg > 0` (served by the existing `sets_user_exercise_idx`). Coerce `Decimal`
  with `Number()`, then `resolveWeightStep` per exercise. Empty input → `{}` without querying.
- `setWeightStepForUser(db, userId, exerciseId, kg: number | null): Promise<WeightStep>`. First check
  the exercise is visible to the caller (preset, or `user_id = userId`); otherwise throw. `null` deletes
  the row (back to automatic); a number upserts it. Validate with a zod schema in `lib/validation.ts`
  (`> 0`, `<= 50`, at most 2 decimals). Returns the freshly resolved `WeightStep` (via
  `getWeightSteps`) so the UI can update without a reload.
- Server action `setExerciseWeightStep(exerciseId, kg | null)` in `lib/actions/exercises.ts`:
  `requireUserId` → service → `revalidatePath("/exercises/[exerciseId]", "page")` → return the
  `WeightStep`.

## 4. Log screen

- `app/(app)/log/[sessionId]/page.tsx`: add `getWeightSteps` to the second `Promise.all` (it needs
  the exercise list from the first). Each exercise entry gets `weightStep`, `recentSessions` (the
  client needs them to recompute the target), and `target: nextTarget(recent, repRange,
  weightStep.kg)`.
- `types.ts` `ExerciseEntry`: add `weightStep: WeightStep` and `recentSessions: LastSession[]`.
- `addExerciseToSession` (`lib/actions/sessions.ts`) also returns `weightStep`; `LoggingClient` uses
  it instead of `stepFor(exercise.muscleGroup)` for exercises added mid-session.
- `ExerciseCard` `TargetHint`: after the reason, a tappable chip "step {kg} kg" (plus "· auto" when
  `source !== "custom"`) that opens `WeightStepSheet`. No target (no history yet) → no chip.
- On save, `LoggingClient` replaces that exercise's `weightStep` and recomputes `target =
  nextTarget(recentSessions, repRange, kg)` on the client. If the exercise has no logged sets yet, the
  add-set form resets to the new target (key the form state on the target, or reset it in
  `ExerciseCard` when `exercise.sets.length === 0` and the target changes). With sets already logged,
  the form keeps repeating the last set as today.

## 5. `WeightStepSheet` (`components/exercises/WeightStepSheet.tsx`)

A shared client component built on `Sheet`. Props: `exerciseId`, `weightStep`, `onSaved(step)`,
`open`/`onClose`.

- An "Automatic ({autoKg} kg, from history | default)" option, which saves `null`.
- Chips for `WEIGHT_STEP_PRESETS` and a `NumberField` for any other value; the current custom value
  is preselected.
- A Save button, disabled while the action is pending. On failure, show the translated
  `errors.weightStep` message inside the sheet (never `err.message`).

## 6. Exercise page `/exercises/[exerciseId]`

Under the name/muscle group, a small row "Weight step {kg} kg (auto)" with an edit button that opens
the same `WeightStepSheet`. `page.tsx` adds `getWeightSteps` to its `Promise.all` (it already has the
exercise's muscle group). Because the page is a server component, the row and sheet live in a small
client wrapper that holds the step in state and updates it from `onSaved`.

## 7. i18n

New keys in `messages/en.json` and `messages/th.json`: the chip label, sheet title, "Automatic", "from
history", "default", custom-value label, aria-labels, and the `errors.weightStep` message.
`i18n/messages.test.ts` checks both locales match.

## 8. Docs

- CLAUDE.md, "Training insights" gotcha: the step comes from `resolveWeightStep` (custom → history
  mode → `stepFor`), stored in `exercise_settings` (not in the backup yet); the +/− stepper still uses
  `WEIGHT_STEP`.
- `CONTEXT.md` glossary: **Weight step**.

## Testing

- `npm test` (`lib/insights/progression.test.ts`): `inferStepFromWeights` (mode, tie → smaller, a
  single typo, fewer than two weights, 1.25 and 4.5 steps, duplicates and zeros ignored);
  `resolveWeightStep` priority and `autoKg`; `nextTarget` adding and resetting with steps 2 and 5.
- `test:db` (`lib/exercises/settings.test.ts`; picked up automatically because `test:db` runs every
  test file not excluded): upsert, update, delete back to automatic; history inference from logged
  sets, ignoring warmups and 0 kg; invalid values rejected; isolation: A's setting is not visible to B,
  B cannot set a step on A's custom exercise, B's sets do not affect A's inference.
- `npx tsc --noEmit && npm run lint`; the local schema fingerprint diffed before/after the migration shows only the new table.
- Browser (signed in with Google, mobile width, Thai and English): an exercise with dumbbell history
  10/12/14 shows a +2 target with an "auto" chip; set 5 → target line and the form prefill change at
  once; reload → still 5; choose Automatic → back to 2; `/exercises/[id]` shows the same value and can
  edit it.
