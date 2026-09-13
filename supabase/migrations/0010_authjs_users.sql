-- Phase 2: Auth.js (NextAuth) replaces GoTrue as the auth store.
-- Create public.users + public.accounts (Auth.js Prisma-adapter shape), migrate existing GoTrue
-- users into public.users PRESERVING their ids (so all app data, which FKs to those ids, stays
-- valid), repoint every FK from auth.users to public.users, move the profile-provisioning
-- trigger, and disable RLS (the app connects directly and scopes every query by user_id).
--
-- No Session/VerificationToken tables: the app uses JWT sessions and Google-only OAuth, so the
-- adapter never touches them. (A Session table would also collide with the workout `sessions`.)

create table public.users (
  id            uuid primary key default gen_random_uuid(),
  name          text,
  email         text unique,
  "emailVerified" timestamptz,
  image         text
);

create table public.accounts (
  id                  uuid primary key default gen_random_uuid(),
  "userId"            uuid not null references public.users(id) on delete cascade,
  type                text not null,
  provider            text not null,
  "providerAccountId" text not null,
  refresh_token       text,
  access_token        text,
  expires_at          integer,
  token_type          text,
  scope               text,
  id_token            text,
  session_state       text,
  unique (provider, "providerAccountId")
);
create index accounts_user_id_idx on public.accounts ("userId");

-- Migrate existing GoTrue users, preserving ids. emailVerified is stamped so Google
-- account-linking (allowDangerousEmailAccountLinking) treats these accounts as verified.
insert into public.users (id, email, "emailVerified")
select id, email, now() from auth.users
on conflict (id) do nothing;

-- Move the profile-provisioning trigger (handle_new_user, 0008) from auth.users to public.users.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_public_user_created
  after insert on public.users
  for each row execute function public.handle_new_user();

-- Repoint every FK from auth.users to public.users (same on-delete behavior as before).
alter table public.profiles
  drop constraint profiles_id_fkey,
  add constraint profiles_id_fkey foreign key (id) references public.users(id) on delete cascade;
alter table public.profiles
  drop constraint profiles_referred_by_fkey,
  add constraint profiles_referred_by_fkey foreign key (referred_by) references public.users(id) on delete set null;
alter table public.exercises
  drop constraint exercises_user_id_fkey,
  add constraint exercises_user_id_fkey foreign key (user_id) references public.users(id) on delete cascade;
alter table public.routines
  drop constraint routines_user_id_fkey,
  add constraint routines_user_id_fkey foreign key (user_id) references public.users(id) on delete cascade;
alter table public.routine_exercises
  drop constraint routine_exercises_user_id_fkey,
  add constraint routine_exercises_user_id_fkey foreign key (user_id) references public.users(id) on delete cascade;
alter table public.sessions
  drop constraint sessions_user_id_fkey,
  add constraint sessions_user_id_fkey foreign key (user_id) references public.users(id) on delete cascade;
alter table public.session_exercises
  drop constraint session_exercises_user_id_fkey,
  add constraint session_exercises_user_id_fkey foreign key (user_id) references public.users(id) on delete cascade;
alter table public.sets
  drop constraint sets_user_id_fkey,
  add constraint sets_user_id_fkey foreign key (user_id) references public.users(id) on delete cascade;

-- RLS is no longer the enforcement path; the service layer scopes by user_id.
alter table public.profiles          disable row level security;
alter table public.exercises         disable row level security;
alter table public.routines          disable row level security;
alter table public.routine_exercises disable row level security;
alter table public.sessions          disable row level security;
alter table public.session_exercises disable row level security;
alter table public.sets              disable row level security;
