-- Follows and friend requests between forum profiles.
-- Safe to re-run: tables, indexes and policies are created only if missing.
--
-- Follows are one-way and public (profile pages show follower counts), the same
-- shape as likes. Friendships need both sides to agree, so a row starts as a
-- pending request from `requester_id` and only the addressee can accept it.
-- Pending/accepted friendships are visible only to the two people involved.

-- ── follows ─────────────────────────────────────────────────────────────────

create table if not exists public.forum_follows (
  follower_id uuid not null default auth.uid() references public.forum_profiles (id) on delete cascade,
  followee_id uuid not null references public.forum_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint forum_follows_not_self check (follower_id <> followee_id)
);

create index if not exists forum_follows_followee_idx on public.forum_follows (followee_id);

alter table public.forum_follows enable row level security;

drop policy if exists "Follows are public" on public.forum_follows;
create policy "Follows are public"
  on public.forum_follows for select
  to anon, authenticated
  using (true);

drop policy if exists "Users follow as themselves" on public.forum_follows;
create policy "Users follow as themselves"
  on public.forum_follows for insert
  to authenticated
  with check (follower_id = (select auth.uid()));

drop policy if exists "Users unfollow their own follows" on public.forum_follows;
create policy "Users unfollow their own follows"
  on public.forum_follows for delete
  to authenticated
  using (follower_id = (select auth.uid()));

-- ── friendships ─────────────────────────────────────────────────────────────

create table if not exists public.forum_friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null default auth.uid() references public.forum_profiles (id) on delete cascade,
  addressee_id uuid not null references public.forum_profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  constraint forum_friendships_not_self check (requester_id <> addressee_id)
);

-- One row per pair, whichever direction the request went. Without this, A→B
-- and B→A could both be pending and never resolve.
create unique index if not exists forum_friendships_pair_key
  on public.forum_friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists forum_friendships_addressee_idx on public.forum_friendships (addressee_id);

alter table public.forum_friendships enable row level security;

drop policy if exists "Friendship parties can read it" on public.forum_friendships;
create policy "Friendship parties can read it"
  on public.forum_friendships for select
  to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- A request is always created pending, so nobody can befriend someone unilaterally.
drop policy if exists "Users send friend requests as themselves" on public.forum_friendships;
create policy "Users send friend requests as themselves"
  on public.forum_friendships for insert
  to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending');

drop policy if exists "Addressees accept requests" on public.forum_friendships;
create policy "Addressees accept requests"
  on public.forum_friendships for update
  to authenticated
  using (addressee_id = (select auth.uid()))
  with check (addressee_id = (select auth.uid()) and status = 'accepted');

-- Either side may cancel, decline or unfriend.
drop policy if exists "Friendship parties can delete it" on public.forum_friendships;
create policy "Friendship parties can delete it"
  on public.forum_friendships for delete
  to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- RLS cannot say "only this column may change", so restrict it with grants:
-- the addressee can flip status and nothing else (not who the pair is).
revoke update on public.forum_friendships from anon, authenticated;
grant update (status) on public.forum_friendships to authenticated;
