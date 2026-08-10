-- Multi-user support: usernames for login + invite-gated signup.
-- The data tables are already per-user via RLS (user_id = auth.uid()); this migration
-- only adds the auth/onboarding layer.

-- profiles: one row per auth user. `username` is the login handle (case-insensitive
-- uniqueness is enforced by always storing it lowercased + a plain unique constraint;
-- the app lowercases usernames before insert/lookup — see lib/validation.ts).
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
-- A user may read/update only their own profile; usernames are otherwise private
-- (no cross-user select), which also prevents username enumeration by logged-in users.
-- INSERTs happen only via the service role in the signup action (bypasses RLS), so
-- there is intentionally no insert policy for the `authenticated` role.
create policy profiles_select_own on public.profiles for select
  using (id = auth.uid());
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- invite_codes: single-use signup gate. Only the service role (signup action) ever
-- touches this table. RLS is enabled with NO policies, which denies all access to the
-- `authenticated`/`anon` roles; `service_role` bypasses RLS by design.
create table public.invite_codes (
  code text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz
);
alter table public.invite_codes enable row level security;

-- New public-schema relations are not auto-exposed to the Data API roles (see 0001's
-- note), so grant explicitly. profiles is reachable by `authenticated` (RLS-scoped to
-- own row) and `service_role`; invite_codes only by `service_role`.
grant select, insert, update, delete on public.profiles to authenticated, service_role;
grant select, insert, update, delete on public.invite_codes to service_role;

-- Backfill a profile for every existing auth user so they can log in by username.
-- Username is derived from the email local-part, sanitized to [a-z0-9_] and lowercased;
-- within-batch collisions get a short id suffix to keep the unique constraint happy.
insert into public.profiles (id, username)
select id,
       case when rn = 1 then base else base || '_' || substr(id::text, 1, 4) end
from (
  select u.id,
         u.created_at,
         base,
         row_number() over (partition by base order by u.created_at, u.id) as rn
  from (
    select id,
           created_at,
           coalesce(
             nullif(
               lower(regexp_replace(coalesce(split_part(email, '@', 1), 'user'), '[^a-z0-9_]', '_', 'g')),
               ''
             ),
             'user'
           ) as base
    from auth.users
  ) u
  where not exists (select 1 from public.profiles p where p.id = u.id)
) ranked;
