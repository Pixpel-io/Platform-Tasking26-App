-- =============================================================================
-- Workspace member role change — owner promotes / demotes admins
-- Tasking — Team Collaboration SaaS
--
-- The workspace_members_update_admin RLS policy would let any admin edit any
-- row (including their own role → owner), so role changes go through this
-- SECURITY DEFINER RPC with tight gates instead:
--   * caller must be the workspace owner (admins can't promote or demote)
--   * target must be a real member and cannot be an owner (owner is
--     immutable through this path — that's a separate ownership-transfer flow)
--   * new role must be 'admin' or 'member' (never 'owner')
--   * you can't change your own role
-- =============================================================================

create or replace function public.set_workspace_member_role(
  p_workspace_id uuid,
  p_member_user_id uuid,
  p_role public.workspace_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_caller_role public.workspace_role;
  v_target_role public.workspace_role;
  v_actor_name text;
  v_workspace_name text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'role must be admin or member';
  end if;

  if p_member_user_id = v_uid then
    raise exception 'you cannot change your own role';
  end if;

  select role into v_caller_role
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = v_uid
    and deleted_at is null;

  if v_caller_role is null or v_caller_role <> 'owner' then
    raise exception 'only the workspace owner can change roles';
  end if;

  select role into v_target_role
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = p_member_user_id
    and deleted_at is null;

  if v_target_role is null then
    raise exception 'member not found';
  end if;

  if v_target_role = 'owner' then
    raise exception 'the owner role cannot be changed here';
  end if;

  if v_target_role = p_role then
    -- No-op; still return quietly so the client doesn't have to guard for it.
    return;
  end if;

  update public.workspace_members
  set role = p_role,
      updated_at = now()
  where workspace_id = p_workspace_id
    and user_id = p_member_user_id
    and deleted_at is null;

  -- Notify the promoted user in real time (the notifications table has no
  -- INSERT RLS policy, so app-layer inserts can't do this - it has to happen
  -- here in the SECURITY DEFINER path). Only fire on member → admin; demotions
  -- stay quiet.
  if p_role = 'admin' then
    select coalesce(full_name, email) into v_actor_name
    from public.profiles where id = v_uid;
    select name into v_workspace_name
    from public.workspaces where id = p_workspace_id;

    insert into public.notifications (
      workspace_id, user_id, actor_id, type, title, body
    )
    values (
      p_workspace_id,
      p_member_user_id,
      v_uid,
      'workspace.admin',
      coalesce(v_actor_name, 'The workspace owner') ||
        ' made you an admin of ' || coalesce(v_workspace_name, 'this workspace'),
      ''
    );
  end if;
end;
$$;

notify pgrst, 'reload schema';
