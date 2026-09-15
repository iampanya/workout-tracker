-- Pre-flight check for the GoTrue -> Auth.js cutover (migration 0010).
-- READ-ONLY: every statement is a SELECT — safe to run against production.
--
-- Run against the prod DIRECT connection (NOT pooled), from the repo root:
--   psql "$DIRECT_URL" -f scripts/preflight-authjs-cutover.sql
--
-- Read each section's "EXPECT" note. If any "MUST FIX" check is non-empty/non-zero,
-- resolve it BEFORE running `supabase db push` — otherwise 0010 may fail or users may
-- fail to re-link their data. See docs/adr/0001-* and docs/DEPLOY.md (section E).

\pset pager off
\echo '================================================================'
\echo ' A. Migrations already applied on prod (Supabase tracking table)'
\echo '    EXPECT: 0001..0009 present, 0010 ABSENT.'
\echo '    (You can also run:  supabase migration list --linked )'
\echo '================================================================'
select version
from supabase_migrations.schema_migrations
order by version;

\echo ''
\echo '================================================================'
\echo ' B. Confirm 0010 has NOT run yet (Auth.js tables must not exist)'
\echo '    EXPECT: both NULL.  MUST FIX if either is non-null (0010 already applied).'
\echo '================================================================'
select to_regclass('public.users')    as public_users_table,
       to_regclass('public.accounts') as public_accounts_table;

\echo ''
\echo '================================================================'
\echo ' C. User counts (this is what 0010 will copy into public.users)'
\echo '================================================================'
select
  (select count(*) from auth.users)                          as gotrue_users_total,
  (select count(*) from auth.users where deleted_at is not null) as soft_deleted,
  (select count(*) from auth.users where email is null)      as null_email_users; -- see D

\echo ''
\echo '================================================================'
\echo ' D. Email health — the key that lets migrated users re-link via Google'
\echo '================================================================'
\echo '-- D1. NULL emails: cannot auto-link (would become empty new accounts).'
\echo '--     EXPECT: 0 rows.'
select id, created_at
from auth.users
where email is null;

\echo ''
\echo '-- D2. EXACT duplicate emails: MUST FIX — public.users.email is UNIQUE, so 0010''s'
\echo '--     backfill INSERT will FAIL on a collision. EXPECT: 0 rows.'
select email, count(*) as n
from auth.users
where email is not null
group by email
having count(*) > 1
order by n desc;

\echo ''
\echo '-- D3. Case-insensitive duplicate emails: Google normalizes to lowercase, so only one'
\echo '--     of a differing-case pair will re-link; the other is orphaned. EXPECT: 0 rows.'
select lower(email) as email_lower, count(*) as n, array_agg(email) as variants
from auth.users
where email is not null
group by lower(email)
having count(*) > 1
order by n desc;

\echo ''
\echo '================================================================'
\echo ' E. Auth provider mix — accounts NOT from Google may not match a Google email'
\echo '    EXPECT: mostly / all "google". Note any others.'
\echo '================================================================'
select provider, count(*) as n
from auth.identities
group by provider
order by n desc;

\echo ''
\echo '-- E1. Users whose email has NO Google identity (they signed up another way).'
\echo '--     They will only re-link if their Google email equals this email. EXPECT: 0 rows (ideally).'
select u.id, u.email
from auth.users u
where not exists (
  select 1 from auth.identities i
  where i.user_id = u.id and i.provider = 'google'
)
order by u.email;

\echo ''
\echo '================================================================'
\echo ' F. App-data BEFORE snapshot — record these, re-check after cutover'
\echo '================================================================'
select 'profiles'          as table_name, count(*) from public.profiles
union all select 'exercises (user-owned)', count(*) from public.exercises where user_id is not null
union all select 'routines',          count(*) from public.routines
union all select 'routine_exercises',  count(*) from public.routine_exercises
union all select 'sessions',           count(*) from public.sessions
union all select 'session_exercises',  count(*) from public.session_exercises
union all select 'sets',               count(*) from public.sets;

\echo ''
\echo '================================================================'
\echo ' G. FK integrity — app rows pointing at a user_id not in auth.users'
\echo '    MUST FIX if any is > 0 (0010 repoints FKs and would surface these).'
\echo '================================================================'
select 'profiles'          as table_name, count(*) as orphans
  from public.profiles p          left join auth.users u on u.id = p.id           where u.id is null
union all
select 'exercises',         count(*)
  from public.exercises e         left join auth.users u on u.id = e.user_id      where e.user_id is not null and u.id is null
union all
select 'routines',          count(*)
  from public.routines r          left join auth.users u on u.id = r.user_id      where u.id is null
union all
select 'routine_exercises', count(*)
  from public.routine_exercises x left join auth.users u on u.id = x.user_id      where u.id is null
union all
select 'sessions',          count(*)
  from public.sessions s          left join auth.users u on u.id = s.user_id      where u.id is null
union all
select 'session_exercises', count(*)
  from public.session_exercises x left join auth.users u on u.id = x.user_id      where u.id is null
union all
select 'sets',              count(*)
  from public.sets t              left join auth.users u on u.id = t.user_id      where u.id is null;

\echo ''
\echo '================================================================'
\echo ' Pre-flight complete. Green light when:'
\echo '   B = both NULL, D2 = 0 rows, G = all orphans 0.'
\echo '   Review D1/D3/E/E1 for users who may not auto-re-link (email mismatch).'
\echo '================================================================'
