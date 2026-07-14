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

function StatCard({
  label,
  value,
  hint,
  href,
  icon,
  index = 0,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  icon: string;
  index?: number;
}) {
  const body = (
    <div
      style={{ animationDelay: `${index * 60}ms` }}
      className={`group relative h-full animate-fade-in-up overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-sm transition-all duration-200 ${
        href
          ? "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
          : ""
      }`}
    >
      {href && (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      )}
      {/* Faint accent bloom in the corner, brighter on hover. */}
      <span className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/10 blur-2xl transition-opacity duration-300 group-hover:opacity-100 opacity-0" />
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-linear-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-inset ring-primary/10 transition-transform duration-200 group-hover:scale-110">
          <svg
            className="h-4.5 w-4.5"
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
      </div>
      <p
        className={`mt-1 text-3xl font-semibold tracking-tight text-foreground transition-colors ${
          href ? "group-hover:text-primary" : ""
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
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

// Short due-date chip ("Overdue", "Today", "Mar 5") for the cross-workspace
// task list. dateOnly is a YYYY-MM-DD string (no time component).
function dueLabel(dateOnly: string | null): { text: string; chip: string } {
  if (!dateOnly)
    return { text: "No due date", chip: "bg-surface-2 text-muted" };
  const today = new Date().toISOString().slice(0, 10);
  if (dateOnly < today)
    return { text: "Overdue", chip: "bg-danger/10 text-danger" };
  if (dateOnly === today)
    return { text: "Today", chip: "bg-amber-500/10 text-amber-500" };
  const d = new Date(`${dateOnly}T00:00:00`);
  return {
    text: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    chip: "bg-surface-2 text-muted",
  };
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
    getWorkspaceActivity(workspaceId),
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
            <div className="flex items-center gap-2 text-sm">
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
            {workspaceGroups.map((g) => {
              const isCurrent = g.id === workspaceId;
              return (
                <section
                  key={g.id}
                  className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
                >
                  <div
                    className="flex items-center gap-3 border-b border-border/70 px-4 py-3"
                    style={{
                      backgroundImage: `linear-gradient(to right, ${g.accent}14, transparent)`,
                    }}
                  >
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-semibold text-white shadow-sm"
                      style={{ backgroundColor: g.accent }}
                    >
                      {g.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {g.name}
                        </span>
                        {isCurrent && (
                          <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            current workspace
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-muted">
                        {g.open === 0
                          ? "No open tasks for you"
                          : `${g.open} open task${g.open === 1 ? "" : "s"}`}
                        {g.overdue > 0 && (
                          <span className="font-medium text-danger">
                            {" "}
                            · {g.overdue} overdue
                          </span>
                        )}
                      </span>
                    </span>
                    {g.unread > 0 && (
                      <Link
                        href={`/w/${g.id}/notifications`}
                        className="flex shrink-0 items-center gap-1.5 rounded-full bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger transition-colors hover:bg-danger/20"
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
                          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                        {g.unread > 99 ? "99+" : g.unread} unread
                      </Link>
                    )}
                    {!isCurrent && (
                      <Link
                        href={`/w/${g.id}`}
                        className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-primary/40 hover:text-primary"
                      >
                        Open
                      </Link>
                    )}
                  </div>

                  {g.tasks.length > 0 && (
                    <ul className="divide-y divide-border/50">
                      {g.tasks.slice(0, 4).map((t) => {
                        const due = dueLabel(t.due_date);
                        return (
                          <li key={t.id}>
                            <Link
                              href={`/w/${t.workspace_id}/projects/${t.project_id}`}
                              className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-primary/5"
                            >
                              <svg
                                className="h-4 w-4 shrink-0 text-muted"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                              </svg>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-foreground group-hover:text-primary">
                                  {t.title}
                                </span>
                                <span className="block truncate text-xs text-muted">
                                  {t.project_name}
                                </span>
                              </span>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${due.chip}`}
                              >
                                {due.text}
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
                          </li>
                        );
                      })}
                      {g.tasks.length > 4 && (
                        <li>
                          <Link
                            href={`/w/${g.id}/projects`}
                            className="block px-4 py-2 text-xs font-medium text-muted transition-colors hover:bg-primary/5 hover:text-primary"
                          >
                            View all {g.tasks.length} tasks →
                          </Link>
                        </li>
                      )}
                    </ul>
                  )}
                </section>
              );
            })}
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Members"
          value={memberCount ?? 0}
          href={`/w/${workspaceId}/settings/members`}
          icon="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
          index={0}
        />
        <StatCard
          label="Active boards"
          value={activeProjects}
          href={`/w/${workspaceId}/projects`}
          icon="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
          index={1}
        />
        <StatCard
          label="Due this week"
          value={dueSoon}
          hint="Tasks due in 7 days"
          href={`/w/${workspaceId}/projects`}
          icon="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"
          index={2}
        />
        <StatCard
          label="Groups"
          value={channelCount ?? 0}
          icon="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          index={3}
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
          <h2 className="text-lg font-semibold text-foreground">Quick links</h2>
          <div className="mt-4 flex flex-col gap-2">
            {[
              {
                href: `/w/${workspaceId}/projects`,
                label: "View boards",
                hint: "Boards, lists and calendars",
                icon: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
              },
              {
                href: `/w/${workspaceId}/settings/members`,
                label: "Invite your team",
                hint: "Add people to this workspace",
                icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M19 8v6M22 11h-6",
              },
              {
                href: `/w/${workspaceId}/profile`,
                label: "Edit your profile",
                hint: "Name, photo and status",
                icon: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
              },
            ].map((link) => (
              <Link
                key={link.href + link.label}
                href={link.href}
                className="group flex items-center gap-3 rounded-xl border border-border/70 px-3 py-2.5 transition-all duration-150 hover:-translate-y-px hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm active:scale-[0.99]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-linear-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-inset ring-primary/10 transition-transform duration-150 group-hover:scale-110">
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={link.icon} />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">
                    {link.label}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {link.hint}
                  </span>
                </span>
                <svg
                  className="h-4 w-4 shrink-0 text-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary"
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
          {(pendingInvites ?? 0) > 0 && (
            <p className="mt-4 flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-400">
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
            </p>
          )}
        </section>
      </div>
      </div>
    </div>
  );
}
