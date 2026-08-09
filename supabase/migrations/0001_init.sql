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
-- `security_invoker = true` is required: without it, a view evaluates RLS as
-- the view's OWNER (the migration-running `postgres` superuser, which bypasses
-- RLS entirely), not as the querying role, so every caller would see every
-- user's PRs. With it, the view runs the underlying `sets` query as the
-- querying role, so the `sets_all` policy (`user_id = auth.uid()`) applies.
create view public.exercise_prs
  with (security_invoker = true) as
  select user_id, exercise_id, max(weight_kg) as pr_weight_kg
  from public.sets
  where not is_warmup
  group by user_id, exercise_id;

-- Grant Data API roles access to the tables/view above. Newer Supabase projects
-- (local and hosted) no longer auto-expose new public-schema relations to
-- anon/authenticated/service_role (see `auto_expose_new_tables` in config.toml),
-- so PostgREST returns "permission denied" without these explicit grants.
-- Only `authenticated` and `service_role` are granted: every feature in this
-- app requires a logged-in user (see the design spec / task brief), so the
-- unauthenticated `anon` role has no legitimate use for any table or view
-- here and is granted nothing. Row Level Security policies above (and, for
-- exercise_prs, `security_invoker` on the view) govern per-row access for the
-- `authenticated` role; `service_role` bypasses RLS by design.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
