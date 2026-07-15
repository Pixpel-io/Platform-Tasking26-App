-- =============================================================================
-- 0038 — Inline quoted replies (Slack/WhatsApp-style)
--
-- A message can now reference another message it replies to. Unlike parent_id
-- (which powers side-panel THREADS and pulls a message OUT of the main list),
-- reply_to_id keeps the reply in the main conversation flow and just renders a
-- quote of the original above it. The two are independent on purpose.
--
-- on delete set null: if the quoted original is deleted, the reply survives and
-- simply loses its quote (matches Slack - the reply text stays).
-- =============================================================================

alter table public.messages
  add column if not exists reply_to_id uuid
    references public.messages (id) on delete set null;

create index if not exists messages_reply_to_id_idx
  on public.messages (reply_to_id);

-- PostgREST caches the schema (incl. FK relationships used for embeds). The new
-- self-join FK powers the `reply_to:messages!messages_reply_to_id_fkey(...)`
-- embed, so nudge PostgREST to reload or that embed 404s until the next reload.
notify pgrst, 'reload schema';
