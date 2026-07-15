import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { getWorkspaceMembersForChat } from "@/lib/chat";
import { getProject } from "@/lib/projects";
import { BoardMembersManager } from "./board-members-manager";

export default async function ProjectSettingsPage({
  params,
}: PageProps<"/w/[workspaceId]/projects/[projectId]/settings">) {
  const { workspaceId, projectId } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const [project, workspaceMembers, { data: me }] = await Promise.all([
    getProject(projectId),
    getWorkspaceMembersForChat(workspaceId),
    supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single(),
  ]);

  if (!project) notFound();

  const isOwner = project.owner_id === user.id;
  const isAdmin = me?.role === "owner" || me?.role === "admin";
  // Only the board owner or a workspace admin manages membership. Everyone else
  // can view the board but has no business on its settings page.
  if (!isOwner && !isAdmin) {
    redirect(`/w/${workspaceId}/projects/${projectId}`);
  }

  const members = project.project_members
    .map((m) => m.profiles)
    .filter((p): p is NonNullable<typeof p> => p != null);
  const memberIds = new Set(members.map((m) => m.id));
  const addable = workspaceMembers.filter((m) => !memberIds.has(m.id));

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6 animate-fade-in-up">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Board settings
        </h1>
        <p className="mt-1 text-muted">
          Manage who can see and work on this board.
        </p>
      </header>

      <BoardMembersManager
        workspaceId={workspaceId}
        projectId={projectId}
        ownerId={project.owner_id}
        members={members}
        addable={addable}
      />
    </div>
  );
}
