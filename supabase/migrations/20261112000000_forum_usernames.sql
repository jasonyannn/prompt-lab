-- Existing profiles keep their display names. Handles are optional for old
-- accounts and are protected by the existing owner-only INSERT/UPDATE RLS.
alter table public.forum_profiles
  add column username text
    constraint forum_profiles_username_format
    check (username ~ '^[a-z0-9_]{3,24}$'),
  add constraint forum_profiles_username_key unique (username);

-- Reserve a signup's handle even when confirmation returns no session. Only
-- Prompt Lab signups supply this namespaced key; other apps sharing auth.users
-- are untouched. Metadata supplies public profile data, never authorization.
create function public.forum_signup_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ? 'promptlab_username' then
    insert into public.forum_profiles (id, username)
    values (new.id, lower(trim(new.raw_user_meta_data ->> 'promptlab_username')));
  end if;
  return new;
end;
$$;

revoke execute on function public.forum_signup_username() from public, anon, authenticated;

create trigger forum_signup_username
  after insert on auth.users
  for each row execute function public.forum_signup_username();
