-- =============================================================================
-- User notification channels (Telegram first, WhatsApp later)
--
-- Each row is one (user, external channel) binding. `kind` is namespaced so we
-- can add whatsapp/discord later without a schema change. Verification uses a
-- short `link_code` the user embeds in a bot `/start` command - the webhook
-- consumes the code, stores the returned `external_id` (chat_id), stamps
-- verified_at, and clears the code.
--
-- Fanout to the external channel is driven by a Supabase Database Webhook on
-- the `notifications` table (INSERT). Configure once in the Supabase dashboard:
--   Database > Webhooks > New hook
--   - Table: public.notifications
--   - Event: INSERT
--   - URL: https://<your-app>/api/notifications/fanout
--   - HTTP headers: x-fanout-secret: <FANOUT_SECRET from .env>
-- The receiving Next.js route then reads user_notification_channels and
-- dispatches to each enabled channel.
-- =============================================================================

create table if not exists public.user_notification_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('telegram')),
  -- chat_id for Telegram; phone / whatsapp id later. Nullable until the user
  -- completes the /start handshake in the bot.
  external_id text,
  -- One-time random string the user pastes into the bot start command. Cleared
  -- on successful link. Unique so the webhook can look up the row by code
  -- without needing a user hint.
  link_code text unique,
  link_code_expires_at timestamptz,
  verified_at timestamptz,
  -- Per-channel opt-outs. When true (the default), the fanout endpoint sends
  -- these categories to this channel. Task events are off by default because
  -- they can be chatty; the user can turn them on from settings.
  mentions_enabled boolean not null default true,
  dms_enabled boolean not null default true,
  group_messages_enabled boolean not null default true,
  task_events_enabled boolean not null default false,
  -- Anti-flood: how many messages we've dispatched in the current minute
  -- window. Reset on the fanout side; recorded here so a burst of DB inserts
  -- doesn't hammer the Telegram API.
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One binding per (user, kind). If the user re-links Telegram we overwrite
  -- the existing row rather than accumulating stale chat_ids.
  unique (user_id, kind)
);

create index if not exists user_notification_channels_user_idx
  on public.user_notification_channels(user_id);
create index if not exists user_notification_channels_external_idx
  on public.user_notification_channels(kind, external_id)
  where external_id is not null;

alter table public.user_notification_channels enable row level security;

-- A user can see, update (preferences), and delete (disconnect) their own
-- bindings. INSERTs go through a server action so we can generate a link_code
-- server-side; the policy still allows self-insert as a defence in depth.
drop policy if exists "own channels read" on public.user_notification_channels;
create policy "own channels read"
  on public.user_notification_channels for select
  using (auth.uid() = user_id);

drop policy if exists "own channels insert" on public.user_notification_channels;
create policy "own channels insert"
  on public.user_notification_channels for insert
  with check (auth.uid() = user_id);

drop policy if exists "own channels update" on public.user_notification_channels;
create policy "own channels update"
  on public.user_notification_channels for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own channels delete" on public.user_notification_channels;
create policy "own channels delete"
  on public.user_notification_channels for delete
  using (auth.uid() = user_id);

drop trigger if exists user_notification_channels_set_updated_at
  on public.user_notification_channels;
create trigger user_notification_channels_set_updated_at
  before update on public.user_notification_channels
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
