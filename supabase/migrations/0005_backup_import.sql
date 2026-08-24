-- Atomic backup import.
--
-- `import_backup(payload, mode)` restores a JSON backup produced by the app's
-- Export button (see lib/backup/service.ts). Because the whole thing is one
-- function body, it executes in a single transaction: any failure rolls the
-- entire import back, so a half-applied "replace" can never wipe the caller's
-- data and leave nothing in its place.
--
-- SECURITY DEFINER (like referral_count): a backup carries the *source
-- account's* row ids, which are globally unique but, under the caller's RLS,
-- invisible. An RLS-scoped "does this id already exist?" check would answer
-- "no" for another account's id and then collide on the global primary-key
-- index at insert time. Running as the definer lets the function see global id
-- existence and mint a fresh id whenever a file id is already taken by anyone,
-- while every row it writes is still stamped `user_id = v_uid` and every read
-- of the caller's data is filtered by `user_id = v_uid` — so it never widens
-- access to other users' rows (it returns only integer counts). search_path is
-- pinned per SECURITY DEFINER best practice.
--
-- Two modes:
--   'replace' — delete ALL of the caller's rows first, then insert the backup.
--   'merge'   — insert only rows the caller doesn't already own (by id), so
--               re-importing the same file is a no-op (idempotent).
--
-- Identity handling per row: if the caller already owns a row with the file id
-- → reuse it and skip (merge idempotency); else if that id is free globally →
-- keep it (clean round-trip); else (owned by another account) → mint a fresh
-- id. Exercises additionally match by name first (the caller's own custom
-- exercise wins over a global preset) so imports never duplicate an exercise;
-- all child rows are rewritten to the resolved exercise / session-exercise id.
create or replace function public.import_backup(payload jsonb, mode text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_data jsonb := coalesce(payload->'data', '{}'::jsonb);
  v_ex int; v_rt int; v_re int; v_ss int; v_se int; v_st int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if payload->>'format' is distinct from 'workout-tracker-backup' then
    raise exception 'Unrecognized backup format';
  end if;
  if coalesce((payload->>'version')::int, 0) <> 1 then
    raise exception 'Unsupported backup version';
  end if;
  if mode not in ('merge', 'replace') then
    raise exception 'Invalid import mode: %', mode;
  end if;

  -- Replace: wipe the caller's data in FK-safe order. Presets (user_id IS NULL)
  -- are global and never touched.
  if mode = 'replace' then
    delete from public.sets where user_id = v_uid;
    delete from public.session_exercises where user_id = v_uid;
    delete from public.sessions where user_id = v_uid;
    delete from public.routine_exercises where user_id = v_uid;
    delete from public.routines where user_id = v_uid;
    delete from public.exercises where user_id = v_uid;
  end if;

  -- ===== Exercises: resolve each file id to a target id (+ whether to insert) =====
  create temporary table tmp_ex (
    file_id uuid primary key, name text not null, muscle_group text,
    is_archived boolean not null, created_at timestamptz not null,
    target_id uuid, do_insert boolean
  ) on commit drop;

  insert into tmp_ex (file_id, name, muscle_group, is_archived, created_at)
  select x.id, x.name, x.muscle_group, coalesce(x.is_archived, false), coalesce(x.created_at, now())
  from jsonb_to_recordset(coalesce(v_data->'exercises', '[]'::jsonb))
    as x(id uuid, name text, muscle_group text, is_archived boolean, created_at timestamptz);

  -- 1) Match by name to the caller's own custom exercise (preferred) or a preset.
  --    `where true` satisfies pg_safeupdate (WHERE-less writes are rejected).
  update tmp_ex t
  set target_id = (
        select e.id from public.exercises e
        where lower(e.name) = lower(t.name)
          and (e.user_id = v_uid or e.user_id is null)
        order by (e.user_id = v_uid) desc
        limit 1),
      do_insert = false
  where true;

  -- 2) Unmatched: reuse the caller's own row with this id, else keep a free id,
  --    else mint a fresh one; insert only when it isn't already the caller's.
  update tmp_ex t
  set target_id = case
        when exists (select 1 from public.exercises e where e.id = t.file_id and e.user_id = v_uid) then t.file_id
        when exists (select 1 from public.exercises e where e.id = t.file_id) then gen_random_uuid()
        else t.file_id end,
      do_insert = not exists (select 1 from public.exercises e where e.id = t.file_id and e.user_id = v_uid)
  where target_id is null;

  with ins as (
    insert into public.exercises (id, user_id, name, muscle_group, is_preset, is_archived, created_at)
    select target_id, v_uid, name, muscle_group, false, is_archived, created_at
    from tmp_ex where do_insert
    returning 1)
  select count(*)::int into v_ex from ins;

  -- ===== Routines =====
  create temporary table tmp_rt (
    file_id uuid primary key, name text not null, notes text,
    created_at timestamptz not null, updated_at timestamptz not null,
    target_id uuid, do_insert boolean
  ) on commit drop;

  insert into tmp_rt (file_id, name, notes, created_at, updated_at)
  select r.id, r.name, r.notes, coalesce(r.created_at, now()), coalesce(r.updated_at, now())
  from jsonb_to_recordset(coalesce(v_data->'routines', '[]'::jsonb))
    as r(id uuid, name text, notes text, created_at timestamptz, updated_at timestamptz);

  update tmp_rt t
  set target_id = case
        when exists (select 1 from public.routines x where x.id = t.file_id and x.user_id = v_uid) then t.file_id
        when exists (select 1 from public.routines x where x.id = t.file_id) then gen_random_uuid()
        else t.file_id end,
      do_insert = not exists (select 1 from public.routines x where x.id = t.file_id and x.user_id = v_uid)
  where true;

  with ins as (
    insert into public.routines (id, user_id, name, notes, created_at, updated_at)
    select target_id, v_uid, name, notes, created_at, updated_at
    from tmp_rt where do_insert
    returning 1)
  select count(*)::int into v_rt from ins;

  -- Routine exercises: only for routines we just inserted; remap ids.
  with ins as (
    insert into public.routine_exercises (id, routine_id, user_id, exercise_id, position, target_sets)
    select case when exists (select 1 from public.routine_exercises x where x.id = re.id)
                then gen_random_uuid() else re.id end,
           trt.target_id, v_uid, tex.target_id, re.position, re.target_sets
    from jsonb_to_recordset(coalesce(v_data->'routine_exercises', '[]'::jsonb))
      as re(id uuid, routine_id uuid, exercise_id uuid, position int, target_sets int)
    join tmp_rt trt on trt.file_id = re.routine_id and trt.do_insert
    join tmp_ex tex on tex.file_id = re.exercise_id
    returning 1)
  select count(*)::int into v_re from ins;

  -- ===== Sessions =====
  create temporary table tmp_ss (
    file_id uuid primary key, routine_file_id uuid, name text, session_date date,
    started_at timestamptz not null, completed_at timestamptz, notes text,
    target_id uuid, do_insert boolean
  ) on commit drop;

  insert into tmp_ss (file_id, routine_file_id, name, session_date, started_at, completed_at, notes)
  select s.id, s.routine_id, s.name, s.session_date,
         coalesce(s.started_at, now()), s.completed_at, s.notes
  from jsonb_to_recordset(coalesce(v_data->'sessions', '[]'::jsonb))
    as s(id uuid, routine_id uuid, name text, session_date date,
         started_at timestamptz, completed_at timestamptz, notes text);

  update tmp_ss t
  set target_id = case
        when exists (select 1 from public.sessions x where x.id = t.file_id and x.user_id = v_uid) then t.file_id
        when exists (select 1 from public.sessions x where x.id = t.file_id) then gen_random_uuid()
        else t.file_id end,
      do_insert = not exists (select 1 from public.sessions x where x.id = t.file_id and x.user_id = v_uid)
  where true;

  with ins as (
    insert into public.sessions (id, user_id, routine_id, name, session_date, started_at, completed_at, notes)
    select t.target_id, v_uid,
           coalesce(
             (select trt.target_id from tmp_rt trt where trt.file_id = t.routine_file_id),
             (select r.id from public.routines r where r.id = t.routine_file_id and r.user_id = v_uid)),
           t.name, t.session_date, t.started_at, t.completed_at, t.notes
    from tmp_ss t where t.do_insert
    returning 1)
  select count(*)::int into v_ss from ins;

  -- ===== Session exercises =====
  create temporary table tmp_se (
    file_id uuid primary key, session_file_id uuid, exercise_file_id uuid,
    position int, notes text, target_id uuid, do_insert boolean
  ) on commit drop;

  insert into tmp_se (file_id, session_file_id, exercise_file_id, position, notes)
  select se.id, se.session_id, se.exercise_id, se.position, se.notes
  from jsonb_to_recordset(coalesce(v_data->'session_exercises', '[]'::jsonb))
    as se(id uuid, session_id uuid, exercise_id uuid, position int, notes text);

  -- Insert only children of sessions we just inserted; give the row a free id.
  update tmp_se t
  set do_insert = exists (select 1 from tmp_ss ss where ss.file_id = t.session_file_id and ss.do_insert),
      target_id = case when exists (select 1 from public.session_exercises x where x.id = t.file_id)
                       then gen_random_uuid() else t.file_id end
  where true;

  with ins as (
    insert into public.session_exercises (id, session_id, user_id, exercise_id, position, notes)
    select t.target_id, tss.target_id, v_uid, tex.target_id, t.position, t.notes
    from tmp_se t
    join tmp_ss tss on tss.file_id = t.session_file_id
    join tmp_ex tex on tex.file_id = t.exercise_file_id
    where t.do_insert
    returning 1)
  select count(*)::int into v_se from ins;

  -- ===== Sets: only for session_exercises we just inserted; remap ids. =====
  with ins as (
    insert into public.sets (id, session_exercise_id, user_id, exercise_id, set_number, weight_kg, reps, is_warmup, created_at)
    select case when exists (select 1 from public.sets x where x.id = st.id)
                then gen_random_uuid() else st.id end,
           tse.target_id, v_uid, tex.target_id,
           st.set_number, st.weight_kg, st.reps, coalesce(st.is_warmup, false),
           coalesce(st.created_at, now())
    from jsonb_to_recordset(coalesce(v_data->'sets', '[]'::jsonb))
      as st(id uuid, session_exercise_id uuid, exercise_id uuid, set_number int,
            weight_kg numeric, reps int, is_warmup boolean, created_at timestamptz)
    join tmp_se tse on tse.file_id = st.session_exercise_id and tse.do_insert
    join tmp_ex tex on tex.file_id = st.exercise_id
    returning 1)
  select count(*)::int into v_st from ins;

  return jsonb_build_object(
    'exercises', v_ex, 'routines', v_rt, 'routine_exercises', v_re,
    'sessions', v_ss, 'session_exercises', v_se, 'sets', v_st
  );
end;
$$;

-- Only logged-in users import their own data. The definer scopes every write to
-- auth.uid(); anon and service_role have no business calling this.
revoke all on function public.import_backup(jsonb, text) from public;
grant execute on function public.import_backup(jsonb, text) to authenticated;
