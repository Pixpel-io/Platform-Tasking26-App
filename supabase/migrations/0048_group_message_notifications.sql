-- =============================================================================
-- Group message notifications — inbox coverage for channel chatter
-- Tasking — Team Collaboration SaaS
--
-- Until now the bell / inbox only carried @mentions and DMs. If a teammate
-- sent a plain message into a channel, the sidebar's channel unread badge
-- ticked up but the notifications inbox stayed empty - CEO flagged this as
-- confusing ("message aya group pe, notification section me show nahi hua").
--
-- Trigger: for every user-authored, top-level message with a channel_id,
-- insert a 'group.message' notification for each active channel member
-- except the sender. Cleotilda's own posts are skipped so the AI doesn't
-- spam the inbox. Thread replies (parent_id set) don't fire either - those
-- are handled by their own opt-in watchers pattern later, and adding them
-- here would flood the inbox.
--
-- Paired with mark_channel_notifications_read below so visiting a channel
-- clears its inbox rows the same way visiting a board clears project.added
-- (see 0040 / auto-mark-project-read.tsx).
-- =============================================================================

create or replace function public.notify_on_group_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
  v_channel_name text;
begin
  -- Only user-authored top-level channel messages count.
  if new.channel_id is null then return new; end if;
  if new.parent_id is not null then return new; end if;
  if new.kind is not null and new.kind <> 'user' then return new; end if;
  -- Cleotilda posts freely; skip her authored notifications.
  if new.user_id = 'c1e0711d-a000-4000-a000-000000000001'::uuid then
    return new;
  end if;

  select coalesce(full_name, email) into v_actor_name
  from public.profiles where id = new.user_id;
  select name into v_channel_name
  from public.channels where id = new.channel_id;

  insert into public.notifications (
    workspace_id, user_id, actor_id, type, title, body,
    channel_id, message_id
  )
  select
    new.workspace_id, cm.user_id, new.user_id, 'group.message',
    coalesce(v_actor_name, 'Someone') || ' posted in #' ||
      coalesce(v_channel_name, 'a group'),
    left(new.body, 280),
    new.channel_id, new.id
  from public.channel_members cm
  where cm.channel_id = new.channel_id
    and cm.user_id <> new.user_id
    and cm.deleted_at is null;

  return new;
end;
$$;

drop trigger if exists messages_notify_group on public.messages;
create trigger messages_notify_group
  after insert on public.messages
  for each row execute function public.notify_on_group_message();

-- Slack-style clear-on-open: mark every unread notification for the given
-- channel as read for the calling user. Called from the channel page's
-- AutoMarkChannelRead client component on mount.
create or replace function public.mark_channel_notifications_read(
  p_channel_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and channel_id = p_channel_id
    and read_at is null;
$$;

notify pgrst, 'reload schema';
