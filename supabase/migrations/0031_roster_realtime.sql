-- =============================================================================
-- 0031 — Live DM roster updates
--
-- When someone accepts a workspace invitation (workspace_members insert) or a
-- personal DM invite (dm_connections insert), both sides' DM contact lists
-- must update without a page reload. Publish both tables; the sidebar hooks
-- refresh the roster on any event they're authorized to see.
--
-- RLS note: workspace_members select policy already lets members see rows of
-- their own workspaces, so an accepted invite's insert reaches existing
-- members live. dm_connections select covers both people in the pair.
-- =============================================================================

do $$
begin
  alter publication supabase_realtime add table public.workspace_members;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.dm_connections;
exception
  when duplicate_object then null;
end;
$$;
