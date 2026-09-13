-- Auto-provision a profiles row when a new auth user is created.
-- The app is now Google-only with open signup: a first-time Google sign-in inserts an
-- auth.users row, and the app requires every user to have a profiles row (unique username +
-- unique referral_code). This trigger creates that row in the same transaction as the auth
-- user, so there is never a logged-in user without a profile. (This replaces the old
-- server-side signup action that used to insert the profile explicitly.)

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
