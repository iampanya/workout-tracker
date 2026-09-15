-- Squashed baseline for vanilla Postgres (Prisma Migrate).
-- Generated from the post-0010 public schema of the legacy Supabase-hosted DB,
-- with RLS policies, referral_count(), and the auth.uid()-based import_backup(jsonb,text)
-- overload removed (see supabase/migrations/ for the historical, Supabase-coupled chain).

--
-- PostgreSQL database dump
--


-- check_function_bodies is off because functions are created before the tables
-- they reference; every object below is schema-qualified (public.*), so no
-- search_path is set (setting it empty would hide Prisma's _prisma_migrations table).
SET check_function_bodies = false;

--
-- Name: gen_referral_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gen_referral_code() RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..8 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  base text;
  candidate text;
  suffix int := 0;
  new_code text;
begin
  -- If a profile already exists for this id (e.g. an OAuth identity linked to an existing
  -- account), do nothing — keep the user's current username/referral_code.
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  -- Derive a username from the email local-part, sanitized to [a-z0-9_] and lowercased
  -- (same rule as the 0003 backfill). Fall back to 'user' when there's no usable email.
  base := coalesce(
    nullif(lower(regexp_replace(coalesce(split_part(new.email, '@', 1), 'user'), '[^a-z0-9_]', '_', 'g')), ''),
    'user'
  );
  candidate := base;
  -- Resolve username collisions by appending a widening slice of the uuid.
  while exists (select 1 from public.profiles where username = candidate) loop
    suffix := suffix + 1;
    candidate := base || '_' || substr(replace(new.id::text, '-', ''), 1, 3 + suffix);
  end loop;

  -- Insert with a generated referral_code, retrying on the rare unique collision.
  loop
    new_code := public.gen_referral_code();
    begin
      insert into public.profiles (id, username, referral_code)
      values (new.id, candidate, new_code);
      return new;
    exception when unique_violation then
      -- Another transaction may have provisioned this profile concurrently.
      if exists (select 1 from public.profiles where id = new.id) then
        return new;
      end if;
      -- A username or referral_code raced us: widen the username and try a fresh code.
      suffix := suffix + 1;
      candidate := base || '_' || substr(replace(new.id::text, '-', ''), 1, 3 + suffix);
    end;
  end loop;
end;
$$;


--
-- Name: import_backup(jsonb, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.import_backup(payload jsonb, mode text, p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_uid uuid := p_user_id;
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

  if mode = 'replace' then
    delete from public.sets where user_id = v_uid;
    delete from public.session_exercises where user_id = v_uid;
    delete from public.sessions where user_id = v_uid;
    delete from public.routine_exercises where user_id = v_uid;
    delete from public.routines where user_id = v_uid;
    delete from public.exercises where user_id = v_uid;
  end if;

  create temporary table tmp_ex (
    file_id uuid primary key, name text not null, muscle_group text,
    is_archived boolean not null, created_at timestamptz not null,
    target_id uuid, do_insert boolean
  ) on commit drop;

  insert into tmp_ex (file_id, name, muscle_group, is_archived, created_at)
  select x.id, x.name, x.muscle_group, coalesce(x.is_archived, false), coalesce(x.created_at, now())
  from jsonb_to_recordset(coalesce(v_data->'exercises', '[]'::jsonb))
    as x(id uuid, name text, muscle_group text, is_archived boolean, created_at timestamptz);

  update tmp_ex t
  set target_id = (
        select e.id from public.exercises e
        where lower(e.name) = lower(t.name)
          and (e.user_id = v_uid or e.user_id is null)
        order by (e.user_id = v_uid) desc
        limit 1),
      do_insert = false
  where true;

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

  create temporary table tmp_se (
    file_id uuid primary key, session_file_id uuid, exercise_file_id uuid,
    position int, notes text, target_id uuid, do_insert boolean
  ) on commit drop;

  insert into tmp_se (file_id, session_file_id, exercise_file_id, position, notes)
  select se.id, se.session_id, se.exercise_id, se.position, se.notes
  from jsonb_to_recordset(coalesce(v_data->'session_exercises', '[]'::jsonb))
    as se(id uuid, session_id uuid, exercise_id uuid, position int, notes text);

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


--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "userId" uuid NOT NULL,
    type text NOT NULL,
    provider text NOT NULL,
    "providerAccountId" text NOT NULL,
    refresh_token text,
    access_token text,
    expires_at integer,
    token_type text,
    scope text,
    id_token text,
    session_state text
);


--
-- Name: sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_exercise_id uuid NOT NULL,
    user_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    set_number integer NOT NULL,
    weight_kg numeric(6,2) NOT NULL,
    reps integer NOT NULL,
    is_warmup boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: exercise_prs; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.exercise_prs WITH (security_invoker='true') AS
 SELECT user_id,
    exercise_id,
    max(weight_kg) AS pr_weight_kg
   FROM public.sets
  WHERE (NOT is_warmup)
  GROUP BY user_id, exercise_id;


--
-- Name: exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    name text NOT NULL,
    muscle_group text,
    is_preset boolean DEFAULT false NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exercises_muscle_group_check CHECK ((muscle_group = ANY (ARRAY['Chest'::text, 'Back'::text, 'Legs'::text, 'Shoulders'::text, 'Arms'::text, 'Core'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    username text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    referral_code text NOT NULL,
    referred_by uuid
);


--
-- Name: routine_exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routine_exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    routine_id uuid NOT NULL,
    user_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    "position" integer NOT NULL,
    target_sets integer
);


--
-- Name: routines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: session_exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    user_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    "position" integer NOT NULL,
    notes text
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    routine_id uuid,
    name text,
    session_date date NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    notes text
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    email text,
    "emailVerified" timestamp with time zone,
    image text
);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_provider_providerAccountId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT "accounts_provider_providerAccountId_key" UNIQUE (provider, "providerAccountId");


--
-- Name: exercises exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: routine_exercises routine_exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_exercises
    ADD CONSTRAINT routine_exercises_pkey PRIMARY KEY (id);


--
-- Name: routine_exercises routine_exercises_routine_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_exercises
    ADD CONSTRAINT routine_exercises_routine_id_position_key UNIQUE (routine_id, "position");


--
-- Name: routines routines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routines
    ADD CONSTRAINT routines_pkey PRIMARY KEY (id);


--
-- Name: session_exercises session_exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_exercises
    ADD CONSTRAINT session_exercises_pkey PRIMARY KEY (id);


--
-- Name: session_exercises session_exercises_session_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_exercises
    ADD CONSTRAINT session_exercises_session_id_position_key UNIQUE (session_id, "position");


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sets sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sets
    ADD CONSTRAINT sets_pkey PRIMARY KEY (id);


--
-- Name: sets sets_session_exercise_id_set_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sets
    ADD CONSTRAINT sets_session_exercise_id_set_number_key UNIQUE (session_exercise_id, set_number);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: accounts_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accounts_user_id_idx ON public.accounts USING btree ("userId");


--
-- Name: exercises_user_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX exercises_user_name_key ON public.exercises USING btree (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));


--
-- Name: profiles_referral_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_referral_code_key ON public.profiles USING btree (referral_code);


--
-- Name: sets_user_exercise_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sets_user_exercise_idx ON public.sets USING btree (user_id, exercise_id, is_warmup);


--
-- Name: users on_public_user_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_public_user_created AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--
-- Name: accounts accounts_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: exercises exercises_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_referred_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: routine_exercises routine_exercises_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_exercises
    ADD CONSTRAINT routine_exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE RESTRICT;


--
-- Name: routine_exercises routine_exercises_routine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_exercises
    ADD CONSTRAINT routine_exercises_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.routines(id) ON DELETE CASCADE;


--
-- Name: routine_exercises routine_exercises_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_exercises
    ADD CONSTRAINT routine_exercises_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: routines routines_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routines
    ADD CONSTRAINT routines_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: session_exercises session_exercises_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_exercises
    ADD CONSTRAINT session_exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE RESTRICT;


--
-- Name: session_exercises session_exercises_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_exercises
    ADD CONSTRAINT session_exercises_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: session_exercises session_exercises_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_exercises
    ADD CONSTRAINT session_exercises_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_routine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.routines(id) ON DELETE SET NULL;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sets sets_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sets
    ADD CONSTRAINT sets_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE RESTRICT;


--
-- Name: sets sets_session_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sets
    ADD CONSTRAINT sets_session_exercise_id_fkey FOREIGN KEY (session_exercise_id) REFERENCES public.session_exercises(id) ON DELETE CASCADE;


--
-- Name: sets sets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sets
    ADD CONSTRAINT sets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
