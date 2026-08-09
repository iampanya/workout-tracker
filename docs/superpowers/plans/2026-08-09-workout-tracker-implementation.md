# Personal Weight-Training Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal weight-training tracker web app (Next.js + Supabase) where the user logs exercises/sets/weight/reps across devices, tracks progressive overload, and sees PRs, per `docs/superpowers/specs/2026-08-09-workout-tracker-design.md`.

**Architecture:** Next.js App Router with Server Components for reads and Zod-validated Server Actions for writes, backed by Supabase Postgres with Row Level Security as the single source of truth (single-user account, no client-side caching of PRs — always recomputed live). Local development runs against a Supabase CLI–managed local Postgres/Auth stack in Docker; the same SQL migrations are pushed to a hosted Supabase project for production, deployed on Vercel.

**Tech Stack:** Next.js 16.3 (TypeScript, App Router), Supabase (Postgres + Auth + `@supabase/ssr`), Tailwind CSS, Recharts, Zod, React Hook Form, TanStack Query (logging screen only), Vitest for tests.

## Global Constraints

- Weight is stored and displayed in **kg only** as `numeric(6,2)` — no unit toggle.
- PR = the maximum `weight_kg` ever logged for an exercise, **excluding warmup sets**, computed live via a SQL view (`exercise_prs`) — never cached or stored in a table.
- Single-user app: Supabase public signup is disabled; exactly one `auth.users` row exists, created manually.
- No 1RM estimation, no lbs toggle, no social/sharing features, no nutrition tracking, no rest timer, no offline-first sync, no periodization/program builder, no multi-user support.
- All row-owning tables carry a denormalized `user_id` column; every RLS policy is a flat `user_id = auth.uid()` check.
- `session_date` is always computed client-side (local calendar date) and passed explicitly into `startSession` — never derived from the Postgres server's UTC `now()`.
- Deleting an exercise that has ever been logged is blocked at the DB level (`ON DELETE RESTRICT`); archiving (`is_archived`) is the only way to retire an exercise from active use.
- Local dev uses the Supabase CLI (`supabase start`, Docker) against migrations in `supabase/migrations/`; the same migrations are pushed to the hosted project via `supabase db push` before going live — schemas never diverge.

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Create: `vitest.config.ts`, `lib/date.ts`, `lib/date.test.ts`
- Create: `.gitignore`

**Interfaces:**
- Produces: `getLocalDateString(d?: Date): string` in `lib/date.ts` — returns the local calendar date as `YYYY-MM-DD`. Later tasks (session start, tests) import this.

- [ ] **Step 1: Scaffold the Next.js app**

Run:
```bash
npx create-next-app@16.3.0 . --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm --no-turbopack
```
When prompted, accept defaults. This creates `package.json`, `tsconfig.json`, `tailwind.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.gitignore`.

- [ ] **Step 2: Verify the dev server boots**

Run: `npm run dev -- --port 3100 & sleep 5; curl -s -o /dev/null -w "%{http_code}" http://localhost:3100; kill %1`
Expected: `200`

- [ ] **Step 3: Install app dependencies**

Run:
```bash
npm install @supabase/supabase-js @supabase/ssr zod react-hook-form @hookform/resolvers @tanstack/react-query recharts
npm install -D vitest @vitejs/plugin-react dotenv
```

- [ ] **Step 4: Add Vitest config**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

Add to `package.json` `"scripts"`: `"test": "vitest run"`.

- [ ] **Step 5: Write the failing test for the local-date utility**

Create `lib/date.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { getLocalDateString } from "./date";

describe("getLocalDateString", () => {
  it("formats a date as YYYY-MM-DD using local time, zero-padded", () => {
    const d = new Date(2026, 0, 5, 23, 30); // Jan 5, 2026, 11:30pm local
    expect(getLocalDateString(d)).toBe("2026-01-05");
  });

  it("defaults to now when no argument is passed", () => {
    const result = getLocalDateString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run lib/date.test.ts`
Expected: FAIL — `lib/date.ts` does not exist / `getLocalDateString` is not exported.

- [ ] **Step 7: Implement the utility**

Create `lib/date.ts`:
```typescript
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run lib/date.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16.3 app with Vitest and local-date utility"
```

---

## Task 2: Database Schema, RLS, and Local Supabase

**Files:**
- Create: `supabase/config.toml` (generated), `supabase/migrations/0001_init.sql`, `supabase/seed.sql`
- Create: `.env.local.example`, update `.gitignore` to exclude `.env.local`
- Create: `lib/supabase/database.types.ts` (generated)
- Create: `lib/supabase/schema.test.ts`
- Modify: `package.json` (add `"test:db"` script noting DB tests need `supabase start` running)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: the full Postgres schema (`exercises`, `routines`, `routine_exercises`, `sessions`, `session_exercises`, `sets`, view `exercise_prs`) and generated TypeScript types (`Database` type) in `lib/supabase/database.types.ts`, which every later Supabase client import relies on.

- [ ] **Step 1: Install the Supabase CLI and init the project**

Run:
```bash
brew install supabase/tap/supabase
supabase init
```
This creates `supabase/config.toml` and an empty `supabase/migrations/` directory.

- [ ] **Step 2: Start the local stack**

Run: `supabase start`
Expected output includes `API URL`, `anon key`, `service_role key`, `DB URL`. Copy these.

- [ ] **Step 3: Record local credentials**

Create `.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-anon-key-from-supabase-start
SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key-from-supabase-start
```
Copy it to `.env.local` and fill in the real values printed by `supabase start`. Add `.env.local` to `.gitignore` if `create-next-app` didn't already.

- [ ] **Step 4: Write the failing schema test**

Create `lib/supabase/schema.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

describe("database schema and RLS", () => {
  const admin = createClient(url, serviceKey);
  let userA: string;
  let userB: string;
  let clientA: ReturnType<typeof createClient>;

  beforeAll(async () => {
    const a = await admin.auth.admin.createUser({
      email: `a-${Date.now()}@test.local`,
      password: "password123",
      email_confirm: true,
    });
    const b = await admin.auth.admin.createUser({
      email: `b-${Date.now()}@test.local`,
      password: "password123",
      email_confirm: true,
    });
    userA = a.data.user!.id;
    userB = b.data.user!.id;

    clientA = createClient(url, anonKey);
    await clientA.auth.signInWithPassword({
      email: a.data.user!.email!,
      password: "password123",
    });
  });

  it("seeds preset exercises with user_id null", async () => {
    const { data, error } = await admin
      .from("exercises")
      .select("id")
      .eq("is_preset", true)
      .is("user_id", null);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it("lets a user create a routine owned by them", async () => {
    const { data, error } = await clientA
      .from("routines")
      .insert({ user_id: userA, name: "Push Day" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data!.user_id).toBe(userA);
  });

  it("blocks a user from reading another user's routine (RLS)", async () => {
    const { data: created } = await admin
      .from("routines")
      .insert({ user_id: userB, name: "User B Routine" })
      .select()
      .single();

    const { data, error } = await clientA
      .from("routines")
      .select("*")
      .eq("id", created!.id);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("computes PR live via the exercise_prs view, excluding warmups", async () => {
    const { data: exercise } = await admin
      .from("exercises")
      .select("id")
      .eq("is_preset", true)
      .limit(1)
      .single();

    const { data: session } = await admin
      .from("sessions")
      .insert({ user_id: userA, session_date: "2026-01-05" })
      .select()
      .single();
    const { data: sessionExercise } = await admin
      .from("session_exercises")
      .insert({
        session_id: session!.id,
        user_id: userA,
        exercise_id: exercise!.id,
        position: 0,
      })
      .select()
      .single();
    await admin.from("sets").insert([
      {
        session_exercise_id: sessionExercise!.id,
        user_id: userA,
        exercise_id: exercise!.id,
        set_number: 1,
        weight_kg: 999,
        reps: 5,
        is_warmup: true,
      },
      {
        session_exercise_id: sessionExercise!.id,
        user_id: userA,
        exercise_id: exercise!.id,
        set_number: 2,
        weight_kg: 100,
        reps: 5,
        is_warmup: false,
      },
    ]);

    const { data: pr, error } = await admin
      .from("exercise_prs")
      .select("pr_weight_kg")
      .eq("user_id", userA)
      .eq("exercise_id", exercise!.id)
      .single();

    expect(error).toBeNull();
    expect(Number(pr!.pr_weight_kg)).toBe(100); // the 999 warmup is excluded
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run lib/supabase/schema.test.ts`
Expected: FAIL — tables (`exercises`, `routines`, etc.) do not exist yet.

- [ ] **Step 6: Write the migration**

Create `supabase/migrations/0001_init.sql`:
```sql
create extension if not exists "pgcrypto";

-- exercises
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  muscle_group text,
  is_preset boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index exercises_user_name_key on public.exercises (
  coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)
);
alter table public.exercises enable row level security;
create policy exercises_select on public.exercises for select
  using (user_id is null or user_id = auth.uid());
create policy exercises_insert on public.exercises for insert
  with check (user_id = auth.uid());
create policy exercises_update on public.exercises for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy exercises_delete on public.exercises for delete
  using (user_id = auth.uid());

-- routines
create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.routines enable row level security;
create policy routines_all on public.routines for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- routine_exercises
create table public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  position integer not null,
  target_sets integer,
  unique (routine_id, position)
);
alter table public.routine_exercises enable row level security;
create policy routine_exercises_all on public.routine_exercises for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- sessions
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid references public.routines(id) on delete set null,
  name text,
  session_date date not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text
);
alter table public.sessions enable row level security;
create policy sessions_all on public.sessions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- session_exercises
create table public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  position integer not null,
  notes text,
  unique (session_id, position)
);
alter table public.session_exercises enable row level security;
create policy session_exercises_all on public.session_exercises for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- sets
create table public.sets (
  id uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null references public.session_exercises(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  set_number integer not null,
  weight_kg numeric(6,2) not null,
  reps integer not null,
  is_warmup boolean not null default false,
  created_at timestamptz not null default now(),
  unique (session_exercise_id, set_number)
);
create index sets_user_exercise_idx on public.sets (user_id, exercise_id, is_warmup);
alter table public.sets enable row level security;
create policy sets_all on public.sets for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- live PR view (never store/cache this)
create view public.exercise_prs as
  select user_id, exercise_id, max(weight_kg) as pr_weight_kg
  from public.sets
  where not is_warmup
  group by user_id, exercise_id;
```

- [ ] **Step 7: Write the seed data**

Create `supabase/seed.sql`:
```sql
insert into public.exercises (user_id, name, muscle_group, is_preset) values
  (null, 'Bench Press', 'Chest', true),
  (null, 'Incline Bench Press', 'Chest', true),
  (null, 'Squat', 'Legs', true),
  (null, 'Deadlift', 'Back', true),
  (null, 'Overhead Press', 'Shoulders', true),
  (null, 'Barbell Row', 'Back', true),
  (null, 'Pull-up', 'Back', true),
  (null, 'Lat Pulldown', 'Back', true),
  (null, 'Dumbbell Shoulder Press', 'Shoulders', true),
  (null, 'Leg Press', 'Legs', true),
  (null, 'Leg Curl', 'Legs', true),
  (null, 'Leg Extension', 'Legs', true),
  (null, 'Hip Thrust', 'Legs', true),
  (null, 'Bicep Curl', 'Arms', true),
  (null, 'Tricep Pushdown', 'Arms', true)
on conflict do nothing;
```

- [ ] **Step 8: Apply the migration and seed locally**

Run: `supabase db reset`
This drops and recreates the local DB, applying `0001_init.sql` then `seed.sql`.

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run lib/supabase/schema.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 10: Generate TypeScript types from the schema**

Run: `supabase gen types typescript --local > lib/supabase/database.types.ts`

- [ ] **Step 11: Disable public signup on the local project (matches production setting)**

In `supabase/config.toml`, under `[auth]`, set:
```toml
enable_signup = false
```
Run `supabase stop && supabase start` to apply, then re-run Step 9's test with the admin client (which uses `auth.admin.createUser` and bypasses the signup-disabled setting, so it still passes).

- [ ] **Step 12: Commit**

```bash
git add supabase/ lib/supabase/database.types.ts lib/supabase/schema.test.ts .env.local.example .gitignore package.json package-lock.json
git commit -m "feat: add database schema, RLS policies, and preset exercise seed"
```

---

## Task 3: Shared Pure Logic (Validation, PR Comparison, Progress Aggregation)

**Files:**
- Create: `lib/validation.ts`, `lib/validation.test.ts`
- Create: `lib/pr.ts`, `lib/pr.test.ts`
- Create: `lib/progress.ts`, `lib/progress.test.ts`

**Interfaces:**
- Consumes: nothing (pure, dependency-free logic).
- Produces:
  - `createExerciseSchema`, `createRoutineSchema`, `addRoutineExerciseSchema`, `startSessionSchema`, `logSetSchema` (Zod schemas, `lib/validation.ts`) — used by Server Actions in Tasks 5–7.
  - `isNewPr(weightKg: number, priorMaxKg: number | null): boolean` (`lib/pr.ts`) — used by `logSet` in Task 7.
  - `aggregateSessionSeries(sets: { session_date: string; weight_kg: number; reps: number }[]): { date: string; maxWeight: number; volume: number }[]` (`lib/progress.ts`) — used by the progress page in Task 9.

- [ ] **Step 1: Write failing tests for validation schemas**

Create `lib/validation.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import {
  createExerciseSchema,
  createRoutineSchema,
  addRoutineExerciseSchema,
  startSessionSchema,
  logSetSchema,
} from "./validation";

describe("createExerciseSchema", () => {
  it("accepts a valid custom exercise", () => {
    const result = createExerciseSchema.safeParse({ name: "Cable Fly", muscleGroup: "Chest" });
    expect(result.success).toBe(true);
  });
  it("rejects an empty name", () => {
    const result = createExerciseSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});

describe("createRoutineSchema", () => {
  it("accepts a name-only routine", () => {
    expect(createRoutineSchema.safeParse({ name: "Push Day" }).success).toBe(true);
  });
  it("rejects a missing name", () => {
    expect(createRoutineSchema.safeParse({}).success).toBe(false);
  });
});

describe("addRoutineExerciseSchema", () => {
  it("accepts a valid entry", () => {
    const result = addRoutineExerciseSchema.safeParse({
      routineId: "11111111-1111-1111-1111-111111111111",
      exerciseId: "22222222-2222-2222-2222-222222222222",
      position: 0,
    });
    expect(result.success).toBe(true);
  });
  it("rejects a negative position", () => {
    const result = addRoutineExerciseSchema.safeParse({
      routineId: "11111111-1111-1111-1111-111111111111",
      exerciseId: "22222222-2222-2222-2222-222222222222",
      position: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("startSessionSchema", () => {
  it("accepts a freeform session with a date", () => {
    expect(startSessionSchema.safeParse({ sessionDate: "2026-01-05" }).success).toBe(true);
  });
  it("rejects a malformed date", () => {
    expect(startSessionSchema.safeParse({ sessionDate: "01/05/2026" }).success).toBe(false);
  });
});

describe("logSetSchema", () => {
  it("accepts a valid set", () => {
    const result = logSetSchema.safeParse({
      sessionExerciseId: "11111111-1111-1111-1111-111111111111",
      weightKg: 100,
      reps: 5,
      isWarmup: false,
    });
    expect(result.success).toBe(true);
  });
  it("rejects zero or negative weight", () => {
    const result = logSetSchema.safeParse({
      sessionExerciseId: "11111111-1111-1111-1111-111111111111",
      weightKg: 0,
      reps: 5,
      isWarmup: false,
    });
    expect(result.success).toBe(false);
  });
  it("rejects zero or negative reps", () => {
    const result = logSetSchema.safeParse({
      sessionExerciseId: "11111111-1111-1111-1111-111111111111",
      weightKg: 100,
      reps: 0,
      isWarmup: false,
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/validation.test.ts`
Expected: FAIL — `lib/validation.ts` does not exist.

- [ ] **Step 3: Implement validation schemas**

Create `lib/validation.ts`:
```typescript
import { z } from "zod";

export const createExerciseSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  muscleGroup: z.string().trim().max(50).optional(),
});

export const createRoutineSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  notes: z.string().trim().max(500).optional(),
});

export const addRoutineExerciseSchema = z.object({
  routineId: z.string().uuid(),
  exerciseId: z.string().uuid(),
  position: z.number().int().min(0),
  targetSets: z.number().int().min(1).optional(),
});

export const startSessionSchema = z.object({
  routineId: z.string().uuid().optional(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  name: z.string().trim().max(100).optional(),
});

export const logSetSchema = z.object({
  sessionExerciseId: z.string().uuid(),
  weightKg: z.number().positive().max(999.99),
  reps: z.number().int().positive().max(999),
  isWarmup: z.boolean(),
});
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/validation.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Write failing test for PR comparison**

Create `lib/pr.test.ts`:
```typescript
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
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run lib/pr.test.ts`
Expected: FAIL — `lib/pr.ts` does not exist.

- [ ] **Step 7: Implement PR comparison**

Create `lib/pr.ts`:
```typescript
export function isNewPr(weightKg: number, priorMaxKg: number | null): boolean {
  return priorMaxKg === null || weightKg > priorMaxKg;
}
```

- [ ] **Step 8: Run to verify pass**

Run: `npx vitest run lib/pr.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 9: Write failing test for progress aggregation**

Create `lib/progress.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { aggregateSessionSeries } from "./progress";

describe("aggregateSessionSeries", () => {
  it("groups sets by session_date, taking max weight and summed volume", () => {
    const result = aggregateSessionSeries([
      { session_date: "2026-01-05", weight_kg: 100, reps: 5 },
      { session_date: "2026-01-05", weight_kg: 90, reps: 8 },
      { session_date: "2026-01-12", weight_kg: 105, reps: 5 },
    ]);
    expect(result).toEqual([
      { date: "2026-01-05", maxWeight: 100, volume: 100 * 5 + 90 * 8 },
      { date: "2026-01-12", maxWeight: 105, volume: 105 * 5 },
    ]);
  });

  it("returns dates sorted ascending regardless of input order", () => {
    const result = aggregateSessionSeries([
      { session_date: "2026-02-01", weight_kg: 50, reps: 10 },
      { session_date: "2026-01-01", weight_kg: 50, reps: 10 },
    ]);
    expect(result.map((r) => r.date)).toEqual(["2026-01-01", "2026-02-01"]);
  });

  it("returns an empty array for no sets", () => {
    expect(aggregateSessionSeries([])).toEqual([]);
  });
});
```

- [ ] **Step 10: Run to verify failure**

Run: `npx vitest run lib/progress.test.ts`
Expected: FAIL — `lib/progress.ts` does not exist.

- [ ] **Step 11: Implement progress aggregation**

Create `lib/progress.ts`:
```typescript
export type SetForAggregation = {
  session_date: string;
  weight_kg: number;
  reps: number;
};

export type SessionSeriesPoint = {
  date: string;
  maxWeight: number;
  volume: number;
};

export function aggregateSessionSeries(sets: SetForAggregation[]): SessionSeriesPoint[] {
  const byDate = new Map<string, { maxWeight: number; volume: number }>();

  for (const set of sets) {
    const existing = byDate.get(set.session_date) ?? { maxWeight: 0, volume: 0 };
    existing.maxWeight = Math.max(existing.maxWeight, set.weight_kg);
    existing.volume += set.weight_kg * set.reps;
    byDate.set(set.session_date, existing);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, agg]) => ({ date, ...agg }));
}
```

- [ ] **Step 12: Run to verify pass**

Run: `npx vitest run lib/progress.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 13: Commit**

```bash
git add lib/validation.ts lib/validation.test.ts lib/pr.ts lib/pr.test.ts lib/progress.ts lib/progress.test.ts
git commit -m "feat: add validation schemas, PR comparison, and progress aggregation logic"
```

---

## Task 4: Auth — Supabase Clients, Middleware, Login, Protected Shell

**Files:**
- Create: `lib/supabase/server.ts`, `lib/supabase/client.ts`
- Create: `lib/supabase/middleware.ts`, `lib/supabase/middleware.test.ts`
- Create: `proxy.ts` (Next.js 16 renamed the root `middleware.ts` convention to `proxy.ts`, exporting `proxy` instead of `middleware` — see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`; the request/response API is unchanged, only the file and export names)
- Create: `app/login/page.tsx`
- Create: `app/(app)/layout.tsx`, `app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `Database` type from `lib/supabase/database.types.ts` (Task 2).
- Produces:
  - `createServerSupabaseClient(): Promise<SupabaseClient<Database>>` (`lib/supabase/server.ts`) — used by every Server Component/Action from Task 5 onward.
  - `createBrowserSupabaseClient(): SupabaseClient<Database>` (`lib/supabase/client.ts`) — used by the logging page (Task 8).
  - `isProtectedRoute(pathname: string): boolean` (`lib/supabase/middleware.ts`).

- [ ] **Step 1: Write the failing test for route protection logic**

Create `lib/supabase/middleware.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { isProtectedRoute } from "./middleware";

describe("isProtectedRoute", () => {
  it("does not protect the login page", () => {
    expect(isProtectedRoute("/login")).toBe(false);
  });
  it("protects the dashboard", () => {
    expect(isProtectedRoute("/dashboard")).toBe(true);
  });
  it("protects nested routes", () => {
    expect(isProtectedRoute("/exercises/123")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/supabase/middleware.test.ts`
Expected: FAIL — `lib/supabase/middleware.ts` does not exist.

- [ ] **Step 3: Implement the Supabase clients and middleware helper**

Create `lib/supabase/server.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component render; middleware handles refresh instead.
          }
        },
      },
    }
  );
}
```

Create `lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

Create `lib/supabase/middleware.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

export function isProtectedRoute(pathname: string): boolean {
  return pathname !== "/login";
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtectedRoute(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/supabase/middleware.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire up the root proxy (Next.js 16's renamed middleware)**

Create `proxy.ts` (not `middleware.ts` — Next.js 16 deprecated that file name and renamed the export from `middleware` to `proxy`; behavior is otherwise identical):
```typescript
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

- [ ] **Step 6: Build the login page**

Create `app/login/page.tsx`:
```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createBrowserSupabaseClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Log in</h1>
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border px-3 py-2"
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 7: Build the authenticated shell and a dashboard stub**

Create `app/(app)/layout.tsx`:
```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
      <nav className="fixed bottom-0 left-0 right-0 flex justify-around border-t bg-white p-2">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/routines">Routines</Link>
        <Link href="/exercises">Exercises</Link>
        <Link href="/history">History</Link>
      </nav>
    </div>
  );
}
```

Create `app/(app)/dashboard/page.tsx` (expanded in Task 8):
```tsx
export default function DashboardPage() {
  return <h1 className="text-2xl font-semibold">Dashboard</h1>;
}
```

- [ ] **Step 8: Create the single user account locally**

Open Supabase Studio at `http://127.0.0.1:54323` → Authentication → Users → Add user. Create one user with your real email and a password. This is the only account the app will ever have (public signup is already disabled from Task 2, Step 11).

- [ ] **Step 9: Manually verify the auth flow**

Run: `npm run dev`
1. Visit `http://localhost:3000/dashboard` while logged out — expect a redirect to `/login`.
2. Log in with the account from Step 8 — expect a redirect to `/dashboard` showing "Dashboard".
3. Enter a wrong password — expect an inline error message, no redirect.

- [ ] **Step 10: Commit**

```bash
git add lib/supabase/server.ts lib/supabase/client.ts lib/supabase/middleware.ts lib/supabase/middleware.test.ts proxy.ts "app/login" "app/(app)"
git commit -m "feat: add Supabase auth clients, middleware route protection, and login flow"
```

---

## Task 5: Exercise Library

**Files:**
- Create: `lib/supabase/test-helpers.ts` (shared by this and all later integration tests)
- Create: `lib/exercises/service.ts`, `lib/exercises/service.test.ts`
- Create: `lib/actions/exercises.ts`
- Create: `app/(app)/exercises/page.tsx`, `app/(app)/exercises/AddExerciseForm.tsx`, `app/(app)/exercises/ArchiveExerciseButton.tsx`

**Interfaces:**
- Consumes: `createExerciseSchema` (Task 3), `createServerSupabaseClient` (Task 4), `Database` type (Task 2).
- Produces:
  - `listExercises(supabase, options?): Promise<Exercise[]>`, `createCustomExerciseForUser(supabase, userId, input): Promise<Exercise>`, `archiveExerciseForUser(supabase, userId, exerciseId): Promise<void>` (`lib/exercises/service.ts`) — reused directly by the dashboard/routine-editor exercise pickers in Tasks 6 and 8.
  - `createCustomExercise(input)`, `archiveExercise(exerciseId)` Server Actions (`lib/actions/exercises.ts`).
  - `createAdminClient()`, `createTestUser(admin)` (`lib/supabase/test-helpers.ts`) — reused by every integration test from here on.

- [ ] **Step 1: Add the shared test-user helper**

Create `lib/supabase/test-helpers.ts`:
```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import "dotenv/config";
import type { Database } from "./database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function createAdminClient(): SupabaseClient<Database> {
  return createClient<Database>(url, serviceKey);
}

export async function createTestUser(admin: SupabaseClient<Database>) {
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const password = "password123";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("failed to create test user");

  const client = createClient<Database>(url, anonKey);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { userId: data.user.id, client };
}
```

- [ ] **Step 2: Write the failing tests for the exercises service**

Create `lib/exercises/service.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { listExercises, createCustomExerciseForUser, archiveExerciseForUser } from "./service";
import type { Database } from "@/lib/supabase/database.types";

describe("exercises service", () => {
  const admin = createAdminClient();
  let userId: string;
  let client: SupabaseClient<Database>;

  beforeAll(async () => {
    const testUser = await createTestUser(admin);
    userId = testUser.userId;
    client = testUser.client;
  });

  it("lists preset exercises for a fresh user", async () => {
    const exercises = await listExercises(client);
    expect(exercises.some((e) => e.is_preset)).toBe(true);
  });

  it("creates a custom exercise owned by the user", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: "Cable Fly",
      muscleGroup: "Chest",
    });
    expect(exercise.user_id).toBe(userId);
    expect(exercise.is_preset).toBe(false);
  });

  it("rejects an invalid exercise name", async () => {
    await expect(createCustomExerciseForUser(client, userId, { name: "" })).rejects.toThrow();
  });

  it("archives a custom exercise so it's excluded from the default list", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, { name: "Temp Exercise" });
    await archiveExerciseForUser(client, userId, exercise.id);
    const exercises = await listExercises(client);
    expect(exercises.find((e) => e.id === exercise.id)).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run lib/exercises/service.test.ts`
Expected: FAIL — `lib/exercises/service.ts` does not exist.

- [ ] **Step 4: Implement the exercises service**

Create `lib/exercises/service.ts`:
```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createExerciseSchema } from "@/lib/validation";

export type Exercise = Database["public"]["Tables"]["exercises"]["Row"];

export async function listExercises(
  supabase: SupabaseClient<Database>,
  options: { includeArchived?: boolean } = {}
): Promise<Exercise[]> {
  let query = supabase.from("exercises").select("*").order("muscle_group").order("name");
  if (!options.includeArchived) {
    query = query.eq("is_archived", false);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCustomExerciseForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown
): Promise<Exercise> {
  const parsed = createExerciseSchema.parse(input);
  const { data, error } = await supabase
    .from("exercises")
    .insert({
      user_id: userId,
      name: parsed.name,
      muscle_group: parsed.muscleGroup ?? null,
      is_preset: false,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function archiveExerciseForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  exerciseId: string
): Promise<void> {
  const { error } = await supabase
    .from("exercises")
    .update({ is_archived: true })
    .eq("id", exerciseId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run lib/exercises/service.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Add the thin Server Action wrappers**

Create `lib/actions/exercises.ts`:
```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createCustomExerciseForUser, archiveExerciseForUser } from "@/lib/exercises/service";

export async function createCustomExercise(input: unknown) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const result = await createCustomExerciseForUser(supabase, user.id, input);
  revalidatePath("/exercises");
  return result;
}

export async function archiveExercise(exerciseId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  await archiveExerciseForUser(supabase, user.id, exerciseId);
  revalidatePath("/exercises");
}
```

- [ ] **Step 7: Build the exercise library page**

Create `app/(app)/exercises/AddExerciseForm.tsx`:
```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { createExerciseSchema } from "@/lib/validation";
import { createCustomExercise } from "@/lib/actions/exercises";

type FormValues = z.infer<typeof createExerciseSchema>;

export function AddExerciseForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<FormValues>({ resolver: zodResolver(createExerciseSchema) });

  async function onSubmit(values: FormValues) {
    await createCustomExercise(values);
    reset();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex gap-2">
      <input
        {...register("name")}
        placeholder="Exercise name"
        className="flex-1 rounded border px-3 py-2"
      />
      <input
        {...register("muscleGroup")}
        placeholder="Muscle group (optional)"
        className="w-40 rounded border px-3 py-2"
      />
      <button type="submit" disabled={isSubmitting} className="rounded bg-black px-3 py-2 text-white">
        Add
      </button>
      {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
    </form>
  );
}
```

Create `app/(app)/exercises/ArchiveExerciseButton.tsx`:
```tsx
"use client";

import { archiveExercise } from "@/lib/actions/exercises";

export function ArchiveExerciseButton({ exerciseId }: { exerciseId: string }) {
  return (
    <button onClick={() => archiveExercise(exerciseId)} className="text-sm text-gray-500 underline">
      Archive
    </button>
  );
}
```

Create `app/(app)/exercises/page.tsx`:
```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listExercises } from "@/lib/exercises/service";
import { AddExerciseForm } from "./AddExerciseForm";
import { ArchiveExerciseButton } from "./ArchiveExerciseButton";

export default async function ExercisesPage() {
  const supabase = await createServerSupabaseClient();
  const exercises = await listExercises(supabase);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Exercises</h1>
      <AddExerciseForm />
      <ul className="divide-y">
        {exercises.map((exercise) => (
          <li key={exercise.id} className="flex items-center justify-between py-2">
            <span>
              {exercise.name}
              {exercise.muscle_group && (
                <span className="ml-2 text-sm text-gray-500">{exercise.muscle_group}</span>
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

- [ ] **Step 8: Manually verify**

Run: `npm run dev`, log in, visit `/exercises`. Confirm presets are listed, adding a custom exercise appears immediately, and archiving a custom exercise removes it from the list. Confirm preset rows have no "Archive" button.

- [ ] **Step 9: Commit**

```bash
git add lib/supabase/test-helpers.ts lib/exercises "app/(app)/exercises" lib/actions/exercises.ts
git commit -m "feat: add exercise library with custom exercise creation and archiving"
```

---

## Task 6: Routines (Templates)

**Files:**
- Create: `lib/routines/service.ts`, `lib/routines/service.test.ts`
- Create: `lib/actions/routines.ts`
- Create: `app/(app)/routines/page.tsx`, `app/(app)/routines/CreateRoutineForm.tsx`, `app/(app)/routines/DeleteRoutineButton.tsx`
- Create: `app/(app)/routines/[routineId]/page.tsx`, `app/(app)/routines/[routineId]/AddExerciseToRoutine.tsx`, `app/(app)/routines/[routineId]/RoutineExerciseRow.tsx`

**Interfaces:**
- Consumes: `createRoutineSchema`, `addRoutineExerciseSchema` (Task 3), `listExercises` (Task 5), `createServerSupabaseClient` (Task 4).
- Produces: `listRoutines`, `createRoutineForUser`, `deleteRoutineForUser`, `getRoutineWithExercises`, `addExerciseToRoutineForUser`, `removeRoutineExerciseForUser`, `moveRoutineExerciseForUser` (`lib/routines/service.ts`) — `getRoutineWithExercises`'s shape (`{ routine, exercises }`, where each exercise row includes `exercise_id`, `position`, and a nested `exercise` object) is reused by `startSession` in Task 7 to snapshot a routine into a session.

- [ ] **Step 1: Write the failing tests for the routines service**

Create `lib/routines/service.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import {
  listRoutines,
  createRoutineForUser,
  deleteRoutineForUser,
  getRoutineWithExercises,
  addExerciseToRoutineForUser,
  removeRoutineExerciseForUser,
  moveRoutineExerciseForUser,
} from "./service";
import type { Database } from "@/lib/supabase/database.types";

describe("routines service", () => {
  const admin = createAdminClient();
  let userId: string;
  let client: SupabaseClient<Database>;
  let benchId: string;
  let squatId: string;

  beforeAll(async () => {
    const testUser = await createTestUser(admin);
    userId = testUser.userId;
    client = testUser.client;

    const { data: presets } = await admin.from("exercises").select("id, name").eq("is_preset", true);
    benchId = presets!.find((e) => e.name === "Bench Press")!.id;
    squatId = presets!.find((e) => e.name === "Squat")!.id;
  });

  it("creates and lists a routine", async () => {
    const routine = await createRoutineForUser(client, userId, { name: "Push Day" });
    expect(routine.user_id).toBe(userId);
    const routines = await listRoutines(client);
    expect(routines.some((r) => r.id === routine.id)).toBe(true);
  });

  it("adds exercises to a routine at sequential positions", async () => {
    const routine = await createRoutineForUser(client, userId, { name: "Full Body" });
    const first = await addExerciseToRoutineForUser(client, userId, {
      routineId: routine.id,
      exerciseId: benchId,
    });
    const second = await addExerciseToRoutineForUser(client, userId, {
      routineId: routine.id,
      exerciseId: squatId,
    });
    expect(first.position).toBe(0);
    expect(second.position).toBe(1);

    const { exercises } = await getRoutineWithExercises(client, userId, routine.id);
    expect(exercises.map((e) => e.exercise.name)).toEqual(["Bench Press", "Squat"]);
  });

  it("moves an exercise up, swapping positions with its neighbor", async () => {
    const routine = await createRoutineForUser(client, userId, { name: "Reorder Test" });
    await addExerciseToRoutineForUser(client, userId, { routineId: routine.id, exerciseId: benchId });
    const second = await addExerciseToRoutineForUser(client, userId, {
      routineId: routine.id,
      exerciseId: squatId,
    });

    await moveRoutineExerciseForUser(client, userId, second.id, "up");

    const { exercises } = await getRoutineWithExercises(client, userId, routine.id);
    expect(exercises.map((e) => e.exercise.name)).toEqual(["Squat", "Bench Press"]);
  });

  it("does nothing when moving the first exercise up", async () => {
    const routine = await createRoutineForUser(client, userId, { name: "Edge Case" });
    const first = await addExerciseToRoutineForUser(client, userId, {
      routineId: routine.id,
      exerciseId: benchId,
    });
    await moveRoutineExerciseForUser(client, userId, first.id, "up");
    const { exercises } = await getRoutineWithExercises(client, userId, routine.id);
    expect(exercises[0].id).toBe(first.id);
  });

  it("removes an exercise from a routine", async () => {
    const routine = await createRoutineForUser(client, userId, { name: "Remove Test" });
    const entry = await addExerciseToRoutineForUser(client, userId, {
      routineId: routine.id,
      exerciseId: benchId,
    });
    await removeRoutineExerciseForUser(client, userId, entry.id);
    const { exercises } = await getRoutineWithExercises(client, userId, routine.id);
    expect(exercises).toHaveLength(0);
  });

  it("deleting a routine cascades to its routine_exercises", async () => {
    const routine = await createRoutineForUser(client, userId, { name: "Delete Test" });
    await addExerciseToRoutineForUser(client, userId, { routineId: routine.id, exerciseId: benchId });
    await deleteRoutineForUser(client, userId, routine.id);
    const { data } = await admin.from("routine_exercises").select("id").eq("routine_id", routine.id);
    expect(data).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/routines/service.test.ts`
Expected: FAIL — `lib/routines/service.ts` does not exist.

- [ ] **Step 3: Implement the routines service**

Create `lib/routines/service.ts`:
```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createRoutineSchema, addRoutineExerciseSchema } from "@/lib/validation";

export type Routine = Database["public"]["Tables"]["routines"]["Row"];
export type RoutineExercise = Database["public"]["Tables"]["routine_exercises"]["Row"];
export type RoutineExerciseWithExercise = RoutineExercise & {
  exercise: { id: string; name: string; muscle_group: string | null };
};

export async function listRoutines(supabase: SupabaseClient<Database>): Promise<Routine[]> {
  const { data, error } = await supabase
    .from("routines")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createRoutineForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown
): Promise<Routine> {
  const parsed = createRoutineSchema.parse(input);
  const { data, error } = await supabase
    .from("routines")
    .insert({ user_id: userId, name: parsed.name, notes: parsed.notes ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteRoutineForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  routineId: string
): Promise<void> {
  const { error } = await supabase
    .from("routines")
    .delete()
    .eq("id", routineId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function getRoutineWithExercises(
  supabase: SupabaseClient<Database>,
  userId: string,
  routineId: string
): Promise<{ routine: Routine; exercises: RoutineExerciseWithExercise[] }> {
  const { data: routine, error: routineError } = await supabase
    .from("routines")
    .select("*")
    .eq("id", routineId)
    .eq("user_id", userId)
    .single();
  if (routineError) throw new Error(routineError.message);

  const { data: exercises, error: exercisesError } = await supabase
    .from("routine_exercises")
    .select("*, exercise:exercises(id, name, muscle_group)")
    .eq("routine_id", routineId)
    .order("position");
  if (exercisesError) throw new Error(exercisesError.message);

  return { routine, exercises: (exercises ?? []) as unknown as RoutineExerciseWithExercise[] };
}

export async function addExerciseToRoutineForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown
): Promise<RoutineExercise> {
  const parsed = addRoutineExerciseSchema.omit({ position: true }).parse(input);

  const { count, error: countError } = await supabase
    .from("routine_exercises")
    .select("id", { count: "exact", head: true })
    .eq("routine_id", parsed.routineId);
  if (countError) throw new Error(countError.message);

  const { data, error } = await supabase
    .from("routine_exercises")
    .insert({
      routine_id: parsed.routineId,
      user_id: userId,
      exercise_id: parsed.exerciseId,
      position: count ?? 0,
      target_sets: parsed.targetSets ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function removeRoutineExerciseForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  routineExerciseId: string
): Promise<void> {
  const { error } = await supabase
    .from("routine_exercises")
    .delete()
    .eq("id", routineExerciseId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function moveRoutineExerciseForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  routineExerciseId: string,
  direction: "up" | "down"
): Promise<void> {
  const { data: current, error: currentError } = await supabase
    .from("routine_exercises")
    .select("id, routine_id, position")
    .eq("id", routineExerciseId)
    .eq("user_id", userId)
    .single();
  if (currentError) throw new Error(currentError.message);

  const targetPosition = direction === "up" ? current.position - 1 : current.position + 1;

  const { data: neighbor, error: neighborError } = await supabase
    .from("routine_exercises")
    .select("id, position")
    .eq("routine_id", current.routine_id)
    .eq("position", targetPosition)
    .maybeSingle();
  if (neighborError) throw new Error(neighborError.message);
  if (!neighbor) return;

  const { error: e1 } = await supabase
    .from("routine_exercises")
    .update({ position: -1 })
    .eq("id", current.id);
  if (e1) throw new Error(e1.message);

  const { error: e2 } = await supabase
    .from("routine_exercises")
    .update({ position: current.position })
    .eq("id", neighbor.id);
  if (e2) throw new Error(e2.message);

  const { error: e3 } = await supabase
    .from("routine_exercises")
    .update({ position: targetPosition })
    .eq("id", current.id);
  if (e3) throw new Error(e3.message);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/routines/service.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Add the thin Server Action wrappers**

Create `lib/actions/routines.ts`:
```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createRoutineForUser,
  deleteRoutineForUser,
  addExerciseToRoutineForUser,
  removeRoutineExerciseForUser,
  moveRoutineExerciseForUser,
} from "@/lib/routines/service";

async function currentUserId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function createRoutine(input: unknown) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  const routine = await createRoutineForUser(supabase, userId, input);
  revalidatePath("/routines");
  return routine;
}

export async function deleteRoutine(routineId: string) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  await deleteRoutineForUser(supabase, userId, routineId);
  revalidatePath("/routines");
}

export async function addExerciseToRoutine(input: unknown) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  const parsed = input as { routineId: string };
  const result = await addExerciseToRoutineForUser(supabase, userId, input);
  revalidatePath(`/routines/${parsed.routineId}`);
  return result;
}

export async function removeRoutineExercise(routineExerciseId: string, routineId: string) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  await removeRoutineExerciseForUser(supabase, userId, routineExerciseId);
  revalidatePath(`/routines/${routineId}`);
}

export async function moveRoutineExercise(
  routineExerciseId: string,
  routineId: string,
  direction: "up" | "down"
) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  await moveRoutineExerciseForUser(supabase, userId, routineExerciseId, direction);
  revalidatePath(`/routines/${routineId}`);
}
```

- [ ] **Step 6: Build the routines list page**

Create `app/(app)/routines/CreateRoutineForm.tsx`:
```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { createRoutineSchema } from "@/lib/validation";
import { createRoutine } from "@/lib/actions/routines";

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
        className="flex-1 rounded border px-3 py-2"
      />
      <button type="submit" disabled={isSubmitting} className="rounded bg-black px-3 py-2 text-white">
        Create
      </button>
    </form>
  );
}
```

Create `app/(app)/routines/DeleteRoutineButton.tsx`:
```tsx
"use client";

import { deleteRoutine } from "@/lib/actions/routines";

export function DeleteRoutineButton({ routineId }: { routineId: string }) {
  return (
    <button onClick={() => deleteRoutine(routineId)} className="text-sm text-gray-500 underline">
      Delete
    </button>
  );
}
```

Create `app/(app)/routines/page.tsx`:
```tsx
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listRoutines } from "@/lib/routines/service";
import { CreateRoutineForm } from "./CreateRoutineForm";
import { DeleteRoutineButton } from "./DeleteRoutineButton";

export default async function RoutinesPage() {
  const supabase = await createServerSupabaseClient();
  const routines = await listRoutines(supabase);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Routines</h1>
      <CreateRoutineForm />
      <ul className="divide-y">
        {routines.map((routine) => (
          <li key={routine.id} className="flex items-center justify-between py-2">
            <Link href={`/routines/${routine.id}`} className="underline">
              {routine.name}
            </Link>
            <DeleteRoutineButton routineId={routine.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 7: Build the routine editor page**

Create `app/(app)/routines/[routineId]/RoutineExerciseRow.tsx`:
```tsx
"use client";

import { removeRoutineExercise, moveRoutineExercise } from "@/lib/actions/routines";

export function RoutineExerciseRow({
  routineId,
  routineExerciseId,
  name,
}: {
  routineId: string;
  routineExerciseId: string;
  name: string;
}) {
  return (
    <li className="flex items-center justify-between py-2">
      <span>{name}</span>
      <div className="flex gap-2 text-sm">
        <button onClick={() => moveRoutineExercise(routineExerciseId, routineId, "up")}>↑</button>
        <button onClick={() => moveRoutineExercise(routineExerciseId, routineId, "down")}>↓</button>
        <button
          onClick={() => removeRoutineExercise(routineExerciseId, routineId)}
          className="text-gray-500 underline"
        >
          Remove
        </button>
      </div>
    </li>
  );
}
```

Create `app/(app)/routines/[routineId]/AddExerciseToRoutine.tsx`:
```tsx
"use client";

import { useState } from "react";
import { addExerciseToRoutine } from "@/lib/actions/routines";

export function AddExerciseToRoutine({
  routineId,
  availableExercises,
}: {
  routineId: string;
  availableExercises: { id: string; name: string }[];
}) {
  const [exerciseId, setExerciseId] = useState(availableExercises[0]?.id ?? "");

  async function handleAdd() {
    if (!exerciseId) return;
    await addExerciseToRoutine({ routineId, exerciseId });
  }

  return (
    <div className="flex gap-2">
      <select
        value={exerciseId}
        onChange={(e) => setExerciseId(e.target.value)}
        className="flex-1 rounded border px-3 py-2"
      >
        {availableExercises.map((exercise) => (
          <option key={exercise.id} value={exercise.id}>
            {exercise.name}
          </option>
        ))}
      </select>
      <button onClick={handleAdd} className="rounded bg-black px-3 py-2 text-white">
        Add
      </button>
    </div>
  );
}
```

Create `app/(app)/routines/[routineId]/page.tsx`:
```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRoutineWithExercises } from "@/lib/routines/service";
import { listExercises } from "@/lib/exercises/service";
import { RoutineExerciseRow } from "./RoutineExerciseRow";
import { AddExerciseToRoutine } from "./AddExerciseToRoutine";

export default async function RoutineEditorPage({
  params,
}: {
  params: Promise<{ routineId: string }>;
}) {
  const { routineId } = await params;
  const supabase = await createServerSupabaseClient();
  const [{ routine, exercises }, allExercises] = await Promise.all([
    getRoutineWithExercises(supabase, (await supabase.auth.getUser()).data.user!.id, routineId),
    listExercises(supabase),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{routine.name}</h1>
      <ul className="divide-y">
        {exercises.map((entry) => (
          <RoutineExerciseRow
            key={entry.id}
            routineId={routineId}
            routineExerciseId={entry.id}
            name={entry.exercise.name}
          />
        ))}
      </ul>
      <AddExerciseToRoutine routineId={routineId} availableExercises={allExercises} />
    </div>
  );
}
```

- [ ] **Step 8: Manually verify**

Run: `npm run dev`, log in, create a routine, open its editor, add two exercises, reorder them with ↑/↓, remove one, then delete the routine from the list page and confirm it disappears.

- [ ] **Step 9: Commit**

```bash
git add lib/routines "app/(app)/routines" lib/actions/routines.ts
git commit -m "feat: add routine templates with exercise add/reorder/remove"
```

---

## Task 7: Workout Sessions and Set Logging (PR Detection Core)

**Files:**
- Create: `lib/sessions/service.ts`, `lib/sessions/service.test.ts`
- Create: `lib/actions/sessions.ts`

**Interfaces:**
- Consumes: `startSessionSchema`, `logSetSchema` (Task 3), `isNewPr` (Task 3), `getRoutineWithExercises` (Task 6), `createCustomExerciseForUser` (Task 5, tests only).
- Produces: `startSessionForUser`, `addExerciseToSessionForUser`, `getPriorMaxWeight`, `logSetForUser` (returns `{ set, isPr }`), `deleteSetForUser`, `finishSessionForUser`, `discardSessionForUser` (`lib/sessions/service.ts`) — the logging page (Task 8) and progress/history pages (Task 9) both read from the `sets`/`sessions` tables this task writes.

This is the core PR-detection logic from the spec: **a set is a PR when its weight exceeds the live `MAX(weight_kg)` of all non-warmup sets ever logged for that exercise**, recomputed on every insert — never cached.

- [ ] **Step 1: Write the failing tests for the sessions service**

Create `lib/sessions/service.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { createRoutineForUser, addExerciseToRoutineForUser } from "@/lib/routines/service";
import { createCustomExerciseForUser } from "@/lib/exercises/service";
import {
  startSessionForUser,
  addExerciseToSessionForUser,
  logSetForUser,
  deleteSetForUser,
  finishSessionForUser,
  discardSessionForUser,
} from "./service";
import type { Database } from "@/lib/supabase/database.types";

function uniqueExerciseName(label: string) {
  return `${label} ${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe("sessions service", () => {
  const admin = createAdminClient();
  let userId: string;
  let client: SupabaseClient<Database>;
  let benchId: string;
  let squatId: string;

  beforeAll(async () => {
    const testUser = await createTestUser(admin);
    userId = testUser.userId;
    client = testUser.client;

    const { data: presets } = await admin.from("exercises").select("id, name").eq("is_preset", true);
    benchId = presets!.find((e) => e.name === "Bench Press")!.id;
    squatId = presets!.find((e) => e.name === "Squat")!.id;
  });

  it("snapshots a routine's exercises into the new session, preserving order", async () => {
    const routine = await createRoutineForUser(client, userId, { name: "Snapshot Test" });
    await addExerciseToRoutineForUser(client, userId, { routineId: routine.id, exerciseId: benchId });
    await addExerciseToRoutineForUser(client, userId, { routineId: routine.id, exerciseId: squatId });

    const session = await startSessionForUser(client, userId, {
      routineId: routine.id,
      sessionDate: "2026-01-05",
    });

    const { data: sessionExercises } = await client
      .from("session_exercises")
      .select("exercise_id, position")
      .eq("session_id", session.id)
      .order("position");

    expect(sessionExercises).toEqual([
      { exercise_id: benchId, position: 0 },
      { exercise_id: squatId, position: 1 },
    ]);
  });

  it("starts a freeform session with no exercises, and allows adding one ad hoc", async () => {
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-06" });
    const sessionExercise = await addExerciseToSessionForUser(client, userId, session.id, benchId);
    expect(sessionExercise.position).toBe(0);
  });

  it("marks the first logged set for a fresh exercise as a PR", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: uniqueExerciseName("First Set Exercise"),
    });
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-07" });
    const sessionExercise = await addExerciseToSessionForUser(client, userId, session.id, exercise.id);

    const { isPr, set } = await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 100,
      reps: 5,
      isWarmup: false,
    });

    expect(isPr).toBe(true);
    expect(set.set_number).toBe(1);
  });

  it("does not mark a lighter set as a PR, and increments set_number within the exercise", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: uniqueExerciseName("Lighter Set Exercise"),
    });
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-08" });
    const sessionExercise = await addExerciseToSessionForUser(client, userId, session.id, exercise.id);

    await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 110,
      reps: 5,
      isWarmup: false,
    });
    const { isPr, set } = await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 90,
      reps: 5,
      isWarmup: false,
    });

    expect(isPr).toBe(false);
    expect(set.set_number).toBe(2);
  });

  it("never counts a warmup set as a PR, nor toward future PR comparisons", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: uniqueExerciseName("Warmup Exercise"),
    });
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-09" });
    const sessionExercise = await addExerciseToSessionForUser(client, userId, session.id, exercise.id);

    const warmup = await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 500,
      reps: 5,
      isWarmup: true,
    });
    expect(warmup.isPr).toBe(false);

    const working = await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 150,
      reps: 5,
      isWarmup: false,
    });
    expect(working.isPr).toBe(true); // the 500kg warmup must not suppress this
  });

  it("recomputes PR live after a correction, with no stale cache", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: uniqueExerciseName("Correction Exercise"),
    });
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-10" });
    const sessionExercise = await addExerciseToSessionForUser(client, userId, session.id, exercise.id);

    const first = await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 120,
      reps: 5,
      isWarmup: false,
    });
    expect(first.isPr).toBe(true);

    await deleteSetForUser(client, userId, first.set.id);

    const after = await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 95,
      reps: 5,
      isWarmup: false,
    });
    expect(after.isPr).toBe(true); // the 120kg set was deleted, so this exercise has no prior history left
  });

  it("finishes a session by setting completed_at", async () => {
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-11" });
    await finishSessionForUser(client, userId, session.id);
    const { data } = await client
      .from("sessions")
      .select("completed_at")
      .eq("id", session.id)
      .single();
    expect(data!.completed_at).not.toBeNull();
  });

  it("discarding a session cascades to remove its sets", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: uniqueExerciseName("Discard Exercise"),
    });
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-12" });
    const sessionExercise = await addExerciseToSessionForUser(client, userId, session.id, exercise.id);
    await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 80,
      reps: 5,
      isWarmup: false,
    });

    await discardSessionForUser(client, userId, session.id);

    const { data } = await admin
      .from("sets")
      .select("id")
      .eq("session_exercise_id", sessionExercise.id);
    expect(data).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/sessions/service.test.ts`
Expected: FAIL — `lib/sessions/service.ts` does not exist.

- [ ] **Step 3: Implement the sessions service**

Create `lib/sessions/service.ts`:
```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { startSessionSchema, logSetSchema } from "@/lib/validation";
import { isNewPr } from "@/lib/pr";
import { getRoutineWithExercises } from "@/lib/routines/service";

export type Session = Database["public"]["Tables"]["sessions"]["Row"];
export type SessionExercise = Database["public"]["Tables"]["session_exercises"]["Row"];
export type SetRow = Database["public"]["Tables"]["sets"]["Row"];

export async function startSessionForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown
): Promise<Session> {
  const parsed = startSessionSchema.parse(input);

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      user_id: userId,
      routine_id: parsed.routineId ?? null,
      name: parsed.name ?? null,
      session_date: parsed.sessionDate,
    })
    .select()
    .single();
  if (sessionError) throw new Error(sessionError.message);

  if (parsed.routineId) {
    const { exercises } = await getRoutineWithExercises(supabase, userId, parsed.routineId);
    if (exercises.length > 0) {
      const { error: insertError } = await supabase.from("session_exercises").insert(
        exercises.map((entry) => ({
          session_id: session.id,
          user_id: userId,
          exercise_id: entry.exercise_id,
          position: entry.position,
        }))
      );
      if (insertError) throw new Error(insertError.message);
    }
  }

  return session;
}

export async function addExerciseToSessionForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
  exerciseId: string
): Promise<SessionExercise> {
  const { count, error: countError } = await supabase
    .from("session_exercises")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (countError) throw new Error(countError.message);

  const { data, error } = await supabase
    .from("session_exercises")
    .insert({ session_id: sessionId, user_id: userId, exercise_id: exerciseId, position: count ?? 0 })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getPriorMaxWeight(
  supabase: SupabaseClient<Database>,
  userId: string,
  exerciseId: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from("exercise_prs")
    .select("pr_weight_kg")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? Number(data.pr_weight_kg) : null;
}

export async function logSetForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown
): Promise<{ set: SetRow; isPr: boolean }> {
  const parsed = logSetSchema.parse(input);

  const { data: sessionExercise, error: seError } = await supabase
    .from("session_exercises")
    .select("exercise_id")
    .eq("id", parsed.sessionExerciseId)
    .eq("user_id", userId)
    .single();
  if (seError) throw new Error(seError.message);
  const exerciseId = sessionExercise.exercise_id;

  const priorMax = parsed.isWarmup ? null : await getPriorMaxWeight(supabase, userId, exerciseId);

  const { count, error: countError } = await supabase
    .from("sets")
    .select("id", { count: "exact", head: true })
    .eq("session_exercise_id", parsed.sessionExerciseId);
  if (countError) throw new Error(countError.message);

  const { data: set, error } = await supabase
    .from("sets")
    .insert({
      session_exercise_id: parsed.sessionExerciseId,
      user_id: userId,
      exercise_id: exerciseId,
      set_number: (count ?? 0) + 1,
      weight_kg: parsed.weightKg,
      reps: parsed.reps,
      is_warmup: parsed.isWarmup,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const isPr = !parsed.isWarmup && isNewPr(parsed.weightKg, priorMax);
  return { set, isPr };
}

export async function deleteSetForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  setId: string
): Promise<void> {
  const { error } = await supabase.from("sets").delete().eq("id", setId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function finishSessionForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string
): Promise<void> {
  const { error } = await supabase
    .from("sessions")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function discardSessionForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string
): Promise<void> {
  const { error } = await supabase.from("sessions").delete().eq("id", sessionId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/sessions/service.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Add the thin Server Action wrappers**

Create `lib/actions/sessions.ts`:
```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  startSessionForUser,
  addExerciseToSessionForUser,
  logSetForUser,
  deleteSetForUser,
  finishSessionForUser,
  discardSessionForUser,
} from "@/lib/sessions/service";

async function currentUserId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function startSession(input: unknown) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  const session = await startSessionForUser(supabase, userId, input);
  revalidatePath("/dashboard");
  return session;
}

export async function addExerciseToSession(sessionId: string, exerciseId: string) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  return addExerciseToSessionForUser(supabase, userId, sessionId, exerciseId);
}

export async function logSet(input: unknown) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  return logSetForUser(supabase, userId, input);
}

export async function deleteSet(setId: string) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  await deleteSetForUser(supabase, userId, setId);
}

export async function finishSession(sessionId: string) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  await finishSessionForUser(supabase, userId, sessionId);
  revalidatePath("/dashboard");
  revalidatePath("/history");
}

export async function discardSession(sessionId: string) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  await discardSessionForUser(supabase, userId, sessionId);
  revalidatePath("/dashboard");
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/sessions lib/actions/sessions.ts
git commit -m "feat: add session start/log-set/finish services with live PR detection"
```

---

## Task 8: Dashboard and Active Logging Screen

**Files:**
- Create: `lib/dashboard/service.ts`, `lib/dashboard/service.test.ts`
- Modify: `app/(app)/dashboard/page.tsx` (replace the Task 4 stub)
- Create: `app/(app)/dashboard/DiscardSessionButton.tsx`
- Create: `app/(app)/log/page.tsx`, `app/(app)/log/StartSessionButtons.tsx`
- Create: `app/(app)/log/[sessionId]/page.tsx`, `app/(app)/log/[sessionId]/QueryProvider.tsx`, `app/(app)/log/[sessionId]/LoggingClient.tsx`

**Interfaces:**
- Consumes: `getLocalDateString` (Task 1), `startSession`/`logSet`/`finishSession`/`discardSession` actions (Task 7), `listRoutines` (Task 6).
- Produces: `listInProgressSessions(supabase)`, `listPrsFromLastCompletedSession(supabase, userId)` (`lib/dashboard/service.ts`).

- [ ] **Step 1: Write the failing tests for the dashboard service**

Create `lib/dashboard/service.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { createCustomExerciseForUser } from "@/lib/exercises/service";
import {
  startSessionForUser,
  addExerciseToSessionForUser,
  logSetForUser,
  finishSessionForUser,
} from "@/lib/sessions/service";
import { listInProgressSessions, listPrsFromLastCompletedSession } from "./service";
import type { Database } from "@/lib/supabase/database.types";

describe("dashboard service", () => {
  const admin = createAdminClient();
  let userId: string;
  let client: SupabaseClient<Database>;

  beforeAll(async () => {
    const testUser = await createTestUser(admin);
    userId = testUser.userId;
    client = testUser.client;
  });

  it("lists sessions that have not been finished", async () => {
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-05" });
    const inProgress = await listInProgressSessions(client);
    expect(inProgress.some((s) => s.id === session.id)).toBe(true);
  });

  it("excludes finished sessions from the in-progress list", async () => {
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-06" });
    await finishSessionForUser(client, userId, session.id);
    const inProgress = await listInProgressSessions(client);
    expect(inProgress.some((s) => s.id === session.id)).toBe(false);
  });

  it("surfaces PRs set during the most recently finished session", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: `Dashboard PR Exercise ${Date.now()}`,
    });
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-07" });
    const sessionExercise = await addExerciseToSessionForUser(client, userId, session.id, exercise.id);
    await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 100,
      reps: 5,
      isWarmup: false,
    });
    await finishSessionForUser(client, userId, session.id);

    const prs = await listPrsFromLastCompletedSession(client, userId);
    expect(prs).toContainEqual({ exerciseName: exercise.name, weightKg: 100 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/dashboard/service.test.ts`
Expected: FAIL — `lib/dashboard/service.ts` does not exist.

- [ ] **Step 3: Implement the dashboard service**

Create `lib/dashboard/service.ts`:
```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type InProgressSession = Database["public"]["Tables"]["sessions"]["Row"];
export type SessionPr = { exerciseName: string; weightKg: number };

export async function listInProgressSessions(
  supabase: SupabaseClient<Database>
): Promise<InProgressSession[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .is("completed_at", null)
    .order("started_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listPrsFromLastCompletedSession(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<SessionPr[]> {
  const { data: lastSession, error: sessionError } = await supabase
    .from("sessions")
    .select("id")
    .eq("user_id", userId)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!lastSession) return [];

  const { data: sets, error: setsError } = await supabase
    .from("sets")
    .select("weight_kg, exercise_id, exercises(name), session_exercises!inner(session_id)")
    .eq("session_exercises.session_id", lastSession.id)
    .eq("is_warmup", false);
  if (setsError) throw new Error(setsError.message);

  const { data: prs, error: prsError } = await supabase
    .from("exercise_prs")
    .select("exercise_id, pr_weight_kg")
    .eq("user_id", userId);
  if (prsError) throw new Error(prsError.message);

  const prByExercise = new Map((prs ?? []).map((p) => [p.exercise_id, Number(p.pr_weight_kg)]));
  const seen = new Set<string>();
  const results: SessionPr[] = [];

  for (const set of (sets ?? []) as unknown as {
    weight_kg: number;
    exercise_id: string;
    exercises: { name: string };
  }[]) {
    const prWeight = prByExercise.get(set.exercise_id);
    if (prWeight !== undefined && Number(set.weight_kg) === prWeight && !seen.has(set.exercise_id)) {
      seen.add(set.exercise_id);
      results.push({ exerciseName: set.exercises.name, weightKg: prWeight });
    }
  }

  return results;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/dashboard/service.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Build the routine chooser (start-workout) page**

Create `app/(app)/log/StartSessionButtons.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { getLocalDateString } from "@/lib/date";
import { startSession } from "@/lib/actions/sessions";

export function StartSessionButtons({ routines }: { routines: { id: string; name: string }[] }) {
  const router = useRouter();

  async function handleStart(routineId?: string) {
    const session = await startSession({ routineId, sessionDate: getLocalDateString() });
    router.push(`/log/${session.id}`);
  }

  return (
    <div className="space-y-2">
      {routines.map((routine) => (
        <button
          key={routine.id}
          onClick={() => handleStart(routine.id)}
          className="block w-full rounded border px-4 py-3 text-left"
        >
          {routine.name}
        </button>
      ))}
      <button
        onClick={() => handleStart(undefined)}
        className="block w-full rounded border border-dashed px-4 py-3 text-left"
      >
        Freeform Workout
      </button>
    </div>
  );
}
```

Create `app/(app)/log/page.tsx`:
```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listRoutines } from "@/lib/routines/service";
import { StartSessionButtons } from "./StartSessionButtons";

export default async function LogPage() {
  const supabase = await createServerSupabaseClient();
  const routines = await listRoutines(supabase);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Start a Workout</h1>
      <StartSessionButtons routines={routines.map((r) => ({ id: r.id, name: r.name }))} />
    </div>
  );
}
```

- [ ] **Step 6: Build the active logging screen**

Create `app/(app)/log/[sessionId]/QueryProvider.tsx`:
```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

Create `app/(app)/log/[sessionId]/LoggingClient.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { logSet, finishSession, discardSession } from "@/lib/actions/sessions";

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

export function LoggingClient({
  sessionId,
  sessionName,
  initialExercises,
}: {
  sessionId: string;
  sessionName: string;
  initialExercises: ExerciseEntry[];
}) {
  const router = useRouter();
  const [exercises, setExercises] = useState(initialExercises);
  const [prBanner, setPrBanner] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, SetFormInput>>({});

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
      {prBanner && <div className="rounded bg-yellow-100 p-3 text-yellow-800">{prBanner}</div>}
      {logSetMutation.isError && (
        <div className="rounded bg-red-100 p-3 text-red-800">
          Failed to save that set — check your connection and try again.
        </div>
      )}
      {exercises.map((exercise) => {
        const input = inputs[exercise.sessionExerciseId] ?? { weight: "", reps: "", warmup: false };
        return (
          <div key={exercise.sessionExerciseId} className="rounded border p-4">
            <h2 className="font-medium">{exercise.exerciseName}</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {exercise.sets.map((set) => (
                <li key={set.id} className={set.pending ? "opacity-50" : ""}>
                  Set {set.set_number}: {set.weight_kg}kg × {set.reps}
                  {set.is_warmup ? " (warmup)" : ""}
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
                className="w-20 rounded border px-2 py-1"
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
                className="w-20 rounded border px-2 py-1"
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
              <button
                onClick={() => handleAddSet(exercise.sessionExerciseId)}
                className="rounded bg-black px-3 py-1 text-white"
              >
                Add Set
              </button>
            </div>
          </div>
        );
      })}
      <div className="flex gap-2">
        <button onClick={handleFinish} className="rounded bg-green-600 px-4 py-2 text-white">
          Finish Workout
        </button>
        <button onClick={handleDiscard} className="rounded bg-gray-300 px-4 py-2">
          Discard
        </button>
      </div>
    </div>
  );
}
```

Create `app/(app)/log/[sessionId]/page.tsx`:
```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { QueryProvider } from "./QueryProvider";
import { LoggingClient } from "./LoggingClient";

export default async function LogSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: session } = await supabase.from("sessions").select("*").eq("id", sessionId).single();
  const { data: sessionExercises } = await supabase
    .from("session_exercises")
    .select("*, exercise:exercises(id, name), sets(*)")
    .eq("session_id", sessionId)
    .order("position");

  const exercises = (sessionExercises ?? []).map((se) => ({
    sessionExerciseId: se.id,
    exerciseId: se.exercise_id,
    exerciseName: (se as unknown as { exercise: { name: string } }).exercise.name,
    sets: ((se as unknown as { sets: { set_number: number }[] }).sets ?? []).sort(
      (a, b) => a.set_number - b.set_number
    ),
  }));

  return (
    <QueryProvider>
      <LoggingClient
        sessionId={sessionId}
        sessionName={session?.name ?? "Workout"}
        initialExercises={exercises as never}
      />
    </QueryProvider>
  );
}
```

- [ ] **Step 7: Rebuild the dashboard page**

Create `app/(app)/dashboard/DiscardSessionButton.tsx`:
```tsx
"use client";

import { discardSession } from "@/lib/actions/sessions";

export function DiscardSessionButton({ sessionId }: { sessionId: string }) {
  return (
    <button onClick={() => discardSession(sessionId)} className="text-sm text-gray-500 underline">
      Discard
    </button>
  );
}
```

Replace `app/(app)/dashboard/page.tsx`:
```tsx
import Link from "next/link";
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
      <Link href="/log" className="block rounded bg-black px-4 py-3 text-center text-white">
        Start a Workout
      </Link>

      {inProgress.length > 0 && (
        <section>
          <h2 className="font-medium">In Progress</h2>
          <ul className="divide-y">
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
          <h2 className="font-medium">PRs from your last workout</h2>
          <ul className="space-y-1">
            {recentPrs.map((pr) => (
              <li key={pr.exerciseName} className="rounded bg-yellow-50 px-3 py-2">
                🏆 {pr.exerciseName}: {pr.weightKg}kg
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Manually verify end-to-end**

Run: `npm run dev`, log in. From the dashboard, start a routine (or Freeform), log several sets including one that exceeds your all-time weight for that exercise (expect the yellow "New PR" banner), mark one set as a warmup, finish the workout, and confirm the dashboard now shows "PRs from your last workout". Then start another session and discard it, confirming it disappears from "In Progress".

- [ ] **Step 9: Commit**

```bash
git add lib/dashboard "app/(app)/dashboard" "app/(app)/log"
git commit -m "feat: add dashboard with in-progress/PR summaries and the active logging screen"
```

---

## Task 9: Progress Charts and Workout History

**Files:**
- Create: `lib/exercises/progress.ts`, `lib/exercises/progress.test.ts`
- Create: `lib/sessions/history.ts`, `lib/sessions/history.test.ts`
- Modify: `app/(app)/exercises/page.tsx` (link each exercise name to its progress page)
- Create: `app/(app)/exercises/[exerciseId]/page.tsx`, `app/(app)/exercises/[exerciseId]/ProgressChart.tsx`
- Create: `app/(app)/history/page.tsx`, `app/(app)/history/[sessionId]/page.tsx`

**Interfaces:**
- Consumes: `aggregateSessionSeries` (Task 3), `createServerSupabaseClient` (Task 4).
- Produces: `getExerciseHistory(supabase, exerciseId)`, `getExercisePr(supabase, userId, exerciseId)` (`lib/exercises/progress.ts`); `listCompletedSessions(supabase)`, `getSessionDetail(supabase, sessionId)` (`lib/sessions/history.ts`).

- [ ] **Step 1: Write the failing tests for exercise progress data**

Create `lib/exercises/progress.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { createCustomExerciseForUser } from "@/lib/exercises/service";
import { startSessionForUser, addExerciseToSessionForUser, logSetForUser } from "@/lib/sessions/service";
import { getExerciseHistory, getExercisePr } from "./progress";
import type { Database } from "@/lib/supabase/database.types";

describe("exercise progress", () => {
  const admin = createAdminClient();
  let userId: string;
  let client: SupabaseClient<Database>;

  beforeAll(async () => {
    const testUser = await createTestUser(admin);
    userId = testUser.userId;
    client = testUser.client;
  });

  it("returns history sorted by when it was logged, with each set's session date", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: `Progress Exercise ${Date.now()}`,
    });
    const sessionA = await startSessionForUser(client, userId, { sessionDate: "2026-01-01" });
    const seA = await addExerciseToSessionForUser(client, userId, sessionA.id, exercise.id);
    await logSetForUser(client, userId, {
      sessionExerciseId: seA.id,
      weightKg: 100,
      reps: 5,
      isWarmup: false,
    });

    const sessionB = await startSessionForUser(client, userId, { sessionDate: "2026-01-08" });
    const seB = await addExerciseToSessionForUser(client, userId, sessionB.id, exercise.id);
    await logSetForUser(client, userId, {
      sessionExerciseId: seB.id,
      weightKg: 110,
      reps: 5,
      isWarmup: false,
    });

    const history = await getExerciseHistory(client, exercise.id);
    expect(history.map((s) => ({ date: s.session_date, weight: s.weight_kg }))).toEqual([
      { date: "2026-01-01", weight: 100 },
      { date: "2026-01-08", weight: 110 },
    ]);

    const pr = await getExercisePr(client, userId, exercise.id);
    expect(pr).toBe(110);
  });

  it("returns null PR for an exercise with no logged sets", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: `Untouched Exercise ${Date.now()}`,
    });
    const pr = await getExercisePr(client, userId, exercise.id);
    expect(pr).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/exercises/progress.test.ts`
Expected: FAIL — `lib/exercises/progress.ts` does not exist.

- [ ] **Step 3: Implement exercise progress queries**

Create `lib/exercises/progress.ts`:
```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type ExerciseHistorySet = {
  id: string;
  session_date: string;
  weight_kg: number;
  reps: number;
  is_warmup: boolean;
};

export async function getExerciseHistory(
  supabase: SupabaseClient<Database>,
  exerciseId: string
): Promise<ExerciseHistorySet[]> {
  const { data, error } = await supabase
    .from("sets")
    .select(
      "id, weight_kg, reps, is_warmup, created_at, session_exercises!inner(sessions!inner(session_date))"
    )
    .eq("exercise_id", exerciseId)
    .order("created_at");
  if (error) throw new Error(error.message);

  return (
    data as unknown as {
      id: string;
      weight_kg: number;
      reps: number;
      is_warmup: boolean;
      session_exercises: { sessions: { session_date: string } };
    }[]
  ).map((row) => ({
    id: row.id,
    weight_kg: Number(row.weight_kg),
    reps: row.reps,
    is_warmup: row.is_warmup,
    session_date: row.session_exercises.sessions.session_date,
  }));
}

export async function getExercisePr(
  supabase: SupabaseClient<Database>,
  userId: string,
  exerciseId: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from("exercise_prs")
    .select("pr_weight_kg")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? Number(data.pr_weight_kg) : null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/exercises/progress.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing tests for session history**

Create `lib/sessions/history.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { createCustomExerciseForUser } from "@/lib/exercises/service";
import {
  startSessionForUser,
  addExerciseToSessionForUser,
  logSetForUser,
  finishSessionForUser,
} from "@/lib/sessions/service";
import { listCompletedSessions, getSessionDetail } from "./history";
import type { Database } from "@/lib/supabase/database.types";

describe("session history", () => {
  const admin = createAdminClient();
  let userId: string;
  let client: SupabaseClient<Database>;

  beforeAll(async () => {
    const testUser = await createTestUser(admin);
    userId = testUser.userId;
    client = testUser.client;
  });

  it("lists only completed sessions, most recent session_date first", async () => {
    const older = await startSessionForUser(client, userId, { sessionDate: "2026-01-01" });
    await finishSessionForUser(client, userId, older.id);
    const newer = await startSessionForUser(client, userId, { sessionDate: "2026-01-10" });
    await finishSessionForUser(client, userId, newer.id);
    const unfinished = await startSessionForUser(client, userId, { sessionDate: "2026-01-15" });

    const sessions = await listCompletedSessions(client);
    const ids = sessions.map((s) => s.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
    expect(ids).not.toContain(unfinished.id);
  });

  it("returns full exercise/set detail for a session", async () => {
    const exercise = await createCustomExerciseForUser(client, userId, {
      name: `History Exercise ${Date.now()}`,
    });
    const session = await startSessionForUser(client, userId, { sessionDate: "2026-01-20" });
    const sessionExercise = await addExerciseToSessionForUser(client, userId, session.id, exercise.id);
    await logSetForUser(client, userId, {
      sessionExerciseId: sessionExercise.id,
      weightKg: 60,
      reps: 10,
      isWarmup: false,
    });

    const detail = await getSessionDetail(client, session.id);
    expect(detail.session.id).toBe(session.id);
    expect(detail.exercises).toEqual([
      {
        exerciseName: exercise.name,
        sets: [{ weight_kg: 60, reps: 10, is_warmup: false, set_number: 1 }],
      },
    ]);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run lib/sessions/history.test.ts`
Expected: FAIL — `lib/sessions/history.ts` does not exist.

- [ ] **Step 7: Implement session history queries**

Create `lib/sessions/history.ts`:
```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type CompletedSession = Database["public"]["Tables"]["sessions"]["Row"];

export type SessionDetail = {
  session: CompletedSession;
  exercises: {
    exerciseName: string;
    sets: { weight_kg: number; reps: number; is_warmup: boolean; set_number: number }[];
  }[];
};

export async function listCompletedSessions(
  supabase: SupabaseClient<Database>
): Promise<CompletedSession[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .not("completed_at", "is", null)
    .order("session_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSessionDetail(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<SessionDetail> {
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (sessionError) throw new Error(sessionError.message);

  const { data: sessionExercises, error: exercisesError } = await supabase
    .from("session_exercises")
    .select("position, exercise:exercises(name), sets(weight_kg, reps, is_warmup, set_number)")
    .eq("session_id", sessionId)
    .order("position");
  if (exercisesError) throw new Error(exercisesError.message);

  const exercises = (
    sessionExercises as unknown as {
      exercise: { name: string };
      sets: { weight_kg: number; reps: number; is_warmup: boolean; set_number: number }[];
    }[]
  ).map((se) => ({
    exerciseName: se.exercise.name,
    sets: [...se.sets].sort((a, b) => a.set_number - b.set_number),
  }));

  return { session, exercises };
}
```

- [ ] **Step 8: Run to verify pass**

Run: `npx vitest run lib/sessions/history.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Build the exercise progress page**

Create `app/(app)/exercises/[exerciseId]/ProgressChart.tsx`:
```tsx
"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

export function ProgressChart({ data }: { data: { date: string; maxWeight: number; volume: number }[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="maxWeight" stroke="#000000" name="Max Weight (kg)" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

Create `app/(app)/exercises/[exerciseId]/page.tsx`:
```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getExerciseHistory, getExercisePr } from "@/lib/exercises/progress";
import { aggregateSessionSeries } from "@/lib/progress";
import { ProgressChart } from "./ProgressChart";

export default async function ExerciseProgressPage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: exercise } = await supabase
    .from("exercises")
    .select("name")
    .eq("id", exerciseId)
    .single();
  const history = await getExerciseHistory(supabase, exerciseId);
  const pr = await getExercisePr(supabase, user!.id, exerciseId);
  const series = aggregateSessionSeries(history.filter((s) => !s.is_warmup));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{exercise?.name}</h1>
      {pr !== null && <div className="rounded bg-yellow-100 p-3 text-yellow-800">🏆 PR: {pr}kg</div>}
      <ProgressChart data={series} />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th>Date</th>
            <th>Weight</th>
            <th>Reps</th>
          </tr>
        </thead>
        <tbody>
          {history
            .slice()
            .reverse()
            .map((set) => (
              <tr key={set.id} className={set.weight_kg === pr && !set.is_warmup ? "font-semibold" : ""}>
                <td>{set.session_date}</td>
                <td>
                  {set.weight_kg}kg{set.is_warmup ? " (warmup)" : ""}
                </td>
                <td>{set.reps}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
```

Modify `app/(app)/exercises/page.tsx` — wrap each exercise's name in a link to its progress page:
```tsx
import Link from "next/link";
```
Change the `<span>{exercise.name}...</span>` block to:
```tsx
<Link href={`/exercises/${exercise.id}`} className="underline">
  {exercise.name}
</Link>
{exercise.muscle_group && (
  <span className="ml-2 text-sm text-gray-500">{exercise.muscle_group}</span>
)}
```

- [ ] **Step 10: Build the history pages**

Create `app/(app)/history/page.tsx`:
```tsx
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listCompletedSessions } from "@/lib/sessions/history";

export default async function HistoryPage() {
  const supabase = await createServerSupabaseClient();
  const sessions = await listCompletedSessions(supabase);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">History</h1>
      <ul className="divide-y">
        {sessions.map((session) => (
          <li key={session.id} className="py-2">
            <Link href={`/history/${session.id}`} className="underline">
              {session.name ?? "Workout"} — {session.session_date}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Create `app/(app)/history/[sessionId]/page.tsx`:
```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionDetail } from "@/lib/sessions/history";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createServerSupabaseClient();
  const { session, exercises } = await getSessionDetail(supabase, sessionId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{session.name ?? "Workout"}</h1>
      <p className="text-sm text-gray-500">{session.session_date}</p>
      {exercises.map((exercise, i) => (
        <div key={i} className="rounded border p-4">
          <h2 className="font-medium">{exercise.exerciseName}</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {exercise.sets.map((set, j) => (
              <li key={j}>
                Set {set.set_number}: {set.weight_kg}kg × {set.reps}
                {set.is_warmup ? " (warmup)" : ""}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 11: Manually verify**

Run: `npm run dev`. From the exercises library, click into an exercise you've logged sets for — confirm the chart renders, the PR badge shows the right number, and the PR row is bolded in the history table. Visit `/history`, confirm completed sessions are listed newest-first, and click into one to see its full exercise/set breakdown.

- [ ] **Step 12: Commit**

```bash
git add lib/exercises/progress.ts lib/exercises/progress.test.ts lib/sessions/history.ts lib/sessions/history.test.ts "app/(app)/exercises" "app/(app)/history"
git commit -m "feat: add per-exercise progress charts and workout history pages"
```

---

## Task 10: Deploy to Production

**Files:**
- Create: `README.md`

This task has no automated tests — it's environment setup against real hosted services (Supabase, Vercel) that can't run in CI. Each step's "test" is the manual check described.

- [ ] **Step 1: Create the hosted Supabase project**

Via the Supabase dashboard (supabase.com), create a new project. Note its project ref, database password, API URL, and anon key.

- [ ] **Step 2: Disable public signup on the hosted project**

In the hosted project's dashboard: Authentication → Settings → disable "Allow new users to sign up". This mirrors the local `enable_signup = false` setting from Task 2.

- [ ] **Step 3: Link and push the schema**

Run:
```bash
supabase link --project-ref <your-project-ref>
supabase db push
```
This applies `supabase/migrations/0001_init.sql` (and re-running is safe/idempotent for future migrations added later). Then, in the hosted SQL Editor, run the contents of `supabase/seed.sql` once to seed the preset exercises (the CLI does not auto-run `seed.sql` against a linked remote project).

- [ ] **Step 4: Create the one production user account**

In the hosted dashboard: Authentication → Users → Add user. Use your real email and a strong password — this is the only account that will ever exist for this app.

- [ ] **Step 5: Deploy to Vercel**

Run:
```bash
npx vercel link
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel --prod
```
When prompted, paste the hosted project's URL and anon key (not the local Docker ones, and never the service role key — that stays out of the deployed app entirely since no server code uses it at runtime).

- [ ] **Step 6: Manually verify production**

Visit the deployed URL. Repeat the walkthrough from Task 8, Step 8 (start a workout, log sets, see a PR banner, finish, check the dashboard) against the live hosted database, on both a phone browser and a desktop browser.

- [ ] **Step 7: Write the README**

Create `README.md`:
```markdown
# Weight Training Tracker

A personal weight-training log: routines, per-set weight/reps tracking, progressive-overload charts, and all-time PRs. Built with Next.js 16.3, Supabase (Postgres + Auth), and Tailwind CSS.

## Local Development

1. Install the Supabase CLI: `brew install supabase/tap/supabase`
2. Start the local stack: `supabase start` (requires Docker running)
3. Copy `.env.local.example` to `.env.local` and fill in the URL/keys printed by `supabase start`
4. Install dependencies: `npm install`
5. Run the app: `npm run dev`
6. Run tests: `npm test` (the integration tests require `supabase start` to be running)

## Deployment

Schema changes are written as migrations in `supabase/migrations/` and pushed to the hosted project with `supabase db push` — see `docs/superpowers/plans/2026-08-09-workout-tracker-implementation.md`, Task 10, for the full one-time setup.

## Notes

- This is a single-user app. Public signup is disabled on both the local and hosted Supabase projects; there is exactly one account.
- The hosted Supabase free-tier project auto-pauses after ~7 days with no API activity. If the app stops responding, resume it from the Supabase dashboard.
- All weights are stored and displayed in kilograms.
```

- [ ] **Step 8: Commit**

```bash
git add README.md
git commit -m "docs: add README with local dev and deployment instructions"
```

---

## Self-Review

**Spec coverage:**
- Multi-device sync via hosted Supabase + Vercel — Task 10.
- Weight (kg) + reps per set — `logSetSchema` (Task 3), `sets` table (Task 2).
- PR = max weight ever, live-computed, no 1RM — `exercise_prs` view (Task 2), `isNewPr`/`logSetForUser` (Tasks 3, 7), verified explicitly by the "recomputes PR live after a correction" test (Task 7).
- Preset + custom exercises — seed data (Task 2), `createCustomExerciseForUser`/archiving (Task 5).
- Routines/templates + freeform sessions — Task 6 (routines), Task 7 (`startSessionForUser` snapshot logic covers both).
- Progress page (chart + history table + PR badge) — Task 9.
- Single-user auth, no public signup — Task 4 (middleware/login), Task 2/10 (signup disabled locally and hosted).
- Local dev (Docker) vs. hosted production, shared schema — Task 2 (local), Task 10 (`supabase link` + `db push`).
- Every edge case in the spec (timezone, ordering, exercise deletion/archiving, warmup exclusion, numeric precision, in-progress sessions, auto-pause) has a corresponding implementation detail or test called out above.
- Every explicit non-goal (1RM, lbs toggle, social, nutrition, rest timer, offline sync, periodization, multi-user) has no task building it.

**Placeholder scan:** no TBD/TODO markers; every step has runnable code or an exact command.

**Type consistency:** `Exercise`, `Routine`, `RoutineExercise`, `Session`, `SessionExercise`, `SetRow` types are each defined once (in their owning service file) and imported everywhere they're reused (e.g., `RoutineExerciseWithExercise` from Task 6 is consumed as-is by `startSessionForUser` in Task 7; `isNewPr` from Task 3 is used with the same `(weightKg, priorMaxKg)` signature in Task 7's `logSetForUser`).

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-09-workout-tracker-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
