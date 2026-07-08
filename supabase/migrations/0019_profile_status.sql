-- =============================================================================
-- 0019 — Slack-style custom status on profiles
--
-- A status is an emoji + short text with an optional expiry ("In a meeting,
-- clears in 1 hour"). Stored on the profile so it shows everywhere the person
-- appears. Expiry is enforced at read time (clients hide a lapsed status);
-- no cron needed.
-- =============================================================================

alter table public.profiles
  add column if not exists status_emoji text,
  add column if not exists status_text text,
  add column if not exists status_expires_at timestamptz;

-- Status changes (and avatar/name edits) should reach open clients live.
do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception
  when duplicate_object then null;
end;
$$;
