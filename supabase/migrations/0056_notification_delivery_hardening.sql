-- Harden external notification delivery and make webhook fanout idempotent.

-- Verification and delivery fields are server-owned. Authenticated users may
-- read their row, while server actions (service role) mutate preferences/codes.
drop policy if exists "own channels insert" on public.user_notification_channels;
drop policy if exists "own channels update" on public.user_notification_channels;
drop policy if exists "own channels delete" on public.user_notification_channels;
revoke insert, update, delete on public.user_notification_channels from authenticated;

-- Webhook-originated connection changes should reach the settings UI without
-- aggressive polling.
alter table public.user_notification_channels replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_notification_channels'
  ) then
    alter publication supabase_realtime add table public.user_notification_channels;
  end if;
end $$;

alter table public.user_notification_channels
  add column if not exists delivery_window_started_at timestamptz,
  add column if not exists delivery_window_count integer not null default 0
    check (delivery_window_count >= 0);

create table if not exists public.notification_channel_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel_id uuid not null references public.user_notification_channels(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (notification_id, channel_id)
);

create index if not exists notification_channel_deliveries_created_idx
  on public.notification_channel_deliveries(created_at);

alter table public.notification_channel_deliveries enable row level security;
revoke all on public.notification_channel_deliveries from anon, authenticated;
grant select, insert, update, delete on public.notification_channel_deliveries
  to service_role;

-- Atomically reserve one notification/channel delivery and enforce a bounded
-- Telegram burst rate. Duplicate webhook attempts return false and do not send.
create or replace function public.claim_notification_channel_delivery(
  p_notification_id uuid,
  p_channel_id uuid,
  p_limit integer default 30
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel public.user_notification_channels%rowtype;
  v_delivery_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_channel
  from public.user_notification_channels
  where id = p_channel_id
    and verified_at is not null
    and external_id is not null
    and exists (
      select 1 from public.notifications n
      where n.id = p_notification_id
        and n.user_id = user_notification_channels.user_id
    )
  for update;

  if not found then return false; end if;

  if v_channel.delivery_window_started_at is null
     or v_channel.delivery_window_started_at <= v_now - interval '1 minute' then
    update public.user_notification_channels
    set delivery_window_started_at = v_now, delivery_window_count = 0
    where id = p_channel_id;
    v_channel.delivery_window_count := 0;
  end if;

  if v_channel.delivery_window_count >= greatest(1, least(p_limit, 60)) then
    return false;
  end if;

  insert into public.notification_channel_deliveries(notification_id, channel_id)
  values (p_notification_id, p_channel_id)
  on conflict (notification_id, channel_id) do nothing
  returning id into v_delivery_id;

  if v_delivery_id is null then return false; end if;

  update public.user_notification_channels
  set delivery_window_count = delivery_window_count + 1
  where id = p_channel_id;
  return true;
end;
$$;

revoke all on function public.claim_notification_channel_delivery(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_notification_channel_delivery(uuid, uuid, integer)
  to service_role;

-- A mentioned channel member should receive the more specific mention alert,
-- not both mention and group-message alerts for the same message.
create or replace function public.notify_on_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg public.messages;
  v_actor_name text;
begin
  select * into v_msg from public.messages where id = new.message_id;
  if v_msg.id is null or new.mentioned_id = v_msg.user_id then return new; end if;

  delete from public.notifications
  where user_id = new.mentioned_id
    and message_id = v_msg.id
    and type = 'group.message';

  select coalesce(full_name, email) into v_actor_name
  from public.profiles where id = v_msg.user_id;

  insert into public.notifications (
    workspace_id, user_id, actor_id, type, title, body,
    channel_id, conversation_id, message_id
  ) values (
    v_msg.workspace_id, new.mentioned_id, v_msg.user_id, 'mention',
    coalesce(v_actor_name, 'Someone') || ' mentioned you',
    left(v_msg.body, 280), v_msg.channel_id, v_msg.conversation_id, v_msg.id
  );
  return new;
end;
$$;

delete from public.notifications
where id in (
  select id from (
    select id, row_number() over (
      partition by user_id, message_id, type order by created_at, id
    ) as duplicate_number
    from public.notifications
    where message_id is not null
  ) duplicates
  where duplicate_number > 1
);

create unique index if not exists notifications_message_recipient_type_unique
  on public.notifications(user_id, message_id, type)
  where message_id is not null;

notify pgrst, 'reload schema';
