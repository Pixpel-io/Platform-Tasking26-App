import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { SettingsForm } from "./settings-form";
import { SettingsTabs } from "./settings-tabs";
import { NotificationSoundPicker } from "./notification-sound-picker";
import { CleotildaToggle } from "./cleotilda-toggle";

export default async function SettingsPage({
  params,
}: PageProps<"/w/[workspaceId]/settings">) {
  const { workspaceId } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: workspace, error: workspaceError }, { data: me }] =
    await Promise.all([
      supabase
        .from("workspaces")
        .select("*, organizations(id, name, owner_id)")
        .eq("id", workspaceId)
        .is("deleted_at", null)
        .single(),
      supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  if (workspaceError) {
    console.error("[settings] workspace query failed:", workspaceError);
  }
  if (!workspace) notFound();

  const org = (workspace as unknown as {
    organizations: { id: string; name: string; owner_id: string } | null;
  }).organizations;
  const canManage = me?.role === "owner" || me?.role === "admin";
  const isOwner = me?.role === "owner";
  const isCompanyOwner = isOwner && org?.owner_id === user.id;

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">
          Workspace settings
        </h1>
        <p className="mt-1 text-muted">
          Manage this workspace and the people in it.
        </p>
      </header>
      <SettingsTabs base={`/w/${workspaceId}/settings`} />
      <Link href={`/w/${workspaceId}/settings/notifications`} className="group mb-6 flex items-center gap-3 rounded-2xl border border-sky-400/20 bg-linear-to-r from-sky-500/10 via-cyan-500/6 to-transparent p-4 transition hover:-translate-y-0.5 hover:border-sky-400/35 hover:shadow-lg hover:shadow-sky-500/8">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-sky-500 to-cyan-400 text-white shadow-md shadow-sky-500/25"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M9.03 15.5 8.9 19.1c.44 0 .63-.2.86-.43l2.06-1.97 4.27 3.13c.78.43 1.34.2 1.55-.72l2.82-13.2h.01c.25-1.15-.42-1.6-1.18-1.31L2.9 10.05c-1.13.44-1.11 1.08-.19 1.36l4.28 1.34 9.94-6.26c.47-.31.9-.14.55.17z" /></svg></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-foreground">Want alerts on your phone?</span><span className="mt-0.5 block text-xs leading-5 text-muted">Connect Telegram to receive mentions, direct messages and group updates when you are away from Tasking.</span></span>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-border/70 bg-background/60 text-muted transition group-hover:border-sky-400/30 group-hover:text-sky-400"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg></span>
      </Link>
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        {canManage ? (
          <SettingsForm
            workspaceId={workspace.id}
            name={workspace.name}
            color={workspace.color}
            iconUrl={workspace.icon_url ?? ""}
            companyName={org?.name ?? ""}
            canEditCompany={isCompanyOwner}
            canDelete={isOwner}
          />
        ) : (
          <p className="text-muted">
            Only workspace admins can change these settings.
          </p>
        )}
      </div>

      {/* Personal preferences - every member sees these. */}
      <div className="mt-6 space-y-4">
        <CleotildaToggle />
        <NotificationSoundPicker />
      </div>
    </div>
  );
}
