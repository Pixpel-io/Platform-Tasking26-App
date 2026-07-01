import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { SettingsForm } from "./settings-form";
import { SettingsTabs } from "./settings-tabs";

export default async function SettingsPage({
  params,
}: PageProps<"/w/[workspaceId]/settings">) {
  const { workspaceId } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: workspace }, { data: me }] = await Promise.all([
    supabase
      .from("workspaces")
      .select("id, name, color, organizations(id, name, owner_id)")
      .eq("id", workspaceId)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single(),
  ]);

  if (!workspace) notFound();

  const org = (workspace as unknown as {
    organizations: { id: string; name: string; owner_id: string } | null;
  }).organizations;
  const canManage = me?.role === "owner" || me?.role === "admin";
  const isOwner = me?.role === "owner";
  const isCompanyOwner = isOwner && org?.owner_id === user.id;

  return (
    <div className="mx-auto max-w-2xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">
          Workspace settings
        </h1>
        <p className="mt-1 text-muted">
          Manage this workspace and the people in it.
        </p>
      </header>
      <SettingsTabs base={`/w/${workspaceId}/settings`} />
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        {canManage ? (
          <SettingsForm
            workspaceId={workspace.id}
            name={workspace.name}
            color={workspace.color}
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
    </div>
  );
}
