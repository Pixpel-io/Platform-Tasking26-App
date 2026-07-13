-- =============================================================================
-- 0032 — Cleotilda can reply in global (workspace-less) DMs
--
-- cleotilda_post_message (0011) resolved the target conversation's workspace_id
-- and treated a null result as "conversation not found". Since 0026 every 1:1
-- DM has workspace_id = null, so posting a reply into a personal DM raised
-- 'conversation not found' and respondAsCleotilda swallowed it — the requested
-- action still ran, but no reply landed in the DM.
--
-- Detect the conversation by row existence instead of by a non-null
-- workspace_id, mirroring how DM messages already carry a null workspace_id.
-- =============================================================================

create or replace function public.cleotilda_post_message(
  p_body text,
  p_channel_id uuid default null,
  p_conversation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bot constant uuid := 'c1e0711d-a000-4000-a000-000000000001';
  v_ws uuid;
  v_found boolean;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'message body required';
  end if;

  if p_channel_id is not null then
    select workspace_id into v_ws
    from public.channels
    where id = p_channel_id and deleted_at is null;
    if not found then
      raise exception 'group not found';
    end if;
    if not exists (
      select 1 from public.channel_members
      where channel_id = p_channel_id
        and user_id = v_uid
        and deleted_at is null
    ) then
      raise exception 'not a member of this group';
    end if;
  elsif p_conversation_id is not null then
    -- workspace_id is null for global 1:1 DMs (see 0026); check existence by
    -- the row itself, not by a non-null workspace.
    select workspace_id, true into v_ws, v_found
    from public.conversations
    where id = p_conversation_id and deleted_at is null;
    if not found then
      raise exception 'conversation not found';
    end if;
    if not exists (
      select 1 from public.conversation_participants
      where conversation_id = p_conversation_id
        and user_id = v_uid
    ) then
      raise exception 'not a participant of this conversation';
    end if;
  else
    raise exception 'a channel or conversation is required';
  end if;

  insert into public.messages (workspace_id, channel_id, conversation_id, user_id, kind, body)
  values (v_ws, p_channel_id, p_conversation_id, v_bot, 'user', p_body)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.cleotilda_post_message(text, uuid, uuid) to authenticated;
