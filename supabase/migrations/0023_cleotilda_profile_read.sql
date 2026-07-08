-- 0023: Everyone can read Cleotilda's profile.
--
-- Cleotilda posts messages via the cleotilda_post_message RPC but is never a
-- workspace_members row, so profiles_select (self / super admin / shared
-- workspace) filtered the bot's profile out. The messages->profiles embed
-- resolved to null and the chat UI fell back to "Unknown" with a "?" avatar.
-- Allow the fixed bot id through (read-only; no write change).

drop policy if exists profiles_select on public.profiles;

create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or id = 'c1e0711d-a000-4000-a000-000000000001'  -- Cleotilda (see 0011)
    or public.is_super_admin()
    or exists (
      select 1
      from public.workspace_members me
      join public.workspace_members them
        on me.workspace_id = them.workspace_id
      where me.user_id = auth.uid()
        and me.deleted_at is null
        and them.user_id = profiles.id
        and them.deleted_at is null
    )
  );
