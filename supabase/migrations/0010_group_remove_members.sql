-- =============================================================================
-- Group member removal — creator/admin can remove people from a group
-- Tasking — Team Collaboration SaaS
--
-- Mirrors add_channel_members (0009): a SECURITY DEFINER RPC gates on the same
-- "workspace admin OR group creator" rule, soft-deletes the channel_members
-- row, posts a Slack-style system line ("Alice removed Bob"), and notifies the
-- removed member. The group creator can never be removed (that would orphan the
-- group), and the caller cannot remove themselves through this path.
--
-- The removed user's client subscribes to their own channel_members changes
-- (sidebar refresh) and to notifications (toast + bell), so both update live.
-- =============================================================================

create or replace function public.remove_channel_member(
  p_channel_id uuid,
  p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_workspace_id uuid;
  v_channel_name text;
  v_created_by uuid;
  v_actor_name text;
  v_member_name text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select workspace_id, name, created_by
    into v_workspace_id, v_channel_name, v_created_by
  from public.channels
  where id = p_channel_id and deleted_at is null;

  if v_workspace_id is null then
    raise exception 'group not found';
  end if;

  if not (
    public.is_workspace_admin(v_workspace_id)
    or v_created_by = v_uid
  ) then
    raise exception 'only the group creator or a workspace admin can remove members';
  end if;

  if p_member_id = v_created_by then
    raise exception 'the group creator cannot be removed';
  end if;

  -- Nothing to do if they aren't an active member.
  if not exists (
    select 1 from public.channel_members cm
    where cm.channel_id = p_channel_id
      and cm.user_id = p_member_id
      and cm.deleted_at is null
  ) then
    return;
  end if;

  update public.channel_members
  set deleted_at = now()
  where channel_id = p_channel_id
    and user_id = p_member_id
    and deleted_at is null;

  select coalesce(full_name, email) into v_actor_name
  from public.profiles where id = v_uid;
  select coalesce(full_name, email) into v_member_name
  from public.profiles where id = p_member_id;

  -- Slack-style system line, visible to everyone still in the group.
  insert into public.messages (workspace_id, channel_id, user_id, kind, body)
  values (
    v_workspace_id, p_channel_id, v_uid, 'system',
    coalesce(v_actor_name, 'Someone') || ' removed ' || coalesce(v_member_name, 'someone')
  );

  -- Let the removed member know.
  insert into public.notifications (
    workspace_id, user_id, actor_id, type, title, body, channel_id
  )
  values (
    v_workspace_id, p_member_id, v_uid, 'group.removed',
    coalesce(v_actor_name, 'Someone') || ' removed you from #' || v_channel_name,
    '', p_channel_id
  );
end;
$$;
