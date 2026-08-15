-- Per-user referral codes + shareable invite links.
--
-- Replaces the old single-use `invite_codes` "ticket" model: every user now owns one
-- permanent, personal `referral_code` that unlimited people can use to sign up. New signups
-- record `referred_by` (who invited them). The old table is dropped.

-- 8-char human-readable code generator. Alphabet excludes visually ambiguous characters
-- (0/O, 1/I/L) so codes can be read aloud / typed by hand if the link isn't used.
create or replace function public.gen_referral_code()
returns text
language plpgsql
set search_path = public
as $$
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

-- Add the column nullable first so we can backfill existing rows before enforcing NOT NULL.
alter table public.profiles add column referral_code text;

-- Create the unique index up front (a unique index permits multiple NULLs) so the backfill's
-- collision retry below actually raises unique_violation on a dup.
create unique index profiles_referral_code_key on public.profiles(referral_code);

-- Backfill every existing profile with a unique code, retrying on the rare collision.
do $$
declare
  r record;
  new_code text;
begin
  for r in select id from public.profiles where referral_code is null loop
    loop
      new_code := public.gen_referral_code();
      begin
        update public.profiles set referral_code = new_code where id = r.id;
        exit;
      exception when unique_violation then
        -- try a fresh code
      end;
    end loop;
  end loop;
end $$;

alter table public.profiles alter column referral_code set not null;

-- Who invited this user (the owner of the referral_code used at signup). Null for pre-existing
-- users. ON DELETE SET NULL so removing an inviter doesn't cascade-delete their invitees.
alter table public.profiles add column referred_by uuid references auth.users(id) on delete set null;

-- Count of accounts this user has invited. SECURITY DEFINER because `profiles_select_own` RLS
-- (id = auth.uid()) blocks an inviter from selecting their invitees' rows; this returns ONLY an
-- aggregate integer, never rows, so it can't leak invitee usernames. Keep it that way.
create or replace function public.referral_count()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::int from public.profiles where referred_by = auth.uid();
$$;
revoke all on function public.referral_count() from public;
grant execute on function public.referral_count() to authenticated;

-- The single-use invite system is fully replaced by referral codes.
drop table public.invite_codes;
