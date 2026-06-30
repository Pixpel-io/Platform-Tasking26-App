-- =============================================================================
-- Phase 3 — Profile extras (job title + avatar uploads)
-- Tasking — Team Collaboration SaaS
--
-- Adds a free-text job title to profiles (e.g. "Blockchain Developer") and a
-- public storage bucket for avatar images. Avatars are world-readable (so they
-- render anywhere without signed URLs), but a user can only write/replace files
-- inside their own user-id folder.
--
-- Path convention:  <user_id>/<uuid>-<filename>
-- =============================================================================

alter table public.profiles
  add column if not exists title text;

-- =============================================================================
-- Avatars storage bucket — public read, owner-scoped writes
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Read: anyone (the bucket is public; avatars are non-sensitive identity art).
create policy "avatars read"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

-- Upload: authenticated users, only into their own user-id folder.
create policy "avatars insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Replace: users can update their own objects.
create policy "avatars update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Delete: users can remove their own objects.
create policy "avatars delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
