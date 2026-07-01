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
  index = 0,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  index?: number;
}) {
  const body = (
    <div
      style={{ animationDelay: `${index * 60}ms` }}
      className={`group relative h-full animate-fade-in-up overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-sm transition-all duration-200 ${
        href
          ? "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
          : ""
      }`}
    >
      {href && (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      )}
      <p className="text-sm font-medium text-muted">{label}</p>
      <p
        className={`mt-2 text-3xl font-semibold tracking-tight text-foreground transition-colors ${
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
      return `${who} created a project`;
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
      <div className="mx-auto max-w-5xl p-6 sm:p-8">
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
          index={0}
        />
        <StatCard
          label="Active projects"
          value={activeProjects}
          href={`/w/${workspaceId}/projects`}
          index={1}
        />
        <StatCard
          label="Due this week"
          value={dueSoon}
          hint="Tasks due in 7 days"
          href={`/w/${workspaceId}/projects`}
          index={2}
        />
        <StatCard label="Groups" value={channelCount ?? 0} index={3} />
      </div>

      <div className="mt-8 grid animate-fade-in-up gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-surface shadow-sm p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-foreground">
            Recent activity
          </h2>
          {activity.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              No activity yet. Create a project to get started.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {activity.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-surface-2"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{activityText(a)}</p>
                    <p className="text-xs text-muted">
                      {timeAgo(a.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface shadow-sm p-6">
          <h2 className="text-lg font-semibold text-foreground">Quick links</h2>
          <div className="mt-4 flex flex-col gap-2">
            <Link
              href={`/w/${workspaceId}/projects`}
              className="rounded-lg bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground shadow-sm transition-all duration-150 hover:opacity-90 hover:shadow-md hover:shadow-primary/20 active:scale-[0.98]"
            >
              View projects
            </Link>
            <Link
              href={`/w/${workspaceId}/settings/members`}
              className="rounded-lg border border-border px-4 py-2 text-center text-sm font-medium text-foreground transition-all duration-150 hover:border-primary/40 hover:bg-surface-2 active:scale-[0.98]"
            >
              Invite your team
            </Link>
            <Link
              href={`/w/${workspaceId}/profile`}
              className="rounded-lg border border-border px-4 py-2 text-center text-sm font-medium text-foreground transition-all duration-150 hover:border-primary/40 hover:bg-surface-2 active:scale-[0.98]"
            >
              Edit your profile
            </Link>
          </div>
          {(pendingInvites ?? 0) > 0 && (
            <p className="mt-4 text-xs text-muted">
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
