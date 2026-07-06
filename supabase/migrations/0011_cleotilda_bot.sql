-- 0011: Cleotilda, the workspace AI assistant.
--
-- Seeds a bot identity (auth user + profile with a fixed UUID) and adds a
-- SECURITY DEFINER RPC that lets any authenticated member post a message AS
-- Cleotilda into a room they belong to. The AI call itself happens in the app
-- server; this migration only provides the identity and the write path.

-- 1) Bot auth user. The on_auth_user_created trigger creates the profile row.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'c1e0711d-a000-4000-a000-000000000001',
  'authenticated',
  'authenticated',
  'cleotilda@tasking.app',
  '',  -- no password: the bot can never sign in
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Cleotilda"}',
  now(),
  now()
)
on conflict (id) do nothing;

-- Belt and suspenders: make sure the profile exists and is branded.
insert into public.profiles (id, email, full_name, title)
values (
  'c1e0711d-a000-4000-a000-000000000001',
  'cleotilda@tasking.app',
  'Cleotilda',
  'AI Assistant'
)
on conflict (id) do update
  set full_name = 'Cleotilda',
      title     = 'AI Assistant',
      email     = 'cleotilda@tasking.app';

-- 2) Post a message as Cleotilda. Caller must be a member of the target room;
--    the insert runs as definer so RLS (user_id = auth.uid()) doesn't apply.
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
    if v_ws is null then
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
    select workspace_id into v_ws
    from public.conversations
    where id = p_conversation_id and deleted_at is null;
    if v_ws is null then
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
