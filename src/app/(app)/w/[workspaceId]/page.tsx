import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMyWorkspaces, getProfile } from "@/lib/auth";
import {
  getMyOpenTasksAcrossWorkspaces,
  getProjects,
  getWorkspaceActivity,
} from "@/lib/projects";
import { getUnreadCountsByWorkspace } from "@/lib/notifications";
import { normalizeColor } from "@/lib/workspace-theme";
import type { ActivityLog, Profile } from "@/lib/supabase/types";
import { WorkspaceGroupCard } from "./workspace-group-card";

// One quiet cell in the workspace stat strip - the combined "My work" section
// above carries the visual weight, so these stay compact.
function StatCell({
  label,
  value,
  href,
  icon,
}: {
  label: string;
  value: string | number;
  href?: string;
  icon: string;
}) {
  const inner = (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-linear-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-inset ring-primary/10">
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={icon} />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-semibold tracking-tight text-foreground">
          {value}
        </span>
        <span className="block truncate text-xs text-muted">{label}</span>
      </span>
    </>
  );
  return href ? (
    <Link
      href={href}
      prefetch={true}
      className="flex items-center gap-3 bg-surface px-4 py-3.5 transition-colors hover:bg-primary/5"
    >
      {inner}
    </Link>
  ) : (
    <div className="flex items-center gap-3 bg-surface px-4 py-3.5">{inner}</div>
  );
}

function activityText(a: ActivityLog & { profiles: Profile | null }): string {
  const who = a.profiles?.full_name ?? a.profiles?.email ?? "Someone";
  const meta = a.meta as { title?: string };
  switch (a.verb) {
    case "project.created":
      return `${who} created a board`;
    case "task.created":
      return `${who} created task “${meta.title ?? "Untitled"}”`;
    case "task.completed":
      return `${who} completed a task`;
    case "task.moved":
      return `${who} moved a task`;
    case "task.deleted":
      return `${who} deleted a task`;
    default:
      return `${who} · ${a.verb}`;
  }
}

// Icon + tint per activity verb so the feed can be scanned at a glance.
function activityMeta(verb: string): { icon: string; tint: string } {
  switch (verb) {
    case "project.created":
      return {
        icon: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
        tint: "bg-primary/10 text-primary",
      };
    case "task.completed":
      return { icon: "M20 6 9 17l-5-5", tint: "bg-success/10 text-success" };
    case "task.moved":
      return {
        icon: "M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20",
        tint: "bg-sky-500/10 text-sky-500",
      };
    case "task.deleted":
      return {
        icon: "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
        tint: "bg-danger/10 text-danger",
      };
    default:
      return {
        icon: "M12 5v14M5 12h14",
        tint: "bg-primary/10 text-primary",
      };
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function WorkspaceDashboard({
  params,
}: PageProps<"/w/[workspaceId]">) {
  const { workspaceId } = await params;
  const supabase = await createClient();

  const todayIso = new Date().toISOString().slice(0, 10);
  const inSevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Everything in ONE parallel batch - no serial roundtrips. dueSoon counts
  // via an inner join on projects so it doesn't have to wait for the project
  // list (RLS scopes tasks to projects the user can access either way).
  const [
    profile,
    { count: memberCount },
    { count: channelCount },
    { count: pendingInvites },
    { count: dueSoonCount },
    projects,
    activity,
    workspaces,
    unreadByWorkspace,
    myTasks,
  ] = await Promise.all([
    getProfile(),
    supabase
      .from("workspace_members")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null),
    supabase
      .from("channels")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null),
    supabase
      .from("invites")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "pending"),
    supabase
      .from("tasks")
      .select("id, projects!inner(workspace_id)", {
        count: "exact",
        head: true,
      })
      .eq("projects.workspace_id", workspaceId)
      .is("deleted_at", null)
      .is("completed_at", null)
      .not("due_date", "is", null)
      .lte("due_date", inSevenDays),
    getProjects(workspaceId),
    getWorkspaceActivity(workspaceId, 10),
    getMyWorkspaces(),
    getUnreadCountsByWorkspace(),
    getMyOpenTasksAcrossWorkspaces(),
  ]);

  const activeProjects = projects.filter(
    (p) => p.status === "active" || p.status === "planning",
  ).length;

  // Combined cross-workspace overview - only meaningful when the user belongs
  // to more than one workspace. Assigned tasks are tallied per workspace so
  // the Workspaces summary can show each one's open + overdue load.
  const multiWorkspace = workspaces.length > 1;
  const workspaceNameById = new Map(
    workspaces.map((w) => [w.workspace_id, w.workspaces?.name ?? "Workspace"]),
  );
  // Each workspace's accent color so cross-workspace rows are scannable at a
  // glance (colored bar/dot/tile matching the workspace theme).
  const workspaceColorById = new Map(
    workspaces.map((w) => [
      w.workspace_id,
      normalizeColor(w.workspaces?.color),
    ]),
  );
  // Keep only tasks in workspaces the user still belongs to. Project
  // membership can outlive workspace membership (e.g. seated as an assignee,
  // later removed from the workspace) - linking those would 404 at the
  // workspace layout's membership guard.
  const visibleTasks = myTasks.filter((t) =>
    workspaceNameById.has(t.workspace_id),
  );
  const tasksByWorkspace = new Map<
    string,
    { open: number; overdue: number }
  >();
  for (const t of visibleTasks) {
    const bucket = tasksByWorkspace.get(t.workspace_id) ?? {
      open: 0,
      overdue: 0,
    };
    bucket.open += 1;
    if (t.due_date && t.due_date < todayIso) bucket.overdue += 1;
    tasksByWorkspace.set(t.workspace_id, bucket);
  }
  const overdueTotal = visibleTasks.filter(
    (t) => t.due_date && t.due_date < todayIso,
  ).length;
  const totalUnread = workspaces.reduce(
    (sum, w) => sum + (unreadByWorkspace[w.workspace_id] ?? 0),
    0,
  );
  // One list grouped by workspace (current one first) - the reader never has
  // to switch workspaces to see or open their work; every row deep-links.
  const workspaceGroups = [
    ...workspaces.filter((w) => w.workspace_id === workspaceId),
    ...workspaces.filter((w) => w.workspace_id !== workspaceId),
  ].map((w) => ({
    id: w.workspace_id,
    name: w.workspaces?.name ?? "Workspace",
    accent: workspaceColorById.get(w.workspace_id),
    unread: unreadByWorkspace[w.workspace_id] ?? 0,
    open: tasksByWorkspace.get(w.workspace_id)?.open ?? 0,
    overdue: tasksByWorkspace.get(w.workspace_id)?.overdue ?? 0,
    tasks: visibleTasks.filter((t) => t.workspace_id === w.workspace_id),
  }));

  const dueSoon = dueSoonCount ?? 0;

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";

  return (
    <div className="aurora-bg min-h-full">
      <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
        <header className="mb-8 animate-fade-in-up">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Welcome back, <span className="gradient-text">{firstName}</span>
          </h1>
          <p className="mt-1 text-muted">
            Here&apos;s what&apos;s happening in your workspace.
          </p>
        </header>

      {multiWorkspace && (
        <section className="mb-10 animate-fade-in-up">
          {/* One glance: total work + total unread, everywhere. */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                My work
              </h2>
              <p className="text-sm text-muted">
                Everything assigned to you, from all {workspaces.length}{" "}
                workspaces.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-surface-2 px-3 py-1 font-medium text-foreground">
                {visibleTasks.length} open task
                {visibleTasks.length === 1 ? "" : "s"}
              </span>
              {overdueTotal > 0 && (
                <span className="rounded-full bg-danger/10 px-3 py-1 font-medium text-danger">
                  {overdueTotal} overdue
                </span>
              )}
              {totalUnread > 0 && (
                <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">
                  {totalUnread} unread
                </span>
              )}
            </div>
          </div>

          {/* One card per workspace, current first. Tasks live under their
              workspace header, so nothing needs decoding - and every row
              deep-links, no workspace switching required. */}
          <div className="flex flex-col gap-4">
            {workspaceGroups.map((g) => (
              <WorkspaceGroupCard
                key={g.id}
                group={g}
                isCurrent={g.id === workspaceId}
              />
            ))}
          </div>

          <div className="mt-8 flex items-center gap-3">
            <span className="h-px flex-1 bg-border/70" />
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              This workspace
            </span>
            <span className="h-px flex-1 bg-border/70" />
          </div>
        </section>
      )}

      {/* Compact stat strip - one glanceable row, links where it makes sense. */}
      <div className="grid animate-fade-in-up grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border/50 shadow-sm lg:grid-cols-4">
        <StatCell
          label="Members"
          value={memberCount ?? 0}
          href={`/w/${workspaceId}/settings/members`}
          icon="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
        />
        <StatCell
          label="Active boards"
          value={activeProjects}
          href={`/w/${workspaceId}/projects`}
          icon="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        />
        <StatCell
          label="Due this week"
          value={dueSoon}
          href={`/w/${workspaceId}/projects`}
          icon="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"
        />
        <StatCell
          label="Groups"
          value={channelCount ?? 0}
          icon="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        />
      </div>

      <div className="mt-8 grid animate-fade-in-up gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-surface shadow-sm p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              Recent activity
            </h2>
            {activity.length > 0 && (
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">
                Last {activity.length}
              </span>
            )}
          </div>
          {activity.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              No activity yet. Create a board to get started.
            </p>
          ) : (
            <ul className="relative mt-4">
              {/* Timeline spine connecting the event icons. */}
              <span
                aria-hidden
                className="absolute bottom-3 left-[1.15rem] top-3 w-px bg-border/70"
              />
              {activity.map((a, i) => {
                const meta = activityMeta(a.verb);
                return (
                  <li
                    key={a.id}
                    style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                    className="relative flex animate-fade-in-up items-start gap-3 rounded-xl px-1 py-1.5 transition-colors hover:bg-surface-2/60"
                  >
                    <span
                      className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full ring-4 ring-surface ${meta.tint}`}
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d={meta.icon} />
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-sm text-foreground">
                        {activityText(a)}
                      </p>
                      <p className="text-xs text-muted">
                        {timeAgo(a.created_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-surface shadow-sm p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Boards</h2>
            <Link
              href={`/w/${workspaceId}/projects`}
              prefetch={true}
              className="text-xs font-medium text-muted transition-colors hover:text-primary"
            >
              View all
            </Link>
          </div>
          {projects.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              No boards yet. Create one to start planning work.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {projects.slice(0, 5).map((p) => (
                <Link
                  key={p.id}
                  href={`/w/${workspaceId}/projects/${p.id}`}
                  prefetch={true}
                  className="group flex items-center gap-3 rounded-xl border border-border/70 px-3 py-2.5 transition-all duration-150 hover:-translate-y-px hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-linear-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-inset ring-primary/10">
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">
                      {p.name}
                    </span>
                    <span className="block truncate text-xs capitalize text-muted">
                      {p.status.replace("_", " ")}
                      {p.project_members.length > 0 &&
                        ` · ${p.project_members.length} member${
                          p.project_members.length === 1 ? "" : "s"
                        }`}
                    </span>
                  </span>
                  <svg
                    className="h-4 w-4 shrink-0 text-muted opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100 group-hover:text-primary"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </Link>
              ))}
            </div>
          )}
          {(pendingInvites ?? 0) > 0 && (
            <Link
              href={`/w/${workspaceId}/settings/members`}
              className="mt-4 flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
            >
              <svg
                className="h-3.5 w-3.5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
              </svg>
              {pendingInvites} pending invite
              {pendingInvites === 1 ? "" : "s"}
            </Link>
          )}
        </section>
      </div>
      </div>
    </div>
  );
}
