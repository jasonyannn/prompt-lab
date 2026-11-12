-- Prompt Lab forum schema (Supabase / Postgres).
--
-- The original project was lost to a free-tier pause in an org nobody could
-- resume, and this schema only existed in its dashboard. It lives here now so
-- a fresh project can be rebuilt with one paste into the SQL editor.
--
-- RLS is the security boundary: the browser talks to these tables directly
-- with the anon key, so every rule the UI relies on is enforced below.
--
-- Everything here is namespaced (forum_*) and nothing hooks auth.users, so the
-- schema can share a Supabase project with another app: `public.profiles` is a
-- common table name, and a trigger on auth.users would run on that app's
-- sign-ups too.

-- ── forum_profiles ──────────────────────────────────────────────────────────

create table public.forum_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.forum_profiles enable row level security;

create policy "Forum profiles are public"
  on public.forum_profiles for select
  to anon, authenticated
  using (true);

create policy "Users create their own forum profile"
  on public.forum_profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "Users update their own forum profile"
  on public.forum_profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ── forum_posts ─────────────────────────────────────────────────────────────

create table public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  -- Null for anonymous posts. References forum_profiles (not auth.users) so
  -- PostgREST can embed `forum_profiles!author_id`.
  author_id uuid references public.forum_profiles (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  content text not null check (char_length(content) between 1 and 50000),
  category text not null default 'General',
  tags text[] not null default '{}',
  visibility text not null default 'public'
    check (visibility in ('public', 'unlisted', 'private')),
  status text not null default 'published'
    check (status in ('draft', 'published', 'flagged', 'removed')),
  rating numeric,
  usage_count integer not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A private post needs an owner to scope it to.
  constraint anonymous_posts_are_public
    check (author_id is not null or visibility = 'public')
);

create index forum_posts_feed_idx
  on public.forum_posts (status, visibility, created_at desc);
create index forum_posts_author_idx
  on public.forum_posts (author_id, created_at desc);

alter table public.forum_posts enable row level security;

create policy "Published non-private posts are readable; authors read their own"
  on public.forum_posts for select
  to anon, authenticated
  using (
    (status = 'published' and visibility in ('public', 'unlisted'))
    or author_id = (select auth.uid())
  );

-- Anonymous posting is allowed, but only as a published public post with no
-- author. Signed-in users may only post as themselves.
create policy "Anyone can post anonymously"
  on public.forum_posts for insert
  to anon, authenticated
  with check (
    author_id is null
    and visibility = 'public'
    and status = 'published'
  );

create policy "Signed-in users post as themselves"
  on public.forum_posts for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and status in ('draft', 'published')
  );

create policy "Authors update their own posts"
  on public.forum_posts for update
  to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "Authors delete their own posts"
  on public.forum_posts for delete
  to authenticated
  using (author_id = (select auth.uid()));

-- A signed-in author's first post creates their forum profile, so posts can
-- always join to one without a trigger on auth.users. This runs before the
-- insert policy is checked; a post for someone else's id is rejected there
-- and the whole statement, profile row included, rolls back.
create function public.forum_ensure_author_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.author_id is not null then
    insert into public.forum_profiles (id) values (new.author_id)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

create trigger forum_posts_ensure_author_profile
  before insert on public.forum_posts
  for each row execute function public.forum_ensure_author_profile();

create function public.forum_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger forum_posts_touch_updated_at
  before update on public.forum_posts
  for each row execute function public.forum_touch_updated_at();

create trigger forum_profiles_touch_updated_at
  before update on public.forum_profiles
  for each row execute function public.forum_touch_updated_at();

-- ── likes ───────────────────────────────────────────────────────────────────

create table public.forum_post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.forum_posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index forum_post_likes_user_idx on public.forum_post_likes (user_id);

alter table public.forum_post_likes enable row level security;

create policy "Users see their own likes"
  on public.forum_post_likes for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users like as themselves"
  on public.forum_post_likes for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users unlike their own likes"
  on public.forum_post_likes for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Totals are maintained by trigger and are read-only to clients, so a like
-- count cannot be set by hand from the browser.
create table public.forum_post_like_totals (
  post_id uuid primary key references public.forum_posts (id) on delete cascade,
  like_count integer not null default 0 check (like_count >= 0)
);

alter table public.forum_post_like_totals enable row level security;

create policy "Like totals are public"
  on public.forum_post_like_totals for select
  to anon, authenticated
  using (true);

create function public.sync_forum_like_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.forum_post_like_totals (post_id, like_count)
    values (new.post_id, 1)
    on conflict (post_id)
    do update set like_count = public.forum_post_like_totals.like_count + 1;
    return new;
  end if;

  update public.forum_post_like_totals
  set like_count = greatest(like_count - 1, 0)
  where post_id = old.post_id;
  return old;
end;
$$;

create trigger forum_post_likes_sync_total
  after insert or delete on public.forum_post_likes
  for each row execute function public.sync_forum_like_total();

-- Trigger functions are not meant to be called over the REST API.
revoke execute on function public.forum_ensure_author_profile() from anon, authenticated, public;
revoke execute on function public.sync_forum_like_total() from anon, authenticated, public;
