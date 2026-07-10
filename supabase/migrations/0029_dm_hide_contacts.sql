-- =============================================================================
-- 0029 — Remove a person from YOUR DM list (Slack's "close conversation")
--
-- One-sided: hiding someone only removes them from the hider's roster - the
-- other person's list, the conversation and its history are untouched. A new
-- message from the hidden person automatically restores them (trigger below),
-- and explicitly opening a DM with them (profile card → Message) unhides too.
-- =============================================================================

create table public.dm_hidden_contacts (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  hidden_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (user_id, hidden_user_id)
);

alter table public.dm_hidden_contacts enable row level security;

-- Strictly personal rows: you manage only your own hide list.
create policy dm_hidden_select on public.dm_hidden_contacts
  for select using (user_id = auth.uid());
create policy dm_hidden_insert on public.dm_hidden_contacts
  for insert with check (user_id = auth.uid());
create policy dm_hidden_delete on public.dm_hidden_contacts
  for delete using (user_id = auth.uid());

-- A new top-level DM message from a hidden person restores them on the
-- recipient's list, so hiding can never silently eat conversations.
create or replace function public.unhide_on_dm_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.conversation_id is null or new.parent_id is not null then
    return new;
  end if;

  delete from public.dm_hidden_contacts h
  using public.conversation_participants cp
  where cp.conversation_id = new.conversation_id
    and cp.user_id <> new.user_id
    and cp.deleted_at is null
    and h.user_id = cp.user_id
    and h.hidden_user_id = new.user_id;

  return new;
end;
$$;

drop trigger if exists messages_unhide_dm on public.messages;
create trigger messages_unhide_dm
  after insert on public.messages
  for each row execute function public.unhide_on_dm_message();

-- =============================================================================
-- Blocking: a blocked user cannot send you DMs at all (DB-enforced).
-- One-sided rows; either direction of a block stops NEW messages in the pair's
-- DM. History stays readable. Blocker's roster hides the blocked person; the
-- unhide-on-message trigger can't fire for them since their sends are refused.
-- =============================================================================

create table public.dm_blocks (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  blocked_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (user_id, blocked_user_id),
  constraint dm_blocks_not_self check (user_id <> blocked_user_id)
);

alter table public.dm_blocks enable row level security;

-- You manage your own block list. The blocked person is NOT told (no select).
create policy dm_blocks_select on public.dm_blocks
  for select using (user_id = auth.uid());
create policy dm_blocks_insert on public.dm_blocks
  for insert with check (user_id = auth.uid());
create policy dm_blocks_delete on public.dm_blocks
  for delete using (user_id = auth.uid());

-- Is messaging blocked between two users, in either direction?
create or replace function public.is_dm_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.dm_blocks
    where (user_id = p_a and blocked_user_id = p_b)
       or (user_id = p_b and blocked_user_id = p_a)
  );
$$;

-- Refuse new DM messages between blocked pairs at the source of truth.
create or replace function public.enforce_dm_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.conversation_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id
      and cp.user_id <> new.user_id
      and cp.deleted_at is null
      and public.is_dm_blocked(new.user_id, cp.user_id)
  ) then
    raise exception 'messaging is blocked between these users';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_enforce_dm_block on public.messages;
create trigger messages_enforce_dm_block
  before insert on public.messages
  for each row execute function public.enforce_dm_block();

-- get_or_create_dm also refuses blocked pairs (no new thread either).
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

  if public.is_dm_blocked(v_uid, p_other_user_id) then
    raise exception 'messaging is blocked between these users';
  end if;

  if not exists (
    select 1
    from public.workspace_members me
    join public.workspace_members them
      on them.workspace_id = me.workspace_id
    join public.workspaces w on w.id = me.workspace_id
    where me.user_id = v_uid and me.deleted_at is null
      and them.user_id = p_other_user_id and them.deleted_at is null
      and w.deleted_at is null
  ) and not public.has_dm_connection(v_uid, p_other_user_id) then
    raise exception 'no shared workspace or DM connection with this user';
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
