-- =============================================================================
-- Phase 1 — Communication (Groups + DMs)
-- Tasking — Team Collaboration SaaS
--
-- Adds channels (public/private group chats), direct-message conversations
-- (1:1 + group DMs), a unified messages table (threads via self-FK), reactions,
-- attachments, @mentions, and per-user read state. Realtime is enabled on the
-- chat tables so the client can subscribe to Postgres changes directly.
--
-- Same conventions as Phase 0: uuid PKs, created_at/updated_at, soft delete,
-- FKs + indexes, RLS on every table. Access checks live in SECURITY DEFINER
-- helpers so message policies never recurse through membership tables.
-- =============================================================================

-- 'in_call' style reservation for later: message_kind keeps room for system /
-- call-event messages without a future migration.
create type public.message_kind as enum ('user', 'system', 'call_event');

create type public.attachment_kind as enum ('file', 'image', 'video', 'voice');

-- =============================================================================
-- channels — named group chats inside a workspace
-- =============================================================================
create table public.channels (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  description  text,
  is_private   boolean not null default false,
  created_by   uuid not null references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index channels_workspace_id_idx on public.channels (workspace_id);
create index channels_created_by_idx on public.channels (created_by);
create index channels_created_at_idx on public.channels (created_at);

create trigger channels_set_updated_at
  before update on public.channels
  for each row execute function public.set_updated_at();

-- =============================================================================
-- channel_members — explicit membership (required for private channels;
-- public channels are readable by every workspace member regardless)
-- =============================================================================
create table public.channel_members (
  id         uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (channel_id, user_id)
);

create index channel_members_channel_id_idx on public.channel_members (channel_id);
create index channel_members_user_id_idx on public.channel_members (user_id);
create index channel_members_created_at_idx on public.channel_members (created_at);

create trigger channel_members_set_updated_at
  before update on public.channel_members
  for each row execute function public.set_updated_at();

-- =============================================================================
-- conversations — direct messages (1:1 or group DM) within a workspace
-- =============================================================================
create table public.conversations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  is_group     boolean not null default false,
  -- For 1:1 DMs we store a stable key (sorted uuid pair) so get_or_create is
  -- idempotent and a unique index can prevent duplicate threads.
  dm_key       text,
  created_by   uuid not null references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index conversations_workspace_id_idx on public.conversations (workspace_id);
create index conversations_created_at_idx on public.conversations (created_at);
create unique index conversations_dm_key_uidx
  on public.conversations (workspace_id, dm_key)
  where dm_key is not null;

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- =============================================================================
-- conversation_participants
-- =============================================================================
create table public.conversation_participants (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (conversation_id, user_id)
);

create index conversation_participants_conversation_id_idx
  on public.conversation_participants (conversation_id);
create index conversation_participants_user_id_idx
  on public.conversation_participants (user_id);
create index conversation_participants_created_at_idx
  on public.conversation_participants (created_at);

create trigger conversation_participants_set_updated_at
  before update on public.conversation_participants
  for each row execute function public.set_updated_at();

-- =============================================================================
-- messages — unified across channels and conversations; threads via parent_id
-- =============================================================================
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  channel_id      uuid references public.channels (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete cascade,
  parent_id       uuid references public.messages (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete restrict,
  kind            public.message_kind not null default 'user',
  body            text not null default '',
  body_tsv        tsvector generated always as (to_tsvector('english', coalesce(body, ''))) stored,
  edited_at       timestamptz,
  pinned_at       timestamptz,
  pinned_by       uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  -- A message lives in exactly one place: a channel or a conversation.
  constraint messages_target_chk check (
    (channel_id is not null and conversation_id is null)
    or (channel_id is null and conversation_id is not null)
  )
);

create index messages_channel_id_created_at_idx
  on public.messages (channel_id, created_at);
create index messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at);
create index messages_parent_id_idx on public.messages (parent_id);
create index messages_user_id_idx on public.messages (user_id);
create index messages_created_at_idx on public.messages (created_at);
create index messages_body_tsv_idx on public.messages using gin (body_tsv);

create trigger messages_set_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();

-- =============================================================================
-- message_reactions
-- =============================================================================
create table public.message_reactions (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index message_reactions_message_id_idx on public.message_reactions (message_id);
create index message_reactions_user_id_idx on public.message_reactions (user_id);

-- =============================================================================
-- message_attachments — metadata; bytes live in Supabase Storage
-- =============================================================================
create table public.message_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.messages (id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  kind         public.attachment_kind not null default 'file',
  width        integer,
  height       integer,
  duration_ms  integer,
  created_at   timestamptz not null default now()
);

create index message_attachments_message_id_idx
  on public.message_attachments (message_id);

-- =============================================================================
-- message_mentions — @mentions, drives notifications later
-- =============================================================================
create table public.message_mentions (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.messages (id) on delete cascade,
  mentioned_id uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (message_id, mentioned_id)
);

create index message_mentions_message_id_idx on public.message_mentions (message_id);
create index message_mentions_mentioned_id_idx on public.message_mentions (mentioned_id);

-- =============================================================================
-- read_state — per-user last-read marker per channel or conversation
-- =============================================================================
create table public.read_state (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles (id) on delete cascade,
  channel_id           uuid references public.channels (id) on delete cascade,
  conversation_id      uuid references public.conversations (id) on delete cascade,
  last_read_at         timestamptz not null default now(),
  last_read_message_id uuid references public.messages (id) on delete set null,
  updated_at           timestamptz not null default now(),
  constraint read_state_target_chk check (
    (channel_id is not null and conversation_id is null)
    or (channel_id is null and conversation_id is not null)
  )
);

create unique index read_state_user_channel_uidx
  on public.read_state (user_id, channel_id) where channel_id is not null;
create unique index read_state_user_conversation_uidx
  on public.read_state (user_id, conversation_id) where conversation_id is not null;

create trigger read_state_set_updated_at
  before update on public.read_state
  for each row execute function public.set_updated_at();

-- =============================================================================
-- SECURITY DEFINER access helpers (avoid RLS recursion)
-- =============================================================================
create or replace function public.is_channel_member(p_channel_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.channel_members cm
    where cm.channel_id = p_channel_id
      and cm.user_id = auth.uid()
      and cm.deleted_at is null
  );
$$;

-- Can the current user read a channel? Public channels: any workspace member.
-- Private channels: explicit members only.
create or replace function public.can_access_channel(p_channel_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.channels c
    where c.id = p_channel_id
      and c.deleted_at is null
      and public.is_workspace_member(c.workspace_id)
      and (c.is_private = false or public.is_channel_member(c.id))
  );
$$;

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id = auth.uid()
      and cp.deleted_at is null
  );
$$;

-- =============================================================================
-- RPCs
-- =============================================================================

-- Create a channel and seat the creator as a member. Returns the channel id.
create or replace function public.create_channel(
  p_workspace_id uuid,
  p_name text,
  p_description text default null,
  p_is_private boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_channel_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of this workspace';
  end if;

  insert into public.channels (workspace_id, name, description, is_private, created_by)
  values (p_workspace_id, p_name, nullif(trim(p_description), ''), coalesce(p_is_private, false), v_uid)
  returning id into v_channel_id;

  insert into public.channel_members (channel_id, user_id)
  values (v_channel_id, v_uid);

  return v_channel_id;
end;
$$;

-- Get (or create) the 1:1 DM between the caller and another workspace member.
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
  if v_uid = p_other_user_id then
    raise exception 'cannot DM yourself';
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

  -- Stable key independent of who initiates.
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

  insert into public.conversation_participants (conversation_id, user_id)
  values (v_conv_id, v_uid), (v_conv_id, p_other_user_id);

  return v_conv_id;
end;
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.channels                  enable row level security;
alter table public.channel_members           enable row level security;
alter table public.conversations             enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages                  enable row level security;
alter table public.message_reactions         enable row level security;
alter table public.message_attachments       enable row level security;
alter table public.message_mentions          enable row level security;
alter table public.read_state                enable row level security;

-- ---- channels -------------------------------------------------------------
create policy channels_select on public.channels
  for select using (
    public.is_workspace_member(workspace_id)
    and (is_private = false or public.is_channel_member(id))
  );

create policy channels_insert on public.channels
  for insert with check (
    created_by = auth.uid() and public.is_workspace_member(workspace_id)
  );

create policy channels_update_admin on public.channels
  for update using (
    public.is_workspace_admin(workspace_id) or created_by = auth.uid()
  ) with check (
    public.is_workspace_admin(workspace_id) or created_by = auth.uid()
  );

-- ---- channel_members ------------------------------------------------------
create policy channel_members_select on public.channel_members
  for select using (public.can_access_channel(channel_id));

-- A workspace member can add themselves to a public channel; admins/channel
-- creators can add anyone. (For private channels, joining is by being added.)
create policy channel_members_insert on public.channel_members
  for insert with check (
    (
      user_id = auth.uid()
      and exists (
        select 1 from public.channels c
        where c.id = channel_id
          and c.is_private = false
          and public.is_workspace_member(c.workspace_id)
      )
    )
    or exists (
      select 1 from public.channels c
      where c.id = channel_id
        and (public.is_workspace_admin(c.workspace_id) or c.created_by = auth.uid())
    )
  );

create policy channel_members_delete on public.channel_members
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.channels c
      where c.id = channel_id
        and (public.is_workspace_admin(c.workspace_id) or c.created_by = auth.uid())
    )
  );

-- ---- conversations --------------------------------------------------------
create policy conversations_select on public.conversations
  for select using (public.is_conversation_participant(id));

create policy conversations_insert on public.conversations
  for insert with check (
    created_by = auth.uid() and public.is_workspace_member(workspace_id)
  );

-- ---- conversation_participants --------------------------------------------
create policy conversation_participants_select on public.conversation_participants
  for select using (public.is_conversation_participant(conversation_id));

create policy conversation_participants_insert on public.conversation_participants
  for insert with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = auth.uid()
    )
  );

create policy conversation_participants_delete on public.conversation_participants
  for delete using (user_id = auth.uid());

-- ---- messages -------------------------------------------------------------
create policy messages_select on public.messages
  for select using (
    (channel_id is not null and public.can_access_channel(channel_id))
    or (conversation_id is not null and public.is_conversation_participant(conversation_id))
  );

create policy messages_insert on public.messages
  for insert with check (
    user_id = auth.uid()
    and (
      (channel_id is not null and public.can_access_channel(channel_id))
      or (conversation_id is not null and public.is_conversation_participant(conversation_id))
    )
  );

-- Authors edit/soft-delete their own messages; workspace admins can moderate;
-- anyone with access can pin (pin columns are still bounded by the access
-- check on the row they can already see).
create policy messages_update on public.messages
  for update using (
    user_id = auth.uid()
    or public.is_workspace_admin(workspace_id)
    or (channel_id is not null and public.can_access_channel(channel_id))
    or (conversation_id is not null and public.is_conversation_participant(conversation_id))
  ) with check (
    user_id = auth.uid()
    or public.is_workspace_admin(workspace_id)
    or (channel_id is not null and public.can_access_channel(channel_id))
    or (conversation_id is not null and public.is_conversation_participant(conversation_id))
  );

-- ---- message_reactions ----------------------------------------------------
create policy message_reactions_select on public.message_reactions
  for select using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and (
          (m.channel_id is not null and public.can_access_channel(m.channel_id))
          or (m.conversation_id is not null and public.is_conversation_participant(m.conversation_id))
        )
    )
  );

create policy message_reactions_insert on public.message_reactions
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and (
          (m.channel_id is not null and public.can_access_channel(m.channel_id))
          or (m.conversation_id is not null and public.is_conversation_participant(m.conversation_id))
        )
    )
  );

create policy message_reactions_delete on public.message_reactions
  for delete using (user_id = auth.uid());

-- ---- message_attachments --------------------------------------------------
create policy message_attachments_select on public.message_attachments
  for select using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and (
          (m.channel_id is not null and public.can_access_channel(m.channel_id))
          or (m.conversation_id is not null and public.is_conversation_participant(m.conversation_id))
        )
    )
  );

create policy message_attachments_insert on public.message_attachments
  for insert with check (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.user_id = auth.uid()
        and (
          (m.channel_id is not null and public.can_access_channel(m.channel_id))
          or (m.conversation_id is not null and public.is_conversation_participant(m.conversation_id))
        )
    )
  );

-- ---- message_mentions -----------------------------------------------------
create policy message_mentions_select on public.message_mentions
  for select using (
    mentioned_id = auth.uid()
    or exists (
      select 1 from public.messages m
      where m.id = message_id
        and (
          (m.channel_id is not null and public.can_access_channel(m.channel_id))
          or (m.conversation_id is not null and public.is_conversation_participant(m.conversation_id))
        )
    )
  );

create policy message_mentions_insert on public.message_mentions
  for insert with check (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.user_id = auth.uid()
    )
  );

-- ---- read_state -----------------------------------------------------------
create policy read_state_select on public.read_state
  for select using (user_id = auth.uid());

create policy read_state_insert on public.read_state
  for insert with check (user_id = auth.uid());

create policy read_state_update on public.read_state
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
-- Realtime — broadcast row changes to subscribed clients
-- =============================================================================
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.message_attachments;
alter publication supabase_realtime add table public.channels;
alter publication supabase_realtime add table public.channel_members;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.conversation_participants;
