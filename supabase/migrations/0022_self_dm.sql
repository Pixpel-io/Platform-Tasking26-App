-- =============================================================================
-- 0022 — Slack-style self-DM ("message yourself" notes space)
--
-- get_or_create_dm rejected p_other_user_id = auth.uid(). Allow it: the
-- dm_key (least:greatest) already collapses to "uid:uid" for self, and the
-- participant insert just needs de-duping so the composite PK doesn't clash.
-- =============================================================================

create or replace function public.get_or_create_dm(
  p_workspace_id uuid,
  p_other_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_conv_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of this workspace';
  end if;
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = p_other_user_id
      and wm.deleted_at is null
  ) then
    raise exception 'other user is not in this workspace';
  end if;

  -- Stable key independent of who initiates ("uid:uid" for a self-DM).
  v_key := least(v_uid::text, p_other_user_id::text) || ':' ||
           greatest(v_uid::text, p_other_user_id::text);

  select id into v_conv_id
  from public.conversations
  where workspace_id = p_workspace_id and dm_key = v_key
  limit 1;

  if v_conv_id is not null then
    return v_conv_id;
  end if;

  insert into public.conversations (workspace_id, is_group, dm_key, created_by)
  values (p_workspace_id, false, v_key, v_uid)
  returning id into v_conv_id;

  -- Distinct users only: a self-DM has a single participant row.
  insert into public.conversation_participants (conversation_id, user_id)
  select v_conv_id, u
  from (select distinct unnest(array[v_uid, p_other_user_id]) as u) users;

  return v_conv_id;
end;
$$;
