-- =============================================================================
-- 0023 — Assign any workspace member to a task
--
-- The People picker now offers every workspace member, but two things stood
-- in the way of assigning someone who isn't on the board yet:
--   1. project_members insert RLS (and add_project_members) is owner/admin
--      only, so a regular member couldn't seat the assignee.
--   2. Without a project_members row the assignee can't even see the board.
--
-- ensure_project_member seats a workspace member into a project when the
-- caller can access that project - scoped tightly: caller must be a project
-- member (or workspace admin), target must be an active member of the SAME
-- workspace. Existing membership is refreshed (undeleted), never duplicated.
-- =============================================================================

create or replace function public.ensure_project_member(
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
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select workspace_id into v_workspace_id
  from public.projects where id = p_project_id and deleted_at is null;
  if v_workspace_id is null then
    raise exception 'project not found';
  end if;

  if not public.can_access_project(p_project_id) then
    raise exception 'not a member of this project';
  end if;

  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.user_id = p_user_id
      and wm.deleted_at is null
  ) then
    raise exception 'user is not in this workspace';
  end if;

  insert into public.project_members (project_id, user_id)
  values (p_project_id, p_user_id)
  on conflict (project_id, user_id)
  do update set deleted_at = null;
end;
$$;
