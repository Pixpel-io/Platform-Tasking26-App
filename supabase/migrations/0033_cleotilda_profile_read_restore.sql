-- =============================================================================
-- 0033 — Restore Cleotilda's profile visibility
--
-- 0023 added a profiles_select exception so everyone can read Cleotilda's bot
-- profile (it's never a workspace_members row). 0027 later rebuilt
-- profiles_select for DM connections and dropped that exception, so the
-- messages->profiles embed resolves to null again and the chat UI falls back to
-- "Unknown" with a "?" avatar for Cleotilda's messages in groups/DMs.
--
-- Re-add the fixed bot id to the policy; everything else matches 0027.
-- =============================================================================

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or id = 'c1e0711d-a000-4000-a000-000000000001'  -- Cleotilda (see 0011)
    or exists (
      select 1
      from public.workspace_members me
      join public.workspace_members them
        on them.workspace_id = me.workspace_id
      where me.user_id = auth.uid()
        and me.deleted_at is null
        and them.user_id = profiles.id
        and them.deleted_at is null
    )
    or public.has_dm_connection(auth.uid(), profiles.id)
  );
