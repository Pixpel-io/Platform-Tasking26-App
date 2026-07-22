import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/admin";
import { ThemeToggle } from "@/components/theme-toggle";
import { RequestList } from "./request-list";
import { CreatorAllowlist } from "./creator-allowlist";
import { WorkspaceList } from "./workspace-list";

export const metadata = { title: "Super Admin" };

export default async function AdminPage() {
  await requireUser();
  if (!(await isSuperAdmin())) redirect("/");

  const supabase = await createClient();

  const [{ data: requests }, { data: creators }, { data: admins }, { data: workspaces }] =
    await Promise.all([
      supabase
        .from("workspace_requests")
        .select(
          "id, workspace_name, organization_name, status, created_at, requester:profiles!workspace_requests_requested_by_fkey(full_name, email)",
        )
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("workspace_creators")
        .select("id, email, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("app_admins").select("email").order("email"),
      supabase
        .from("workspaces")
        .select("id, name, color, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  // Owner + member count per workspace (single roster query).
  const wsIds = (workspaces ?? []).map((w) => w.id);
  const rosters = new Map<string, { count: number; ownerName: string }>();
  if (wsIds.length > 0) {
    const { data: memberRows } = await supabase
      .from("workspace_members")
      .select("workspace_id, role, member:profiles(full_name, email)")
      .in("workspace_id", wsIds)
      .is("deleted_at", null);
    type RosterRow = {
      workspace_id: string;
      role: string;
      member: { full_name: string | null; email: string } | null;
    };
    for (const m of (memberRows as RosterRow[] | null) ?? []) {
      const cur = rosters.get(m.workspace_id) ?? { count: 0, ownerName: "Unknown" };
      cur.count += 1;
      if (m.role === "owner") {
        cur.ownerName = m.member?.full_name ?? m.member?.email ?? "Unknown";
      }
      rosters.set(m.workspace_id, cur);
    }
  }

  const workspaceRows = (workspaces ?? []).map((w) => {
    const roster = rosters.get(w.id) ?? { count: 0, ownerName: "Unknown" };
    return {
      id: w.id,
      name: w.name,
      color: w.color,
      created_at: w.created_at,
      memberCount: roster.count,
      ownerName: roster.ownerName,
    };
  });

  const pending = (requests ?? []).filter((r) => r.status === "pending");
  const decided = (requests ?? []).filter((r) => r.status !== "pending");

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-linear-to-br from-primary to-primary/60 text-primary-foreground">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </span>
          <div>
            <h1 className="text-sm font-semibold text-foreground">Super Admin</h1>
            <p className="text-xs text-muted">Platform control panel</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/"
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              Back to app
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        {/* Pending requests */}
        <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">
              Workspace requests
            </h2>
            {pending.length > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                {pending.length} pending
              </span>
            )}
          </div>
          <RequestList pending={pending} decided={decided.slice(0, 10)} />
        </section>

        {/* Creator allowlist */}
        <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">
            Workspace creators
          </h2>
          <p className="mt-1 text-sm text-muted">
            These emails can create workspaces directly, without approval.
            Everyone else must request and wait for a super admin.
          </p>
          <CreatorAllowlist creators={creators ?? []} />
        </section>

        {/* Super admins (read-only, managed in the database) */}
        <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Super admins</h2>
          <p className="mt-1 text-sm text-muted">
            Full platform authority. Managed via the app_admins table.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(admins ?? []).map((a) => (
              <span
                key={a.email}
                className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
              >
                {a.email}
              </span>
            ))}
          </div>
        </section>

        {/* All workspaces */}
        <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">
            All workspaces{" "}
            <span className="text-sm font-normal text-muted">
              ({workspaceRows.length})
            </span>
          </h2>
          <p className="mt-1 text-sm text-muted">
            Every workspace on the platform, with its owner. Deleting removes
            the workspace for everyone.
          </p>
          <WorkspaceList workspaces={workspaceRows} />
        </section>
      </main>
    </div>
  );
}
