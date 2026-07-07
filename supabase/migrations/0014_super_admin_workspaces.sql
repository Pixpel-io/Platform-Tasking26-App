-- 0014: Super admins govern all workspaces.
--
-- Lets super admins (0012) see every workspace, its member roster, and
-- delete any workspace - regardless of membership. Powers the /admin
-- "All workspaces" section: who created what, open it, delete it.

-- 1) Read every workspace.
drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces
  for select using (
    public.is_workspace_member(id) or public.is_super_admin()
  );

-- 2) Read every roster (owner lookup + member counts on the dashboard).
drop policy if exists workspace_members_select on public.workspace_members;
create policy workspace_members_select on public.workspace_members
  for select using (
    public.is_workspace_member(workspace_id) or public.is_super_admin()
  );

-- 3) Delete any workspace: super admin bypasses the owner check.
create or replace function public.delete_workspace(p_workspace_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not (public.is_workspace_owner(p_workspace_id) or public.is_super_admin()) then
    raise exception 'only the workspace owner or a super admin can delete it';
  end if;

  select organization_id into v_org_id
  from public.workspaces
  where id = p_workspace_id and deleted_at is null;

  if v_org_id is null then
    raise exception 'workspace not found';
  end if;

  update public.workspaces
  set deleted_at = now()
  where id = p_workspace_id;

  -- Soft-delete the organization once no active workspaces remain under it.
  if not exists (
    select 1 from public.workspaces
    where organization_id = v_org_id and deleted_at is null
  ) then
    update public.organizations
    set deleted_at = now()
    where id = v_org_id;
  end if;

  return p_workspace_id;
end;
$$;
