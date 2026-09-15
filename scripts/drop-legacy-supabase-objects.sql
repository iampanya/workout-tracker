-- Optional cleanup (runbook Step 5a): drop the dead Supabase-only objects left on
-- PRODUCTION so its schema matches prisma/migrations/0001_init exactly.
--
-- These are INERT today: RLS was disabled in migration 0010, and referral_count() /
-- the 2-arg import_backup() are unused (the app calls import_backup(jsonb,text,uuid)
-- and counts referrals with a plain count()). Dropping them removes the only structural
-- drift between prod and the Prisma baseline and prevents a stale RLS policy from ever
-- blocking a future ALTER TABLE.
--
-- Run ONCE against production, AFTER the baseline (migrate resolve) is confirmed:
--   psql "$PROD_DIRECT_URL" -f scripts/drop-legacy-supabase-objects.sql
-- Idempotent (IF EXISTS) and wrapped in a transaction. No effect on local (these
-- objects don't exist in workout_tracker_dev). Does NOT touch any table data.

begin;

-- RLS policies (RLS already disabled; policies are dead objects)
drop policy if exists exercises_select        on public.exercises;
drop policy if exists exercises_insert        on public.exercises;
drop policy if exists exercises_update        on public.exercises;
drop policy if exists exercises_delete        on public.exercises;
drop policy if exists profiles_select_own     on public.profiles;
drop policy if exists profiles_update_own     on public.profiles;
drop policy if exists routines_all            on public.routines;
drop policy if exists routine_exercises_all   on public.routine_exercises;
drop policy if exists sessions_all            on public.sessions;
drop policy if exists session_exercises_all   on public.session_exercises;
drop policy if exists sets_all                on public.sets;

-- Unused functions that still reference auth.uid()
drop function if exists public.referral_count();
drop function if exists public.import_backup(jsonb, text);   -- old 2-arg overload; keep the 3-arg one

commit;
