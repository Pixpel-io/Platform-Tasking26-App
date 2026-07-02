import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import type { Invite, Profile, WorkspaceMember } from "@/lib/supabase/types";
import { InviteForm } from "../../members/invite-form";
import { MemberRow } from "../../members/member-row";
import { PendingInvites } from "../../members/pending-invites";
import { SettingsTabs } from "../settings-tabs";

type MemberWithProfile = WorkspaceMember & { profiles: Profile | null };

export default async function SettingsMembersPage({
  params,
}: PageProps<"/w/[workspaceId]/settings/members">) {
  const { workspaceId } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: members }, { data: invites }, { data: me }] =
    await Promise.all([
      supabase
        .from("workspace_members")
        .select("*, profiles(*)")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("invites")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .single(),
    ]);

  const myRole = me?.role ?? "member";
  const canManage = myRole === "owner" || myRole === "admin";
  const memberList = (members as MemberWithProfile[] | null) ?? [];

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

      {canManage && (
        <div className="mb-8 rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Invite by email
          </h2>
          <InviteForm workspaceId={workspaceId} />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
          {memberList.length} member{memberList.length === 1 ? "" : "s"}
        </div>
        <ul className="divide-y divide-border">
          {memberList.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              isSelf={m.user_id === user.id}
              canManage={canManage && myRole === "owner"}
              workspaceId={workspaceId}
            />
          ))}
        </ul>
      </div>

      {canManage && (invites?.length ?? 0) > 0 && (
        <PendingInvites
          workspaceId={workspaceId}
          invites={(invites as Invite[]) ?? []}
        />
      )}
    </div>
  );
}
