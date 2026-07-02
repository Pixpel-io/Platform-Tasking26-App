import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { getWorkspaceMembersForChat } from "@/lib/chat";
import { getProjects, PRIORITY_META } from "@/lib/projects";
import type { ProjectStatus } from "@/lib/supabase/types";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/ui";
import { NewProjectButton } from "./projects-client";

const STATUS_META: Record<ProjectStatus, { label: string; className: string; dot: string }> = {
  planning: { label: "Planning", className: "bg-sky-500/10 text-sky-500", dot: "bg-sky-500" },
  active: { label: "Active", className: "bg-success/10 text-success", dot: "bg-success" },
  on_hold: { label: "On hold", className: "bg-amber-500/10 text-amber-500", dot: "bg-amber-500" },
  completed: { label: "Completed", className: "bg-primary/10 text-primary", dot: "bg-primary" },
  archived: { label: "Archived", className: "bg-muted/10 text-muted", dot: "bg-muted" },
};

export default async function ProjectsPage({
  params,
}: PageProps<"/w/[workspaceId]/projects">) {
  const { workspaceId } = await params;
  const user = await requireUser();
  const supabase = await createClient();
  const [projects, members] = await Promise.all([
    getProjects(workspaceId),
    getWorkspaceMembersForChat(workspaceId),
  ]);

  // One query for all boards: per-project done/total counts drive the
  // progress bar on each card.
  const progress = new Map<string, { done: number; total: number }>();
  if (projects.length > 0) {
    const { data: taskRows } = await supabase
      .from("tasks")
      .select("project_id, completed_at")
      .in("project_id", projects.map((p) => p.id))
      .is("deleted_at", null);
    for (const t of taskRows ?? []) {
      const cur = progress.get(t.project_id) ?? { done: 0, total: 0 };
      cur.total += 1;
      if (t.completed_at) cur.done += 1;
      progress.set(t.project_id, cur);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex animate-fade-in-up flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p, i) => {
            const status = STATUS_META[p.status];
            const priority = PRIORITY_META[p.priority];
            const avatars = p.project_members
              .map((m) => m.profiles)
              .filter((m): m is NonNullable<typeof m> => m != null);
            const stats = progress.get(p.id) ?? { done: 0, total: 0 };
            const pct =
              stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
            return (
              <Link
                key={p.id}
                href={`/w/${workspaceId}/projects/${p.id}`}
                style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
                className="hover-glow group relative flex animate-fade-in-up flex-col overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/50"
              >
                <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
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

                <div className="mt-auto pt-5">
                  {stats.total > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-xs text-muted">
                        <span>
                          {stats.done}/{stats.total} tasks
                        </span>
                        <span className="font-medium tabular-nums">{pct}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-linear-to-r from-primary to-primary/70 transition-[width] duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    {avatars.length > 0 ? (
                      <div className="flex -space-x-2">
                        {avatars.slice(0, 4).map((m) => (
                          <Avatar
                            key={m.id}
                            name={m.full_name}
                            email={m.email}
                            avatarUrl={m.avatar_url}
                            size="xs"
                            className="border-2 border-surface"
                          />
                        ))}
                        {avatars.length > 4 && (
                          <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-surface bg-surface-2 text-[10px] font-semibold text-muted">
                            +{avatars.length - 4}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted">No members</span>
                    )}
                    <span className="flex items-center gap-1 text-xs font-medium text-muted transition-colors group-hover:text-primary">
                      Open board
                      <svg
                        className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
