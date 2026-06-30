import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default async function WorkspaceDashboard({
  params,
}: PageProps<"/w/[workspaceId]">) {
  const { workspaceId } = await params;
  const profile = await getProfile();
  const supabase = await createClient();

  const { count: memberCount } = await supabase
    .from("workspace_members")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  const { count: pendingInvites } = await supabase
    .from("invites")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "pending");

  const { count: channelCount } = await supabase
    .from("channels")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";

  return (
    <div className="mx-auto max-w-5xl p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-muted">
          Here&apos;s what&apos;s happening in your workspace.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Members" value={memberCount ?? 0} />
        <StatCard label="Groups" value={channelCount ?? 0} />
        <StatCard label="Pending invites" value={pendingInvites ?? 0} />
        <StatCard
          label="Active projects"
          value="—"
          hint="Available in Phase 2"
        />
      </div>

      <section className="mt-8 rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">Get started</h2>
        <p className="mt-1 text-sm text-muted">
          Auth, workspaces, members, presence, and real-time chat (groups +
          DMs) are live. Project management lands in Phase 2.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`/w/${workspaceId}/members`}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Invite your team
          </Link>
          <Link
            href={`/w/${workspaceId}/profile`}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-2"
          >
            Edit your profile
          </Link>
        </div>
      </section>
    </div>
  );
}
