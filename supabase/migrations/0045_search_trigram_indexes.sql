-- =============================================================================
-- Trigram indexes for the global search — turn 10-second scans into ~50 ms
-- Tasking — Team Collaboration SaaS
--
-- The header search hits messages.body / tasks.title / tasks.description with
-- ILIKE '%needle%'. Without an index Postgres does a per-row scan, so a
-- workspace with a few thousand messages takes ~10 s. pg_trgm's GIN indexes
-- convert those into an index lookup and drop latency to tens of ms.
-- =============================================================================

create extension if not exists pg_trgm;

-- Messages: only user-authored, non-deleted bodies. Partial predicate keeps
-- the index tiny (system messages / soft-deleted rows never surface in search).
create index if not exists messages_body_trgm_idx
  on public.messages
  using gin (body gin_trgm_ops)
  where kind = 'user' and deleted_at is null;

create index if not exists tasks_title_trgm_idx
  on public.tasks
  using gin (title gin_trgm_ops)
  where deleted_at is null;

create index if not exists tasks_description_trgm_idx
  on public.tasks
  using gin (description gin_trgm_ops)
  where deleted_at is null and description is not null;

notify pgrst, 'reload schema';
