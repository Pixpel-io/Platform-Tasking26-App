import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getWorkspaceMembersForChat } from "@/lib/chat";
import { getProjects, PRIORITY_META } from "@/lib/projects";
import type { ProjectStatus } from "@/lib/supabase/types";
import { EmptyState } from "@/components/ui";
import { NewProjectButton } from "./projects-client";

const STATUS_META: Record<ProjectStatus, { label: string; className: string }> = {
  planning: { label: "Planning", className: "bg-sky-500/10 text-sky-500" },
  active: { label: "Active", className: "bg-success/10 text-success" },
  on_hold: { label: "On hold", className: "bg-amber-500/10 text-amber-500" },
  completed: { label: "Completed", className: "bg-primary/10 text-primary" },
  archived: { label: "Archived", className: "bg-muted/10 text-muted" },
};

export default async function ProjectsPage({
  params,
}: PageProps<"/w/[workspaceId]/projects">) {
  const { workspaceId } = await params;
  const user = await requireUser();
  const [projects, members] = await Promise.all([
    getProjects(workspaceId),
    getWorkspaceMembersForChat(workspaceId),
  ]);

  return (
    <div className="mx-auto max-w-5xl p-8">
      <header className="mb-6 flex animate-fade-in-up items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Projects
          </h1>
          <p className="mt-1 text-muted">
            Boards you&apos;re a member of in this workspace.
          </p>
        </div>
        <NewProjectButton
          workspaceId={workspaceId}
          members={members}
          meId={user.id}
        />
      </header>

      {projects.length === 0 ? (
        <EmptyState
          icon={
            <svg
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          }
          title="No projects yet"
          description="Create your first project to start tracking tasks on a Kanban board."
          action={
            <NewProjectButton
              workspaceId={workspaceId}
              members={members}
              meId={user.id}
            />
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p, i) => {
            const status = STATUS_META[p.status];
            const priority = PRIORITY_META[p.priority];
            const memberCount = p.project_members.length;
            return (
              <Link
                key={p.id}
                href={`/w/${workspaceId}/projects/${p.id}`}
                style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
                className="hover-glow group relative flex animate-fade-in-up flex-col overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/50"
              >
                <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
                  >
                    {status.label}
                  </span>
                  <span className={`flex items-center gap-1 text-xs ${priority.color}`}>
                    <span className={`h-2 w-2 rounded-full ${priority.dot}`} />
                    {priority.label}
                  </span>
                </div>
                <h2 className="mt-3 font-semibold text-foreground transition-colors group-hover:text-primary">
                  {p.name}
                </h2>
                {p.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted">
                    {p.description}
                  </p>
                )}
                <div className="mt-auto pt-4 text-xs text-muted">
                  {memberCount} member{memberCount === 1 ? "" : "s"}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
