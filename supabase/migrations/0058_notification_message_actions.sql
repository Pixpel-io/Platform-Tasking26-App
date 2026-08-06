-- Atomic, idempotent backend for Android notification actions.
create table if not exists public.notification_action_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  action text not null check (action in ('mark_read', 'reply')),
  result_message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, notification_id, action)
);

alter table public.notification_action_receipts enable row level security;
revoke all on public.notification_action_receipts from anon, authenticated;

create or replace function public.handle_notification_message_action(
  p_notification_id uuid,
  p_action text,
  p_reply_text text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_notification public.notifications%rowtype;
  v_receipt_id uuid;
  v_message_id uuid;
  v_read_id uuid;
  v_now timestamptz := now();
  v_text text := btrim(coalesce(p_reply_text, ''));
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_action not in ('mark_read', 'reply') then raise exception 'Invalid action'; end if;

  select * into v_notification from public.notifications
  where id = p_notification_id and user_id = v_uid for update;
  if not found then raise exception 'Notification not found'; end if;
  if v_notification.message_id is null or
     (v_notification.channel_id is null and v_notification.conversation_id is null) then
    raise exception 'Notification is not a message';
  end if;
  if v_notification.channel_id is not null and
     not public.can_access_channel(v_notification.channel_id) then
    raise exception 'Channel access denied';
  end if;
  if v_notification.conversation_id is not null and
     not public.is_conversation_participant(v_notification.conversation_id) then
    raise exception 'Conversation access denied';
  end if;
  if p_action = 'reply' and (v_text = '' or length(v_text) > 8000) then
    raise exception 'Reply must be between 1 and 8000 characters';
  end if;

  insert into public.notification_action_receipts(user_id, notification_id, action)
  values (v_uid, p_notification_id, p_action)
  on conflict (user_id, notification_id, action) do nothing
  returning id into v_receipt_id;
  if v_receipt_id is null then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  if p_action = 'reply' then
    insert into public.messages(workspace_id, channel_id, conversation_id, user_id, kind, body)
    values (v_notification.workspace_id, v_notification.channel_id,
      v_notification.conversation_id, v_uid, 'user', v_text)
    returning id into v_message_id;
    update public.notification_action_receipts set result_message_id = v_message_id
    where id = v_receipt_id;
  end if;

  select id into v_read_id from public.read_state
  where user_id = v_uid and (
    (v_notification.channel_id is not null and channel_id = v_notification.channel_id) or
    (v_notification.conversation_id is not null and conversation_id = v_notification.conversation_id)
  ) limit 1 for update;
  if v_read_id is null then
    insert into public.read_state(user_id, channel_id, conversation_id, last_read_at,
      last_read_message_id, updated_at)
    values (v_uid, v_notification.channel_id, v_notification.conversation_id,
      v_now, v_notification.message_id, v_now);
  else
    update public.read_state set last_read_at = v_now,
      last_read_message_id = v_notification.message_id, updated_at = v_now
    where id = v_read_id;
  end if;

  update public.notifications set read_at = coalesce(read_at, v_now)
  where user_id = v_uid and read_at is null and (
    (v_notification.channel_id is not null and channel_id = v_notification.channel_id) or
    (v_notification.conversation_id is not null and conversation_id = v_notification.conversation_id)
  );
  return jsonb_build_object('ok', true, 'message_id', v_message_id);
end;
$$;

revoke all on function public.handle_notification_message_action(uuid, text, text) from public;
grant execute on function public.handle_notification_message_action(uuid, text, text) to authenticated;
notify pgrst, 'reload schema';
