-- =============================================================================
-- 0021 — Super admins can invite members in workspaces they belong to
--
-- Invite insert/update RLS only accepted workspace owners/admins, so a super
-- admin seated as a plain member couldn't invite anyone. Allow a super admin
-- to create and manage invites in any workspace they are a MEMBER of - scoped
-- deliberately to membership so this grants no reach into other workspaces
-- (message/channel/project policies are untouched).
-- =============================================================================

create or replace function public.can_manage_invites(p_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_workspace_admin(p_workspace_id)
    or (public.is_super_admin() and public.is_workspace_member(p_workspace_id));
$$;

drop policy if exists invites_insert_admin on public.invites;
create policy invites_insert_admin on public.invites
  for insert with check (
    public.can_manage_invites(workspace_id)
    and invited_by = auth.uid()
  );

drop policy if exists invites_update_admin on public.invites;
create policy invites_update_admin on public.invites
  for update using (public.can_manage_invites(workspace_id))
  with check (public.can_manage_invites(workspace_id));

drop policy if exists invites_delete_admin on public.invites;
create policy invites_delete_admin on public.invites
  for delete using (public.can_manage_invites(workspace_id));
