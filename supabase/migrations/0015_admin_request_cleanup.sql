-- 0015: Super admins can delete workspace requests.
--
-- Deleting a workspace from /admin also removes its originating request
-- (and, when revoking, the owner's unused approvals). Those deletes need an
-- RLS delete policy on workspace_requests - without it they no-op silently
-- and "Recent decisions" keeps showing requests for dead workspaces.

drop policy if exists workspace_requests_delete on public.workspace_requests;
create policy workspace_requests_delete on public.workspace_requests
  for delete using (public.is_super_admin());
