-- =============================================================================
-- 0026 — Global DMs (Phase 1)
--
-- A DM is a conversation between two PEOPLE, not a workspace artifact: the
-- same thread opens no matter which workspace you're in (Slack's model).
--
--   1. conversations.workspace_id becomes nullable; 1:1 DMs use null.
--   2. Duplicate per-workspace threads for the same pair are MERGED into the
--      oldest one: messages, participants, read state and notifications all
--      move to the canonical thread; the duplicates are soft-deleted.
--   3. dm_key becomes globally unique (was unique per workspace).
--   4. get_or_create_dm now requires at least one common active workspace
--      with the other person and returns the single global thread.
--   5. notify_on_dm picks a workspace the RECIPIENT belongs to, so the
--      notification link always opens (the sender's workspace may not be
--      shared).
-- =============================================================================

-- 1. Allow global (workspace-less) conversations.
alter table public.conversations
  alter column workspace_id drop not null;

-- 2. Merge duplicate 1:1 threads (same dm_key across workspaces).
do $$
declare
  v_key text;
  v_keep uuid;
  v_dup uuid;
begin
  for v_key, v_keep in
    select dm_key, (array_agg(id order by created_at))[1]
    from public.conversations
    where dm_key is not null and deleted_at is null
    group by dm_key
    having count(*) > 1
  loop
    for v_dup in
      select id from public.conversations
      where dm_key = v_key and deleted_at is null and id <> v_keep
    loop
      -- Move messages (threads follow their parents automatically).
      update public.messages
      set conversation_id = v_keep
      where conversation_id = v_dup;

      -- Seat any participants the canonical thread is missing.
      insert into public.conversation_participants (conversation_id, user_id)
      select v_keep, cp.user_id
      from public.conversation_participants cp
      where cp.conversation_id = v_dup
      on conflict (conversation_id, user_id) do nothing;

      -- Read state: keep the most recent marker per user on the canonical row.
      update public.read_state ks
      set last_read_at = greatest(ks.last_read_at, ds.last_read_at)
      from public.read_state ds
      where ds.conversation_id = v_dup
        and ks.conversation_id = v_keep
        and ks.user_id = ds.user_id;
      -- Move markers that only existed on the duplicate.
      update public.read_state ds
      set conversation_id = v_keep
      where ds.conversation_id = v_dup
        and not exists (
          select 1 from public.read_state ks
          where ks.conversation_id = v_keep and ks.user_id = ds.user_id
        );
      delete from public.read_state where conversation_id = v_dup;

      -- Notifications follow the canonical thread.
      update public.notifications
      set conversation_id = v_keep
      where conversation_id = v_dup;

      -- Retire the duplicate (clear dm_key so the unique index stays clean).
      update public.conversations
      set dm_key = null, deleted_at = now()
      where id = v_dup;
    end loop;
  end loop;
end;
$$;

-- 3. All surviving 1:1 DMs go global; dm_key is now globally unique.
update public.conversations
set workspace_id = null
where dm_key is not null and deleted_at is null;

drop index if exists conversations_dm_key_uidx;
create unique index conversations_dm_key_uidx
  on public.conversations (dm_key)
  where dm_key is not null and deleted_at is null;

-- 4. get_or_create_dm: global thread, gated on a shared workspace.
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

  -- You can DM anyone you share at least one active workspace with (yourself
  -- included - the self-join trivially matches for the notes-to-self thread).
  if not exists (
    select 1
    from public.workspace_members me
    join public.workspace_members them
      on them.workspace_id = me.workspace_id
    join public.workspaces w on w.id = me.workspace_id
    where me.user_id = v_uid and me.deleted_at is null
      and them.user_id = p_other_user_id and them.deleted_at is null
      and w.deleted_at is null
  ) then
    raise exception 'no shared workspace with this user';
  end if;

  v_key := least(v_uid::text, p_other_user_id::text) || ':' ||
           greatest(v_uid::text, p_other_user_id::text);

  select id into v_conv_id
  from public.conversations
  where dm_key = v_key and deleted_at is null
  limit 1;

  if v_conv_id is not null then
    return v_conv_id;
  end if;

  insert into public.conversations (workspace_id, is_group, dm_key, created_by)
  values (null, false, v_key, v_uid)
  returning id into v_conv_id;

  insert into public.conversation_participants (conversation_id, user_id)
  select v_conv_id, u
  from (select distinct unnest(array[v_uid, p_other_user_id]) as u) users;

  return v_conv_id;
end;
$$;

-- 5. DM notifications: land in a workspace the recipient can actually open.
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
      -- ...otherwise any active workspace of the recipient.
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
