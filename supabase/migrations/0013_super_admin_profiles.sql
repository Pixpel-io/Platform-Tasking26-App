-- 0013: Super admins can read every profile.
--
-- The admin dashboard joins workspace_requests -> profiles to show who asked
-- for a workspace. profiles_select only allows your own profile and people
-- who share a workspace with you, so requesters from outside showed as
-- "Unknown". Widen read access for super admins (read-only; no write change).

drop policy if exists profiles_select on public.profiles;

create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
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
