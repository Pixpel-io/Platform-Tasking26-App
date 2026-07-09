import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { getProjects, getWorkspaceActivity } from "@/lib/projects";
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
  const profile = await getProfile();
  const supabase = await createClient();

  const inSevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [
    { count: memberCount },
    { count: channelCount },
    { count: pendingInvites },
    projects,
    activity,
  ] = await Promise.all([
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
    getProjects(workspaceId),
    getWorkspaceActivity(workspaceId),
  ]);

  const activeProjects = projects.filter(
    (p) => p.status === "active" || p.status === "planning",
  ).length;

  const projectIds = projects.map((p) => p.id);
  let dueSoon = 0;
  if (projectIds.length > 0) {
    const { count } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .in("project_id", projectIds)
      .is("deleted_at", null)
      .is("completed_at", null)
      .not("due_date", "is", null)
      .lte("due_date", inSevenDays);
    dueSoon = count ?? 0;
  }

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
