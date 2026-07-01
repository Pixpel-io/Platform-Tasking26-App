-- =============================================================================
-- Group membership events — Slack-style "X added Y" + notifications
-- Tasking — Team Collaboration SaaS
--
-- Rewrites add_channel_members so that adding people to a group also:
--   1. posts a system message ("Alice added Bob and Carol") into the group, and
--   2. notifies each freshly added member ("Alice added you to #general").
--
-- Everything happens inside the SECURITY DEFINER RPC so the writes bypass RLS
-- (the client can't forge them) and land atomically with the membership rows.
-- The added user's client already subscribes to `notifications` (toast + bell)
-- and to their own `channel_members` inserts (sidebar refresh), so both update
-- live without a page reload.
-- =============================================================================

create or replace function public.add_channel_members(
  p_channel_id uuid,
  p_member_ids uuid[]
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
  v_actor_name text;
  v_member uuid;
  v_member_name text;
  v_added uuid[] := '{}';
  v_added_names text[] := '{}';
  v_names_text text;
  v_n int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select workspace_id, name into v_workspace_id, v_channel_name
  from public.channels
  where id = p_channel_id and deleted_at is null;

  if v_workspace_id is null then
    raise exception 'group not found';
  end if;

  if not (
    public.is_workspace_admin(v_workspace_id)
    or exists (
      select 1 from public.channels c
      where c.id = p_channel_id and c.created_by = v_uid
    )
  ) then
    raise exception 'only the group creator or a workspace admin can add members';
  end if;

  select coalesce(full_name, email) into v_actor_name
  from public.profiles where id = v_uid;

  foreach v_member in array p_member_ids loop
    if exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = v_workspace_id
        and wm.user_id = v_member
        and wm.deleted_at is null
    ) then
      -- Only treat as a fresh add if they weren't already an active member;
      -- re-adding a soft-removed member still counts as fresh.
      if not exists (
        select 1 from public.channel_members cm
        where cm.channel_id = p_channel_id
          and cm.user_id = v_member
          and cm.deleted_at is null
      ) then
        v_added := array_append(v_added, v_member);
        select coalesce(full_name, email) into v_member_name
        from public.profiles where id = v_member;
        v_added_names := array_append(v_added_names, coalesce(v_member_name, 'Someone'));
      end if;

      insert into public.channel_members (channel_id, user_id)
      values (p_channel_id, v_member)
      on conflict (channel_id, user_id)
      do update set deleted_at = null;
    end if;
  end loop;

  v_n := coalesce(array_length(v_added, 1), 0);
  if v_n = 0 then
    return;
  end if;

  -- Human "A", "A and B", or "A, B and C".
  if v_n = 1 then
    v_names_text := v_added_names[1];
  else
    v_names_text := array_to_string(v_added_names[1:v_n - 1], ', ')
                    || ' and ' || v_added_names[v_n];
  end if;

  -- Slack-style system line, visible to everyone in the group.
  insert into public.messages (workspace_id, channel_id, user_id, kind, body)
  values (
    v_workspace_id, p_channel_id, v_uid, 'system',
    coalesce(v_actor_name, 'Someone') || ' added ' || v_names_text
  );

  -- Notify each freshly added member.
  insert into public.notifications (
    workspace_id, user_id, actor_id, type, title, body, channel_id
  )
  select
    v_workspace_id, m, v_uid, 'group.added',
    coalesce(v_actor_name, 'Someone') || ' added you to #' || v_channel_name,
    '', p_channel_id
  from unnest(v_added) as m;
end;
$$;
