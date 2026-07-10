-- =============================================================================
-- 0028 — DMs for users with no workspace
--
-- A DM-invited user may belong to zero workspaces, yet must be able to read
-- and send in their connected threads (the global /dm shell). Two columns
-- still assumed a workspace on every row:
--
--   messages.workspace_id       → nullable; global DM messages carry null
--   notifications.workspace_id  → nullable; DM notifications for recipients
--                                 with no workspace carry null (the client
--                                 links them to /dm/{conversation})
-- =============================================================================

alter table public.messages
  alter column workspace_id drop not null;

alter table public.notifications
  alter column workspace_id drop not null;

-- notify_on_dm: recipients with no workspace still get the notification row
-- (workspace_id null); the client routes those to the global /dm shell.
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
    coalesce(
      -- Sender's workspace when the recipient is also a member of it...
      (select wm.workspace_id from public.workspace_members wm
       where wm.workspace_id = new.workspace_id
         and wm.user_id = cp.user_id and wm.deleted_at is null),
      -- ...otherwise any active workspace of the recipient (null when the
      -- recipient has none - the global /dm shell handles those).
      (select wm.workspace_id from public.workspace_members wm
       join public.workspaces w on w.id = wm.workspace_id and w.deleted_at is null
       where wm.user_id = cp.user_id and wm.deleted_at is null
       order by wm.created_at limit 1)
    ),
    cp.user_id, new.user_id, 'dm',
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
