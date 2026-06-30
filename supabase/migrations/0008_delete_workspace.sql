-- Owner-only soft-delete of a workspace. When it's the last active workspace in
-- its organization, the organization (company) is soft-deleted too. Returns the
-- id of another workspace the caller still belongs to, or null.
create or replace function public.delete_workspace(p_workspace_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_remaining uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_workspace_owner(p_workspace_id) then
    raise exception 'only the workspace owner can delete it';
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
    where id = v_org_id and deleted_at is null;
  end if;

  -- Hand back another workspace the caller can land on, if any.
  select wm.workspace_id into v_remaining
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.user_id = v_uid
    and wm.deleted_at is null
    and w.deleted_at is null
  order by wm.created_at asc
  limit 1;

  return v_remaining;
end;
$$;
