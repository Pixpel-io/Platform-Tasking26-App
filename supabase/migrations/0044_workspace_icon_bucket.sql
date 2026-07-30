-- =============================================================================
-- Workspace icon storage bucket — public read, admin-scoped write
-- Tasking — Team Collaboration SaaS
--
-- The `workspaces.icon_url` column has existed since 0000 but there was no
-- UI to set it. This creates a dedicated public bucket keyed by workspace
-- id (unlike `avatars`, which is user-scoped) so workspace admins can upload
-- a logo without needing service-role credentials. Object paths look like
-- `<workspace_id>/<uuid>.<ext>` — the first folder in the path drives RLS.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('workspace-icons', 'workspace-icons', true)
on conflict (id) do nothing;

-- Public read: workspace logos are non-sensitive identity art, same as avatars.
create policy "workspace icons read"
  on storage.objects for select
  to public
  using (bucket_id = 'workspace-icons');

-- Only workspace admins / owners can upload into their own workspace folder.
create policy "workspace icons upload admin"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'workspace-icons'
    and public.is_workspace_admin(((storage.foldername(name))[1])::uuid)
  );

create policy "workspace icons update admin"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'workspace-icons'
    and public.is_workspace_admin(((storage.foldername(name))[1])::uuid)
  );

create policy "workspace icons delete admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'workspace-icons'
    and public.is_workspace_admin(((storage.foldername(name))[1])::uuid)
  );
