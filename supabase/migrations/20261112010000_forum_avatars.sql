-- Avatar URLs are public profile data. Files are namespaced by authenticated
-- user id; no other bucket's visibility or policies are changed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('forum-avatars', 'forum-avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Re-runnable: drop first so an existing policy does not abort the script.

drop policy if exists "Forum avatar owners read their files" on storage.objects;
create policy "Forum avatar owners read their files"
  on storage.objects for select to authenticated
  using (bucket_id = 'forum-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Forum avatar owners upload their files" on storage.objects;
create policy "Forum avatar owners upload their files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'forum-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Forum avatar owners delete their files" on storage.objects;
create policy "Forum avatar owners delete their files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'forum-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
