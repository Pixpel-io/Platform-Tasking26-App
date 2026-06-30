-- =============================================================================
-- Phase 3 — Notifications
-- Tasking — Team Collaboration SaaS
--
-- A single notifications table fed by SECURITY DEFINER triggers, so the server
-- never has to be trusted to write them and the client can't forge them. Each
-- row targets one recipient (user_id) and carries enough entity refs to deep
-- link back to the source (message in a group/DM, or a task). Realtime is
-- enabled so the sidebar bell updates live.
--
-- Conventions (same as 0000-0004): uuid PKs, created_at, FK + lookup indexes,
-- RLS on the table. Notifications are immutable except for read_at, which the
-- recipient flips. Inserts happen only inside the trigger functions (which run
-- as the table owner and bypass RLS) — there is intentionally no insert policy.
-- =============================================================================

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  actor_id        uuid references public.profiles (id) on delete set null,
  -- Open-ended verb so new event kinds don't need a migration:
  --   'mention', 'dm', 'task.assigned'
  type            text not null,
  title           text not null default '',
  body            text not null default '',
  channel_id      uuid references public.channels (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete cascade,
  message_id      uuid references public.messages (id) on delete cascade,
  project_id      uuid references public.projects (id) on delete cascade,
  task_id         uuid references public.tasks (id) on delete cascade,
  meta            jsonb not null default '{}'::jsonb,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);
create index notifications_user_id_unread_idx
  on public.notifications (user_id) where read_at is null;
create index notifications_workspace_id_idx on public.notifications (workspace_id);

-- =============================================================================
-- Trigger functions — populate notifications from source events
-- =============================================================================

-- @mention in any message the mention row points at.
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
  if v_msg.id is null then
    return new;
  end if;
  -- Don't notify someone for mentioning themselves.
  if new.mentioned_id = v_msg.user_id then
    return new;
  end if;

  select coalesce(full_name, email) into v_actor_name
  from public.profiles where id = v_msg.user_id;

  insert into public.notifications (
    workspace_id, user_id, actor_id, type, title, body,
    channel_id, conversation_id, message_id
  )
  values (
    v_msg.workspace_id, new.mentioned_id, v_msg.user_id, 'mention',
    coalesce(v_actor_name, 'Someone') || ' mentioned you',
    left(v_msg.body, 280),
    v_msg.channel_id, v_msg.conversation_id, v_msg.id
  );
  return new;
end;
$$;

create trigger message_mentions_notify
  after insert on public.message_mentions
  for each row execute function public.notify_on_mention();

-- New top-level DM message → notify the other participants.
create or replace function public.notify_on_dm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
begin
  if new.conversation_id is null or new.parent_id is not null then
    return new;
  end if;

  select coalesce(full_name, email) into v_actor_name
  from public.profiles where id = new.user_id;

  insert into public.notifications (
    workspace_id, user_id, actor_id, type, title, body,
    conversation_id, message_id
  )
  select
    new.workspace_id, cp.user_id, new.user_id, 'dm',
    coalesce(v_actor_name, 'Someone') || ' sent you a message',
    left(new.body, 280),
    new.conversation_id, new.id
  from public.conversation_participants cp
  where cp.conversation_id = new.conversation_id
    and cp.user_id <> new.user_id
    and cp.deleted_at is null;

  return new;
end;
$$;

create trigger messages_notify_dm
  after insert on public.messages
  for each row execute function public.notify_on_dm();

-- Task assignment → notify the assignee (unless they assigned themselves).
create or replace function public.notify_on_task_assign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_title text;
  v_actor uuid := auth.uid();
  v_actor_name text;
begin
  if new.user_id = v_actor then
    return new;
  end if;

  select p.workspace_id, t.title into v_workspace_id, v_title
  from public.tasks t
  join public.projects p on p.id = t.project_id
  where t.id = new.task_id;

  if v_workspace_id is null then
    return new;
  end if;

  select coalesce(full_name, email) into v_actor_name
  from public.profiles where id = v_actor;

  insert into public.notifications (
    workspace_id, user_id, actor_id, type, title, body, task_id, project_id
  )
  select
    v_workspace_id, new.user_id, v_actor, 'task.assigned',
    coalesce(v_actor_name, 'Someone') || ' assigned you a task',
    coalesce(v_title, ''), new.task_id, t.project_id
  from public.tasks t where t.id = new.task_id;

  return new;
end;
$$;

create trigger task_assignees_notify
  after insert on public.task_assignees
  for each row execute function public.notify_on_task_assign();

-- =============================================================================
-- RPC — mark all of the caller's notifications in a workspace as read
-- =============================================================================
create or replace function public.mark_notifications_read(p_workspace_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and workspace_id = p_workspace_id
    and read_at is null;
$$;

-- =============================================================================
-- Row Level Security — recipients see and update only their own rows.
-- Inserts come from the SECURITY DEFINER triggers above, so no insert policy.
-- =============================================================================
alter table public.notifications enable row level security;

create policy notifications_select on public.notifications
  for select using (user_id = auth.uid());

create policy notifications_update on public.notifications
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notifications_delete on public.notifications
  for delete using (user_id = auth.uid());

-- =============================================================================
-- Realtime
-- =============================================================================
alter publication supabase_realtime add table public.notifications;
