# UI Refresh, Editable Sets, and Muscle Group Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roll out a bold, light/dark-aware design system with lucide-react icons across the app, and add inline edit/delete for logged sets on the active session plus a closed muscle-group dropdown for creating exercises.

**Architecture:** Three shared presentational primitives (`Button`, `IconButton`, `Card`) built on new CSS custom-property tokens in `app/globals.css` replace hardcoded Tailwind classes throughout. Two small backend additions (`updateSetForUser` service function + `updateSet` Server Action, and a DB `CHECK` constraint + Zod enum for `muscle_group`) follow the codebase's existing Server Component + Zod-validated Server Action pattern exactly. No new testing library — component tasks are verified with `tsc`/`lint`/manual QA (this repo has zero React component tests today), backend logic tasks keep the existing Vitest + local-Supabase integration-test pattern.

**Tech Stack:** Next.js 16.3 (App Router), React 19, TypeScript, Tailwind CSS v4, Supabase (Postgres + Auth), TanStack Query, react-hook-form + Zod, Vitest, **lucide-react (new)**.

## Global Constraints

- Every icon-only button (`IconButton`) requires an explicit `aria-label` — lucide icons carry no accessible name.
- Editing/deleting sets applies **only** to the active/in-progress logging screen (`/log/[sessionId]`) — the History pages are not touched by this plan.
- Muscle group is a closed set of exactly 6 values: `Chest`, `Back`, `Legs`, `Shoulders`, `Arms`, `Core` — enforced both client-side (Zod enum) and DB-side (`CHECK` constraint).
- No new dependencies beyond `lucide-react`. No `clsx`/`tailwind-merge`, no component-testing library.
- Design tokens must define both light (`:root`) and dark (`@media (prefers-color-scheme: dark)`) values, matching the app's existing dark-mode approach.
- All Server Actions follow the existing pattern in `lib/actions/*.ts`: resolve the authenticated user, delegate to a `*ForUser` function in the matching `lib/*/service.ts`, `revalidatePath` where the existing sibling actions do.
- Backend logic changes get Vitest tests in the existing style (`lib/*/service.test.ts` integration tests against local Supabase, `lib/validation.test.ts` for schemas) — run via `DOTENV_CONFIG_PATH=.env.local npm run test:db` (requires `supabase start`).

---

## Task 1: Install lucide-react, add design tokens, fix font bug

**Files:**
- Modify: `package.json` (add dependency)
- Modify: `app/globals.css`

**Interfaces:**
- Produces: CSS custom properties consumed by every later task's Tailwind classes: `--color-background`, `--color-foreground`, `--color-surface`, `--color-border`, `--color-muted`, `--color-accent`, `--color-accent-foreground`, `--color-danger`, `--color-danger-foreground`, `--color-warning`. These register as Tailwind utilities `bg-surface`, `text-muted`, `border-border`, `bg-accent`, `text-accent-foreground`, `bg-danger`, `text-danger`, `bg-warning`, etc. (including opacity modifiers, e.g. `bg-warning/15`).

- [ ] **Step 1: Install lucide-react**

Run: `npm install lucide-react`

- [ ] **Step 2: Replace `app/globals.css` with the full token set**

Replace the entire file contents with:

```css
@import "tailwindcss";

:root {
  --background: #f7f7f5;
  --foreground: #14151a;
  --surface: #ffffff;
  --border: #e2e2df;
  --muted: #6b6f76;
  --accent: #7ed321;
  --accent-foreground: #0d1a02;
  --danger: #e5484d;
  --danger-foreground: #ffffff;
  --warning: #f5a623;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-surface: var(--surface);
  --color-border: var(--border);
  --color-muted: var(--muted);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-danger: var(--danger);
  --color-danger-foreground: var(--danger-foreground);
  --color-warning: var(--warning);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0b0c0f;
    --foreground: #f2f3f5;
    --surface: #16181d;
    --border: #2a2d34;
    --muted: #9296a1;
    --accent: #9bef3f;
    --accent-foreground: #0d1a02;
    --danger: #ff6369;
    --danger-foreground: #1a0505;
    --warning: #ffb84d;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans), Arial, Helvetica, sans-serif;
}
```

This fixes a pre-existing bug: `body` was hardcoding `font-family: Arial, Helvetica, sans-serif`, silently overriding the Geist font already loaded via `--font-geist-sans` in `app/layout.tsx`.

- [ ] **Step 3: Verify the app still builds**

Run: `npx tsc --noEmit`
Expected: no errors (this step only touches CSS, but confirms the repo is otherwise clean before further changes).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app/globals.css
git commit -m "feat: add lucide-react and bold light/dark design tokens"
```

---

## Task 2: Button component

**Files:**
- Create: `components/ui/Button.tsx`

**Interfaces:**
- Consumes: CSS tokens from Task 1 (`--color-accent`, `--color-border`, etc.), `Loader2` icon from `lucide-react`.
- Produces: `Button` component used by every later UI task —
  `Button(props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean; icon?: ReactNode })`. Default `variant` is `"primary"`. When `loading` is true, the button is disabled and the `icon` (if any) is replaced with a spinning `Loader2`.

- [ ] **Step 1: Create the component**

```tsx
import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground hover:opacity-90",
  secondary: "border border-border bg-surface text-foreground hover:bg-border/30",
  ghost: "text-muted hover:text-foreground",
  danger: "text-danger hover:bg-danger/10",
};

export function Button({
  variant = "primary",
  loading = false,
  icon,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/Button.tsx
git commit -m "feat: add Button UI primitive"
```

---

## Task 3: IconButton component

**Files:**
- Create: `components/ui/IconButton.tsx`

**Interfaces:**
- Consumes: CSS tokens from Task 1, `Loader2` from `lucide-react`.
- Produces: `IconButton` component used by every icon-only button in later tasks —
  `IconButton(props: ButtonHTMLAttributes<HTMLButtonElement> & { icon: ReactNode; "aria-label": string; variant?: "default" | "danger"; loading?: boolean })`. `aria-label` is required (TypeScript enforces this — omitting it is a compile error, which is the intended guardrail from the spec).

- [ ] **Step 1: Create the component**

```tsx
import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

type IconButtonVariant = "default" | "danger";

const variantClasses: Record<IconButtonVariant, string> = {
  default: "text-muted hover:bg-border/30 hover:text-foreground",
  danger: "text-danger hover:bg-danger/10",
};

export function IconButton({
  icon,
  "aria-label": ariaLabel,
  variant = "default",
  loading = false,
  className = "",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  "aria-label": string;
  variant?: IconButtonVariant;
  loading?: boolean;
}) {
  return (
    <button
      aria-label={ariaLabel}
      disabled={disabled || loading}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/IconButton.tsx
git commit -m "feat: add IconButton UI primitive"
```

---

## Task 4: Card component

**Files:**
- Create: `components/ui/Card.tsx`

**Interfaces:**
- Consumes: CSS tokens from Task 1.
- Produces: `Card` component — `Card(props: HTMLAttributes<HTMLDivElement>)`, renders a `<div>` with the surface/border/padding treatment that replaces the `rounded border p-4` pattern currently copy-pasted across pages.

- [ ] **Step 1: Create the component**

```tsx
import { type HTMLAttributes } from "react";

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-xl border border-border bg-surface p-4 ${className}`} {...rest} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/Card.tsx
git commit -m "feat: add Card UI primitive"
```

---

## Task 5: Bottom nav with icons

**Files:**
- Create: `app/(app)/BottomNav.tsx`
- Modify: `app/(app)/LogoutButton.tsx`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `IconButton` (Task 3), lucide icons `LayoutDashboard`, `ClipboardList`, `Dumbbell`, `History`, `LogOut`.
- Produces: `BottomNav` component (default export style: named export `BottomNav()`, no props) rendered by `AppLayout`.

- [ ] **Step 1: Rewrite `LogoutButton.tsx` to use `IconButton`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { IconButton } from "@/components/ui/IconButton";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return <IconButton icon={<LogOut className="h-5 w-5" />} aria-label="Log out" onClick={handleLogout} />;
}
```

- [ ] **Step 2: Create `app/(app)/BottomNav.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ClipboardList, Dumbbell, History } from "lucide-react";
import { LogoutButton } from "./LogoutButton";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/routines", label: "Routines", icon: ClipboardList },
  { href: "/exercises", label: "Exercises", icon: Dumbbell },
  { href: "/history", label: "History", icon: History },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 flex items-center justify-around border-t border-border bg-surface px-2 py-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 text-xs ${
              active ? "text-accent" : "text-muted"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
      <LogoutButton />
    </nav>
  );
}
```

- [ ] **Step 3: Wire `BottomNav` into the layout**

In `app/(app)/layout.tsx`, replace the whole file with:

```tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { BottomNav } from "./BottomNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen pb-16">
      <main className="p-4">{children}</main>
      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/BottomNav.tsx" "app/(app)/LogoutButton.tsx" "app/(app)/layout.tsx"
git commit -m "feat: icon-based bottom nav with active-route highlighting"
```

---

## Task 6: Muscle group dropdown — DB constraint, Zod enum, test fixtures

**Files:**
- Create: `supabase/migrations/0002_muscle_group_enum.sql`
- Modify: `lib/validation.ts`
- Modify: `lib/validation.test.ts`
- Modify: `lib/exercises/service.test.ts`
- Modify: `lib/sessions/service.test.ts`

**Interfaces:**
- Produces: `createExerciseSchema` now requires `muscleGroup: "Chest" | "Back" | "Legs" | "Shoulders" | "Arms" | "Core"` (previously optional free-text). Every caller across the codebase that constructs this input must supply a valid value.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0002_muscle_group_enum.sql`:

```sql
alter table public.exercises
  add constraint exercises_muscle_group_check
  check (muscle_group in ('Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'));
```

- [ ] **Step 2: Apply the migration locally**

Run: `supabase db reset`
Expected: migration applies cleanly (all existing preset rows already satisfy the constraint — no data violates it).

- [ ] **Step 3: Write the failing validation tests**

In `lib/validation.test.ts`, add two `it` blocks inside the existing `describe("createExerciseSchema", ...)` block (after the existing two):

```ts
  it("rejects a missing muscle group", () => {
    const result = createExerciseSchema.safeParse({ name: "Cable Fly" });
    expect(result.success).toBe(false);
  });
  it("rejects a muscle group outside the fixed set", () => {
    const result = createExerciseSchema.safeParse({ name: "Cable Fly", muscleGroup: "Cardio" });
    expect(result.success).toBe(false);
  });
```

- [ ] **Step 4: Run the new tests to verify they fail**

Run: `npx vitest run lib/validation.test.ts`
Expected: FAIL — `muscleGroup` is currently optional free-text, so both new assertions fail (missing/invalid values are currently accepted).

- [ ] **Step 5: Change the schema**

In `lib/validation.ts`, replace:

```ts
export const createExerciseSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  muscleGroup: z.string().trim().max(50).optional(),
});
```

with:

```ts
export const createExerciseSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  muscleGroup: z.enum(["Chest", "Back", "Legs", "Shoulders", "Arms", "Core"]),
});
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/validation.test.ts`
Expected: PASS — all `createExerciseSchema` tests, including the two new ones.

- [ ] **Step 7: Fix broken test fixtures — `lib/exercises/service.test.ts`**

Three calls to `createCustomExerciseForUser` no longer satisfy the schema. Update them:

Line ~37, change:
```ts
    const exercise = await createCustomExerciseForUser(client, userId, { name: "Temp Exercise" });
```
to:
```ts
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: "Temp Exercise",
      muscleGroup: "Legs",
    });
```

Line ~44, change:
```ts
    await createCustomExerciseForUser(client, userId, { name: "Incline Press" });
```
to:
```ts
    await createCustomExerciseForUser(client, userId, { name: "Incline Press", muscleGroup: "Chest" });
```

Line ~46, change:
```ts
      createCustomExerciseForUser(client, userId, { name: "incline press" })
```
to:
```ts
      createCustomExerciseForUser(client, userId, { name: "incline press", muscleGroup: "Chest" })
```

- [ ] **Step 8: Fix broken test fixtures — `lib/sessions/service.test.ts`**

Six calls to `createCustomExerciseForUser` pass only `{ name: uniqueExerciseName(...) }`. Add `muscleGroup: "Chest"` to each of their argument objects (at lines ~96, ~114, ~138, ~162, ~192, ~241). For example, the first one changes from:

```ts
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: uniqueExerciseName("First Set Exercise"),
    });
```

to:

```ts
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: uniqueExerciseName("First Set Exercise"),
      muscleGroup: "Chest",
    });
```

Apply the identical `muscleGroup: "Chest",` addition to the other five call sites (`"Lighter Set Exercise"`, `"Warmup Exercise"`, `"Correction Exercise"`, `"Set Number Gap Exercise"`, `"Discard Exercise"`).

- [ ] **Step 9: Run the full DB-backed suite to verify nothing else broke**

Run: `DOTENV_CONFIG_PATH=.env.local npm run test:db`
Expected: PASS (requires `supabase start` running).

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/0002_muscle_group_enum.sql lib/validation.ts lib/validation.test.ts lib/exercises/service.test.ts lib/sessions/service.test.ts
git commit -m "feat: restrict muscle_group to a fixed 6-value set (DB + Zod)"
```

---

## Task 7: Muscle group dropdown UI

**Files:**
- Modify: `app/(app)/exercises/AddExerciseForm.tsx`

**Interfaces:**
- Consumes: `createExerciseSchema` (Task 6), `Button`/`Card` (Tasks 2, 4), `Plus` icon.

- [ ] **Step 1: Rewrite the form**

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Plus } from "lucide-react";
import { createExerciseSchema } from "@/lib/validation";
import { createCustomExercise } from "@/lib/actions/exercises";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type FormValues = z.infer<typeof createExerciseSchema>;

const MUSCLE_GROUPS = ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core"] as const;

export function AddExerciseForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createExerciseSchema),
    defaultValues: { muscleGroup: "Chest" },
  });

  async function onSubmit(values: FormValues) {
    await createCustomExercise(values);
    reset({ name: "", muscleGroup: "Chest" });
  }

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)} className="flex gap-2">
        <input
          {...register("name")}
          placeholder="Exercise name"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2"
        />
        <select
          {...register("muscleGroup")}
          className="w-40 rounded-lg border border-border bg-surface px-3 py-2"
        >
          {MUSCLE_GROUPS.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
        <Button type="submit" variant="primary" icon={<Plus className="h-4 w-4" />} loading={isSubmitting}>
          Add
        </Button>
      </form>
      {errors.name && <p className="mt-2 text-sm text-danger">{errors.name.message}</p>}
      {errors.muscleGroup && <p className="mt-2 text-sm text-danger">{errors.muscleGroup.message}</p>}
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/exercises/AddExerciseForm.tsx"
git commit -m "feat: muscle group dropdown on the add-exercise form"
```

---

## Task 8: Exercises list — muscle group pills, archive icon

**Files:**
- Modify: `app/(app)/exercises/page.tsx`
- Modify: `app/(app)/exercises/ArchiveExerciseButton.tsx`

**Interfaces:**
- Consumes: `IconButton` (Task 3), `Archive` icon.

- [ ] **Step 1: Rewrite `ArchiveExerciseButton.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Archive } from "lucide-react";
import { archiveExercise } from "@/lib/actions/exercises";
import { IconButton } from "@/components/ui/IconButton";

export function ArchiveExerciseButton({ exerciseId }: { exerciseId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleArchive() {
    setPending(true);
    setError(null);
    try {
      await archiveExercise(exerciseId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive exercise");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <IconButton
        icon={<Archive className="h-4 w-4" />}
        aria-label="Archive exercise"
        loading={pending}
        onClick={handleArchive}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `exercises/page.tsx` with colored muscle-group pills**

```tsx
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listExercises } from "@/lib/exercises/service";
import { AddExerciseForm } from "./AddExerciseForm";
import { ArchiveExerciseButton } from "./ArchiveExerciseButton";

const MUSCLE_GROUP_STYLES: Record<string, string> = {
  Chest: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  Back: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  Legs: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Shoulders: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  Arms: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  Core: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

export default async function ExercisesPage() {
  const supabase = await createServerSupabaseClient();
  const exercises = await listExercises(supabase);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Exercises</h1>
      <AddExerciseForm />
      <ul className="divide-y divide-border">
        {exercises.map((exercise) => (
          <li key={exercise.id} className="flex items-center justify-between py-2">
            <span className="flex items-center gap-2">
              <Link href={`/exercises/${exercise.id}`} className="underline">
                {exercise.name}
              </Link>
              {exercise.muscle_group && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    MUSCLE_GROUP_STYLES[exercise.muscle_group] ?? "bg-border text-muted"
                  }`}
                >
                  {exercise.muscle_group}
                </span>
              )}
            </span>
            {!exercise.is_preset && <ArchiveExerciseButton exerciseId={exercise.id} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/exercises/page.tsx" "app/(app)/exercises/ArchiveExerciseButton.tsx"
git commit -m "feat: colored muscle-group pills and icon archive button"
```

---

## Task 9: `updateSetForUser` service function

**Files:**
- Modify: `lib/validation.ts`
- Modify: `lib/sessions/service.ts`
- Modify: `lib/sessions/service.test.ts`

**Interfaces:**
- Produces: `updateSetSchema = z.object({ weightKg: number, reps: number, isWarmup: boolean })` and
  `updateSetForUser(supabase: SupabaseClient<Database>, userId: string, setId: string, input: unknown): Promise<{ set: SetRow; isPr: boolean }>`, consumed by Task 10's Server Action.

- [ ] **Step 1: Add `updateSetSchema` to `lib/validation.ts`**

Add after `logSetSchema`:

```ts
export const updateSetSchema = z.object({
  weightKg: z.number().positive().max(999.99),
  reps: z.number().int().positive().max(999),
  isWarmup: z.boolean(),
});
```

- [ ] **Step 2: Write the failing service tests**

In `lib/sessions/service.test.ts`, add `updateSetForUser` to the import from `"./service"`:

```ts
import {
  startSessionForUser,
  addExerciseToSessionForUser,
  logSetForUser,
  updateSetForUser,
  deleteSetForUser,
  finishSessionForUser,
  discardSessionForUser,
} from "./service";
```

Then add these three `it` blocks at the end of the `describe("sessions service", ...)` block, before the closing `});`:

```ts
  it("updates a set's weight and reps", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: uniqueExerciseName("Update Weight Exercise"),
      muscleGroup: "Chest",
    });
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-14" });
    const sessionExercise = await addExerciseToSessionForUser(client, userId, session.id, exercise.id);
    const logged = await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 60,
      reps: 8,
      isWarmup: false,
    });

    const { set } = await updateSetForUser(client, userId, logged.set.id, {
      weightKg: 65,
      reps: 6,
      isWarmup: false,
    });

    expect(Number(set.weight_kg)).toBe(65);
    expect(set.reps).toBe(6);
  });

  it("marks an edited set as a new PR when raised above the prior best", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: uniqueExerciseName("Edit To PR Exercise"),
      muscleGroup: "Back",
    });
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-15" });
    const sessionExercise = await addExerciseToSessionForUser(client, userId, session.id, exercise.id);
    await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 100,
      reps: 5,
      isWarmup: false,
    });
    const second = await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 90,
      reps: 5,
      isWarmup: false,
    });

    const { isPr } = await updateSetForUser(client, userId, second.set.id, {
      weightKg: 120,
      reps: 5,
      isWarmup: false,
    });

    expect(isPr).toBe(true);
  });

  it("rejects updating another user's set", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: uniqueExerciseName("Foreign Update Exercise"),
      muscleGroup: "Legs",
    });
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-16" });
    const sessionExercise = await addExerciseToSessionForUser(client, userId, session.id, exercise.id);
    const logged = await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 50,
      reps: 10,
      isWarmup: false,
    });
    const attacker = await createTestUser(admin);

    await expect(
      updateSetForUser(attacker.client, attacker.userId, logged.set.id, {
        weightKg: 999,
        reps: 1,
        isWarmup: false,
      })
    ).rejects.toThrow();

    const { data } = await admin.from("sets").select("weight_kg").eq("id", logged.set.id).single();
    expect(Number(data!.weight_kg)).toBe(50);
  });
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `DOTENV_CONFIG_PATH=.env.local npx vitest run lib/sessions/service.test.ts`
Expected: FAIL with a TypeScript/import error — `updateSetForUser` does not exist yet.

- [ ] **Step 4: Implement `updateSetForUser` in `lib/sessions/service.ts`**

Add `updateSetSchema` to the existing import line:

```ts
import { startSessionSchema, logSetSchema, updateSetSchema } from "@/lib/validation";
```

Add this function after `logSetForUser` and before `deleteSetForUser`:

```ts
export async function updateSetForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  setId: string,
  input: unknown
): Promise<{ set: SetRow; isPr: boolean }> {
  const parsed = updateSetSchema.parse(input);

  const { data: existing, error: existingError } = await supabase
    .from("sets")
    .select("exercise_id")
    .eq("id", setId)
    .eq("user_id", userId)
    .single();
  if (existingError) throw new Error(existingError.message);

  const priorMax = parsed.isWarmup
    ? null
    : await getPriorMaxWeight(supabase, userId, existing.exercise_id);

  const { data: set, error } = await supabase
    .from("sets")
    .update({
      weight_kg: parsed.weightKg,
      reps: parsed.reps,
      is_warmup: parsed.isWarmup,
    })
    .eq("id", setId)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  const isPr = !parsed.isWarmup && isNewPr(parsed.weightKg, priorMax);
  return { set, isPr };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `DOTENV_CONFIG_PATH=.env.local npx vitest run lib/sessions/service.test.ts`
Expected: PASS — all tests in this file, including the three new ones.

- [ ] **Step 6: Commit**

```bash
git add lib/validation.ts lib/sessions/service.ts lib/sessions/service.test.ts
git commit -m "feat: add updateSetForUser with live PR recomputation"
```

---

## Task 10: `updateSet` Server Action

**Files:**
- Modify: `lib/actions/sessions.ts`

**Interfaces:**
- Consumes: `updateSetForUser` (Task 9).
- Produces: `updateSet(setId: string, input: unknown): Promise<{ set: SetRow; isPr: boolean }>`, consumed by Task 11's `LoggingClient`.

- [ ] **Step 1: Add the action**

Add `updateSetForUser` to the existing import from `"@/lib/sessions/service"`:

```ts
import {
  startSessionForUser,
  addExerciseToSessionForUser,
  logSetForUser,
  updateSetForUser,
  deleteSetForUser,
  finishSessionForUser,
  discardSessionForUser,
} from "@/lib/sessions/service";
```

Add this function after `logSet` and before `deleteSet`:

```ts
export async function updateSet(setId: string, input: unknown) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  return updateSetForUser(supabase, userId, setId, input);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/sessions.ts
git commit -m "feat: add updateSet server action"
```

---

## Task 11: Logging screen — icons, inline edit/delete for sets

**Files:**
- Modify: `app/(app)/log/[sessionId]/LoggingClient.tsx`

**Interfaces:**
- Consumes: `updateSet`, `deleteSet` (already exported from `lib/actions/sessions.ts`), `Button`/`IconButton`/`Card` (Tasks 2–4).

- [ ] **Step 1: Rewrite the full file**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Check, X, CheckCircle2 } from "lucide-react";
import {
  logSet,
  updateSet,
  deleteSet,
  finishSession,
  discardSession,
  addExerciseToSession,
} from "@/lib/actions/sessions";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Card } from "@/components/ui/Card";

type SetEntry = {
  id: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  is_warmup: boolean;
  pending?: boolean;
};
type ExerciseEntry = {
  sessionExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  sets: SetEntry[];
};
type SetFormInput = { weight: string; reps: string; warmup: boolean };
type AvailableExercise = { id: string; name: string };

export function LoggingClient({
  sessionId,
  sessionName,
  initialExercises,
  availableExercises,
}: {
  sessionId: string;
  sessionName: string;
  initialExercises: ExerciseEntry[];
  availableExercises: AvailableExercise[];
}) {
  const router = useRouter();
  const [exercises, setExercises] = useState(initialExercises);
  const [prBanner, setPrBanner] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, SetFormInput>>({});
  const [pickerExerciseId, setPickerExerciseId] = useState(availableExercises[0]?.id ?? "");
  const [addExercisePending, setAddExercisePending] = useState(false);
  const [addExerciseError, setAddExerciseError] = useState<string | null>(null);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [editInputs, setEditInputs] = useState<Record<string, SetFormInput>>({});
  const [confirmDeleteSetId, setConfirmDeleteSetId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const logSetMutation = useMutation({
    mutationFn: (vars: {
      sessionExerciseId: string;
      weightKg: number;
      reps: number;
      isWarmup: boolean;
      tempId: string;
    }) => logSet(vars),
    onMutate: (vars) => {
      setExercises((prev) =>
        prev.map((ex) =>
          ex.sessionExerciseId === vars.sessionExerciseId
            ? {
                ...ex,
                sets: [
                  ...ex.sets,
                  {
                    id: vars.tempId,
                    set_number: ex.sets.length + 1,
                    weight_kg: vars.weightKg,
                    reps: vars.reps,
                    is_warmup: vars.isWarmup,
                    pending: true,
                  },
                ],
              }
            : ex
        )
      );
    },
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
      if (result.isPr) {
        const exercise = exercises.find((ex) => ex.sessionExerciseId === vars.sessionExerciseId);
        setPrBanner(`New PR on ${exercise?.exerciseName}: ${vars.weightKg}kg!`);
      }
    },
    onError: (_err, vars) => {
      setExercises((prev) =>
        prev.map((ex) =>
          ex.sessionExerciseId === vars.sessionExerciseId
            ? { ...ex, sets: ex.sets.filter((s) => s.id !== vars.tempId) }
            : ex
        )
      );
    },
  });

  const updateSetMutation = useMutation({
    mutationFn: (vars: {
      setId: string;
      sessionExerciseId: string;
      weightKg: number;
      reps: number;
      isWarmup: boolean;
    }) => updateSet(vars.setId, { weightKg: vars.weightKg, reps: vars.reps, isWarmup: vars.isWarmup }),
    onSuccess: (result, vars) => {
      setExercises((prev) =>
        prev.map((ex) =>
          ex.sessionExerciseId === vars.sessionExerciseId
            ? { ...ex, sets: ex.sets.map((s) => (s.id === vars.setId ? { ...result.set } : s)) }
            : ex
        )
      );
      if (result.isPr) {
        const exercise = exercises.find((ex) => ex.sessionExerciseId === vars.sessionExerciseId);
        setPrBanner(`New PR on ${exercise?.exerciseName}: ${vars.weightKg}kg!`);
      }
      setEditingSetId(null);
    },
  });

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

  function startEdit(set: SetEntry) {
    setConfirmDeleteSetId(null);
    setEditingSetId(set.id);
    setEditInputs((prev) => ({
      ...prev,
      [set.id]: { weight: String(set.weight_kg), reps: String(set.reps), warmup: set.is_warmup },
    }));
  }

  function confirmEdit(sessionExerciseId: string, setId: string) {
    const input = editInputs[setId];
    if (!input?.weight || !input?.reps) return;
    updateSetMutation.mutate({
      setId,
      sessionExerciseId,
      weightKg: Number(input.weight),
      reps: Number(input.reps),
      isWarmup: input.warmup,
    });
  }

  async function handleDeleteSet(sessionExerciseId: string, set: SetEntry) {
    setExercises((prev) =>
      prev.map((ex) =>
        ex.sessionExerciseId === sessionExerciseId
          ? { ...ex, sets: ex.sets.filter((s) => s.id !== set.id) }
          : ex
      )
    );
    setConfirmDeleteSetId(null);
    setDeleteError(null);
    try {
      await deleteSet(set.id);
    } catch (err) {
      setExercises((prev) =>
        prev.map((ex) =>
          ex.sessionExerciseId === sessionExerciseId
            ? { ...ex, sets: [...ex.sets, set].sort((a, b) => a.set_number - b.set_number) }
            : ex
        )
      );
      setDeleteError(err instanceof Error ? err.message : "Failed to delete set");
    }
  }

  async function handleAddExercise() {
    if (!pickerExerciseId) return;
    setAddExercisePending(true);
    setAddExerciseError(null);
    try {
      const sessionExercise = await addExerciseToSession(sessionId, pickerExerciseId);
      const exerciseName =
        availableExercises.find((e) => e.id === pickerExerciseId)?.name ?? "Exercise";
      setExercises((prev) => [
        ...prev,
        {
          sessionExerciseId: sessionExercise.id,
          exerciseId: pickerExerciseId,
          exerciseName,
          sets: [],
        },
      ]);
    } catch (err) {
      setAddExerciseError(err instanceof Error ? err.message : "Failed to add exercise");
    } finally {
      setAddExercisePending(false);
    }
  }

  async function handleFinish() {
    await finishSession(sessionId);
    router.push("/dashboard");
  }

  async function handleDiscard() {
    await discardSession(sessionId);
    router.push("/dashboard");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{sessionName}</h1>
      {prBanner && (
        <div className="rounded-xl bg-warning/15 p-3 font-medium text-warning">{prBanner}</div>
      )}
      {logSetMutation.isError && (
        <div className="rounded-xl bg-danger/15 p-3 text-danger">
          Failed to save that set — check your connection and try again.
        </div>
      )}
      {deleteError && <div className="rounded-xl bg-danger/15 p-3 text-danger">{deleteError}</div>}
      {exercises.map((exercise) => {
        const input = inputs[exercise.sessionExerciseId] ?? { weight: "", reps: "", warmup: false };
        return (
          <Card key={exercise.sessionExerciseId}>
            <h2 className="font-medium">{exercise.exerciseName}</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {exercise.sets.map((set) => (
                <li key={set.id} className={set.pending ? "opacity-50" : ""}>
                  {editingSetId === set.id ? (
                    <div className="flex items-center gap-2 py-1">
                      <input
                        type="number"
                        value={editInputs[set.id]?.weight ?? ""}
                        onChange={(e) =>
                          setEditInputs((prev) => ({
                            ...prev,
                            [set.id]: { ...prev[set.id], weight: e.target.value },
                          }))
                        }
                        className="w-16 rounded-lg border border-border bg-surface px-2 py-1"
                      />
                      <input
                        type="number"
                        value={editInputs[set.id]?.reps ?? ""}
                        onChange={(e) =>
                          setEditInputs((prev) => ({
                            ...prev,
                            [set.id]: { ...prev[set.id], reps: e.target.value },
                          }))
                        }
                        className="w-16 rounded-lg border border-border bg-surface px-2 py-1"
                      />
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={editInputs[set.id]?.warmup ?? false}
                          onChange={(e) =>
                            setEditInputs((prev) => ({
                              ...prev,
                              [set.id]: { ...prev[set.id], warmup: e.target.checked },
                            }))
                          }
                        />
                        Warmup
                      </label>
                      <IconButton
                        icon={<Check className="h-4 w-4" />}
                        aria-label="Save set"
                        loading={updateSetMutation.isPending}
                        onClick={() => confirmEdit(exercise.sessionExerciseId, set.id)}
                      />
                      <IconButton
                        icon={<X className="h-4 w-4" />}
                        aria-label="Cancel edit"
                        onClick={() => setEditingSetId(null)}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between py-1">
                      <span>
                        Set {set.set_number}: {set.weight_kg}kg × {set.reps}
                        {set.is_warmup ? " (warmup)" : ""}
                      </span>
                      <div className="flex items-center gap-1">
                        {confirmDeleteSetId === set.id ? (
                          <>
                            <IconButton
                              icon={<Check className="h-4 w-4" />}
                              aria-label="Confirm delete set"
                              variant="danger"
                              onClick={() => handleDeleteSet(exercise.sessionExerciseId, set)}
                            />
                            <IconButton
                              icon={<X className="h-4 w-4" />}
                              aria-label="Cancel delete"
                              onClick={() => setConfirmDeleteSetId(null)}
                            />
                          </>
                        ) : (
                          <>
                            <IconButton
                              icon={<Pencil className="h-4 w-4" />}
                              aria-label="Edit set"
                              onClick={() => startEdit(set)}
                            />
                            <IconButton
                              icon={<Trash2 className="h-4 w-4" />}
                              aria-label="Delete set"
                              variant="danger"
                              onClick={() => setConfirmDeleteSetId(set.id)}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                placeholder="kg"
                value={input.weight}
                onChange={(e) =>
                  setInputs((prev) => ({
                    ...prev,
                    [exercise.sessionExerciseId]: { ...input, weight: e.target.value },
                  }))
                }
                className="w-20 rounded-lg border border-border bg-surface px-2 py-1"
              />
              <input
                type="number"
                placeholder="reps"
                value={input.reps}
                onChange={(e) =>
                  setInputs((prev) => ({
                    ...prev,
                    [exercise.sessionExerciseId]: { ...input, reps: e.target.value },
                  }))
                }
                className="w-20 rounded-lg border border-border bg-surface px-2 py-1"
              />
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={input.warmup}
                  onChange={(e) =>
                    setInputs((prev) => ({
                      ...prev,
                      [exercise.sessionExerciseId]: { ...input, warmup: e.target.checked },
                    }))
                  }
                />
                Warmup
              </label>
              <Button
                variant="secondary"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => handleAddSet(exercise.sessionExerciseId)}
              >
                Add Set
              </Button>
            </div>
          </Card>
        );
      })}
      {availableExercises.length > 0 && (
        <Card>
          <h2 className="font-medium">Add Exercise</h2>
          <div className="mt-2 flex gap-2">
            <select
              value={pickerExerciseId}
              onChange={(e) => setPickerExerciseId(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2"
            >
              {availableExercises.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              icon={<Plus className="h-4 w-4" />}
              loading={addExercisePending}
              onClick={handleAddExercise}
            >
              Add
            </Button>
          </div>
          {addExerciseError && <p className="mt-2 text-sm text-danger">{addExerciseError}</p>}
        </Card>
      )}
      <div className="flex gap-2">
        <Button variant="primary" icon={<CheckCircle2 className="h-4 w-4" />} onClick={handleFinish}>
          Finish Workout
        </Button>
        <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={handleDiscard}>
          Discard
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`, sign in, start a session, log a set, click the pencil icon and change the weight, confirm it saves and (if raised above a prior best) a PR banner appears. Click the trash icon, confirm the confirm/cancel icons appear, confirm deleting removes the row.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/log/[sessionId]/LoggingClient.tsx"
git commit -m "feat: inline edit/delete for logged sets, icon-based logging UI"
```

---

## Task 12: Dashboard — icon CTA, trophy PR list, icon discard

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`
- Modify: `app/(app)/dashboard/DiscardSessionButton.tsx`

**Interfaces:**
- Consumes: `IconButton` (Task 3), `Play`/`Trophy` icons.

- [ ] **Step 1: Rewrite `DiscardSessionButton.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { discardSession } from "@/lib/actions/sessions";
import { IconButton } from "@/components/ui/IconButton";

export function DiscardSessionButton({ sessionId }: { sessionId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDiscard() {
    setPending(true);
    setError(null);
    try {
      await discardSession(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to discard session");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <IconButton
        icon={<Trash2 className="h-4 w-4" />}
        aria-label="Discard session"
        variant="danger"
        loading={pending}
        onClick={handleDiscard}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `dashboard/page.tsx`**

```tsx
import Link from "next/link";
import { Play, Trophy } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listInProgressSessions, listPrsFromLastCompletedSession } from "@/lib/dashboard/service";
import { DiscardSessionButton } from "./DiscardSessionButton";

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [inProgress, recentPrs] = await Promise.all([
    listInProgressSessions(supabase),
    listPrsFromLastCompletedSession(supabase, user!.id),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <Link
        href="/log"
        className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 font-medium text-accent-foreground"
      >
        <Play className="h-4 w-4" />
        Start a Workout
      </Link>

      {inProgress.length > 0 && (
        <section>
          <h2 className="font-medium">In Progress</h2>
          <ul className="divide-y divide-border">
            {inProgress.map((session) => (
              <li key={session.id} className="flex items-center justify-between py-2">
                <Link href={`/log/${session.id}`} className="underline">
                  {session.name ?? "Workout"} — {session.session_date}
                </Link>
                <DiscardSessionButton sessionId={session.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {recentPrs.length > 0 && (
        <section>
          <h2 className="font-medium">Top lifts from your last workout</h2>
          <ul className="space-y-1">
            {recentPrs.map((pr) => (
              <li
                key={pr.exerciseName}
                className="flex items-center gap-2 rounded-xl bg-warning/15 px-3 py-2"
              >
                <Trophy className="h-4 w-4 text-warning" />
                {pr.exerciseName}: {pr.weightKg}kg
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard/page.tsx" "app/(app)/dashboard/DiscardSessionButton.tsx"
git commit -m "feat: icon CTA and trophy PR list on the dashboard"
```

---

## Task 13: Routines list — icon create/delete

**Files:**
- Modify: `app/(app)/routines/CreateRoutineForm.tsx`
- Modify: `app/(app)/routines/DeleteRoutineButton.tsx`
- Modify: `app/(app)/routines/page.tsx`

**Interfaces:**
- Consumes: `Button`/`IconButton` (Tasks 2, 3), `Plus`/`Trash2` icons.

- [ ] **Step 1: Rewrite `CreateRoutineForm.tsx`**

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Plus } from "lucide-react";
import { createRoutineSchema } from "@/lib/validation";
import { createRoutine } from "@/lib/actions/routines";
import { Button } from "@/components/ui/Button";

type FormValues = z.infer<typeof createRoutineSchema>;

export function CreateRoutineForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(createRoutineSchema) });

  async function onSubmit(values: FormValues) {
    await createRoutine(values);
    reset();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex gap-2">
      <input
        {...register("name")}
        placeholder="Routine name (e.g. Push Day)"
        className="flex-1 rounded-lg border border-border bg-surface px-3 py-2"
      />
      <Button type="submit" variant="primary" icon={<Plus className="h-4 w-4" />} loading={isSubmitting}>
        Create
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Rewrite `DeleteRoutineButton.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteRoutine } from "@/lib/actions/routines";
import { IconButton } from "@/components/ui/IconButton";

export function DeleteRoutineButton({ routineId }: { routineId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      await deleteRoutine(routineId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete routine");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <IconButton
        icon={<Trash2 className="h-4 w-4" />}
        aria-label="Delete routine"
        variant="danger"
        loading={pending}
        onClick={handleDelete}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Update the divider color in `routines/page.tsx`**

Change:
```tsx
      <ul className="divide-y">
```
to:
```tsx
      <ul className="divide-y divide-border">
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/routines/CreateRoutineForm.tsx" "app/(app)/routines/DeleteRoutineButton.tsx" "app/(app)/routines/page.tsx"
git commit -m "feat: icon create/delete buttons on the routines list"
```

---

## Task 14: Routine editor — reorder/remove icons

**Files:**
- Modify: `app/(app)/routines/[routineId]/RoutineExerciseRow.tsx`
- Modify: `app/(app)/routines/[routineId]/AddExerciseToRoutine.tsx`
- Modify: `app/(app)/routines/[routineId]/page.tsx`

**Interfaces:**
- Consumes: `Button`/`IconButton` (Tasks 2, 3), `ChevronUp`/`ChevronDown`/`X`/`Plus` icons.

- [ ] **Step 1: Rewrite `RoutineExerciseRow.tsx`**

```tsx
"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import { removeRoutineExercise, moveRoutineExercise } from "@/lib/actions/routines";
import { IconButton } from "@/components/ui/IconButton";

type PendingAction = "up" | "down" | "remove" | null;

export function RoutineExerciseRow({
  routineId,
  routineExerciseId,
  name,
}: {
  routineId: string;
  routineExerciseId: string;
  name: string;
}) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleMove(direction: "up" | "down") {
    setPending(direction);
    setError(null);
    try {
      await moveRoutineExercise(routineExerciseId, routineId, direction);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move exercise");
    } finally {
      setPending(null);
    }
  }

  async function handleRemove() {
    setPending("remove");
    setError(null);
    try {
      await removeRoutineExercise(routineExerciseId, routineId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove exercise");
    } finally {
      setPending(null);
    }
  }

  return (
    <li className="py-2">
      <div className="flex items-center justify-between">
        <span>{name}</span>
        <div className="flex items-center gap-1">
          <IconButton
            icon={<ChevronUp className="h-4 w-4" />}
            aria-label="Move exercise up"
            loading={pending === "up"}
            disabled={pending !== null && pending !== "up"}
            onClick={() => handleMove("up")}
          />
          <IconButton
            icon={<ChevronDown className="h-4 w-4" />}
            aria-label="Move exercise down"
            loading={pending === "down"}
            disabled={pending !== null && pending !== "down"}
            onClick={() => handleMove("down")}
          />
          <IconButton
            icon={<X className="h-4 w-4" />}
            aria-label="Remove exercise from routine"
            variant="danger"
            loading={pending === "remove"}
            disabled={pending !== null && pending !== "remove"}
            onClick={handleRemove}
          />
        </div>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </li>
  );
}
```

- [ ] **Step 2: Rewrite `AddExerciseToRoutine.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { addExerciseToRoutine } from "@/lib/actions/routines";
import { Button } from "@/components/ui/Button";

export function AddExerciseToRoutine({
  routineId,
  availableExercises,
}: {
  routineId: string;
  availableExercises: { id: string; name: string }[];
}) {
  const [exerciseId, setExerciseId] = useState(availableExercises[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!exerciseId) return;
    setPending(true);
    setError(null);
    try {
      await addExerciseToRoutine({ routineId, exerciseId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add exercise");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <select
          value={exerciseId}
          onChange={(e) => setExerciseId(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2"
        >
          {availableExercises.map((exercise) => (
            <option key={exercise.id} value={exercise.id}>
              {exercise.name}
            </option>
          ))}
        </select>
        <Button variant="secondary" icon={<Plus className="h-4 w-4" />} loading={pending} onClick={handleAdd}>
          Add
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Update the divider color in `[routineId]/page.tsx`**

Change:
```tsx
      <ul className="divide-y">
```
to:
```tsx
      <ul className="divide-y divide-border">
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/routines/[routineId]/RoutineExerciseRow.tsx" "app/(app)/routines/[routineId]/AddExerciseToRoutine.tsx" "app/(app)/routines/[routineId]/page.tsx"
git commit -m "feat: icon reorder/remove buttons in the routine editor"
```

---

## Task 15: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full lint and non-DB test suite**

Run: `npm run lint && npm test`
Expected: both pass with no errors.

- [ ] **Step 2: Run the DB-backed integration suite**

Run: `DOTENV_CONFIG_PATH=.env.local npm run test:db` (requires `supabase start` running)
Expected: PASS, including every new test added in Tasks 6 and 9.

- [ ] **Step 3: Manual walkthrough — desktop, light mode**

Run: `npm run dev`. With the OS in light mode, in a desktop-width browser window: log in, confirm the bottom nav shows icons + labels with the active route highlighted in lime-green, start a workout, add a set, edit it via the pencil icon to a new PR weight and confirm the PR banner appears, delete a set via the trash icon (confirm the confirm/cancel step), finish the workout, create a custom exercise via the muscle-group dropdown, confirm its colored pill appears on the exercises list, archive it, create and delete a routine, reorder exercises inside a routine editor.

- [ ] **Step 4: Manual walkthrough — mobile viewport, dark mode**

Repeat the same walkthrough at a 375px-wide viewport with the OS in dark mode. Confirm text stays readable against the dark surface/background tokens, the accent green has enough contrast, and no icon-only button is missing a visible tap target.

- [ ] **Step 5: Accessibility spot-check**

In the browser devtools accessibility tree (or by reading the rendered DOM), confirm every icon-only button (delete/edit/discard/archive/reorder/logout) has a non-empty `aria-label`.

- [ ] **Step 6: Confirm the DB constraint rejects invalid data**

In Supabase Studio's SQL editor (local), run:
```sql
insert into public.exercises (user_id, name, muscle_group)
values (auth.uid(), 'Test Invalid', 'Cardio');
```
Expected: rejected with a `check constraint "exercises_muscle_group_check"` violation.

This task has no commit — it's a verification gate confirming Tasks 1–14 together satisfy the spec's Verification section.
