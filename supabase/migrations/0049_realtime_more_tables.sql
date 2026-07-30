-- =============================================================================
-- Publish project_members + workspaces to realtime
-- Tasking — Team Collaboration SaaS
--
-- Client hooks already assume live delivery for these tables:
--   * useProjectsLive subscribes to project_members changes (private-board
--     reveal, roster refresh) - the subscription silently no-op'd because
--     the table wasn't on the publication.
--   * useWorkspacesLive (new) needs `workspaces` to catch renames, colour
--     changes, icon uploads, and soft-deletes so members currently viewing
--     the workspace refresh / get bounced away.
-- =============================================================================

alter publication supabase_realtime add table public.project_members;
alter publication supabase_realtime add table public.workspaces;
