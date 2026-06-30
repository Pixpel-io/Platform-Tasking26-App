-- =============================================================================
-- Phase 1 — Storage for chat attachments
-- Tasking — Team Collaboration SaaS
--
-- A private bucket holds files/images/video/voice shared in messages. Objects
-- are namespaced by workspace id (the first path segment), so access is granted
-- to members of that workspace. The app reads bytes back through short-lived
-- signed URLs generated server-side.
--
-- Path convention:  <workspace_id>/<user_id>/<uuid>-<filename>
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

-- Read: any member of the workspace named in the first path segment.
create policy "chat attachments read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
  );

-- Upload: a workspace member can upload, and only into their own user folder.
create policy "chat attachments insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Delete: owners of the object (the uploader) can remove their files.
create policy "chat attachments delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
