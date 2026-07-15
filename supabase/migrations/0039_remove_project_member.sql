-- =============================================================================
-- 0039_remove_project_member — let a board owner / workspace admin remove a
-- member from a project after creation.
--
-- Adding members already exists (add_project_members, 0004) and soft-deletes on
-- re-add via `on conflict do update set deleted_at = null`. Removal mirrors that:
-- a soft-delete (set deleted_at = now()) so re-adding the same person later
-- restores their row instead of duplicating it. project_members has no UPDATE
-- RLS policy, so this runs as SECURITY DEFINER with the same owner/admin guard
-- add_project_members uses. The board owner can never be removed - they own it.
-- =============================================================================
create or replace function public.remove_project_member(
  p_project_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_workspace_id uuid;
  v_owner_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select workspace_id, owner_id into v_workspace_id, v_owner_id
  from public.projects where id = p_project_id and deleted_at is null;
  if v_workspace_id is null then
    raise exception 'project not found';
  end if;

  if not (
    public.is_workspace_admin(v_workspace_id)
    or v_owner_id = v_uid
  ) then
    raise exception 'only the project owner or a workspace admin can remove members';
  end if;

  if p_user_id = v_owner_id then
    raise exception 'the board owner cannot be removed';
  end if;

  update public.project_members
  set deleted_at = now()
  where project_id = p_project_id
    and user_id = p_user_id
    and deleted_at is null;
end;
$$;

notify pgrst, 'reload schema';
