import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { getWorkspaceMembersForChat } from "@/lib/chat";
import { getProject, PRIORITY_META } from "@/lib/projects";
import { ProjectViewTabs } from "./project-view-tabs";
import { DeleteProjectButton } from "./delete-project-button";
import { BoardMembersButton } from "./board-members-button";
import { AutoMarkProjectRead } from "./auto-mark-read";

export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<"/w/[workspaceId]/projects/[projectId]">) {
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

  const priority = PRIORITY_META[project.priority];
  const base = `/w/${workspaceId}/projects/${projectId}`;
  const canManage =
    project.owner_id === user.id ||
    me?.role === "owner" ||
    me?.role === "admin";

  const boardMembers = project.project_members
    .map((m) => m.profiles)
    .filter((p): p is NonNullable<typeof p> => p != null);
  const boardMemberIds = new Set(boardMembers.map((m) => m.id));
  const addableMembers = workspaceMembers.filter(
    (m) => !boardMemberIds.has(m.id),
  );

  return (
    <div className="flex h-full flex-col">
      <AutoMarkProjectRead workspaceId={workspaceId} projectId={projectId} />
      <header className="border-b border-border bg-surface px-6 pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href={`/w/${workspaceId}/projects`}
                className="text-sm text-muted hover:text-foreground"
              >
                Task Boards
              </Link>
              <span className="text-muted">/</span>
              <h1 className="truncate text-lg font-semibold text-foreground">
                {project.name}
              </h1>
            </div>
            {project.description && (
              <p className="mt-0.5 truncate text-sm text-muted">
                {project.description}
              </p>
            )}
          </div>
          {/* Right padding clears the fixed search/bell overlay on desktop. */}
          <div className="flex shrink-0 items-center gap-2 lg:pr-24">
            <span
              className={`flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium ${priority.color}`}
            >
              <span className={`h-2 w-2 rounded-full ${priority.dot}`} />
              {priority.label}
            </span>
            {canManage && (
              <BoardMembersButton
                workspaceId={workspaceId}
                projectId={projectId}
                ownerId={project.owner_id}
                members={boardMembers}
                addable={addableMembers}
              />
            )}
            <DeleteProjectButton
              workspaceId={workspaceId}
              projectId={projectId}
              projectName={project.name}
            />
          </div>
        </div>
        <ProjectViewTabs base={base} />
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
