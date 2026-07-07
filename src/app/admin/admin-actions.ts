"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/admin";

type Result = { error?: string; success?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// -- Creator allowlist --------------------------------------------------

export async function addWorkspaceCreator(
  _prev: Result | undefined,
  formData: FormData,
): Promise<Result> {
  const user = await requireSuperAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("workspace_creators")
    .insert({ email, added_by: user.id });
  if (error) {
    if (error.code === "23505") return { error: `${email} is already allowed.` };
    return { error: error.message };
  }
  revalidatePath("/admin");
  return { success: `${email} can now create workspaces.` };
}

export async function removeWorkspaceCreator(id: string): Promise<Result> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("workspace_creators").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}

// -- Workspace requests --------------------------------------------------

export async function decideWorkspaceRequest(
  requestId: string,
  decision: "approved" | "rejected",
): Promise<Result> {
  const user = await requireSuperAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("workspace_requests")
    .update({
      status: decision,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Request already decided." };

  revalidatePath("/admin");
  return {};
}

// Revoke a previously-approved request. If the approval is still unused the
// requester loses the pending green light; either way their email comes off
// the creator allowlist. Existing workspaces are untouched (delete those
// from the All Workspaces section).
export async function revokeApprovedRequest(requestId: string): Promise<Result> {
  await requireSuperAdmin();
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("workspace_requests")
    .select("id, status, requested_by, requester:profiles!workspace_requests_requested_by_fkey(email)")
    .eq("id", requestId)
    .maybeSingle();
  const req = request as
    | { id: string; status: string; requested_by: string; requester: { email: string } | null }
    | null;
  if (!req) return { error: "Request not found." };
  if (req.status !== "approved") return { error: "Only approved requests can be revoked." };

  // Void every unused approval this user still holds.
  const { error } = await supabase
    .from("workspace_requests")
    .delete()
    .eq("requested_by", req.requested_by)
    .eq("status", "approved")
    .is("workspace_id", null);
  if (error) return { error: error.message };

  // And take their email off the standing allowlist, if present.
  if (req.requester?.email) {
    await supabase
      .from("workspace_creators")
      .delete()
      .eq("email", req.requester.email.toLowerCase());
  }

  // If the approval was already used (workspace exists), mark it revoked by
  // deleting the record too - it no longer grants anything and just clutters.
  await supabase.from("workspace_requests").delete().eq("id", requestId);

  revalidatePath("/admin");
  return { success: "Approval revoked." };
}

// -- Workspaces (platform-wide governance) --------------------------------

// Soft-delete any workspace. The delete_workspace RPC allows the owner OR a
// super admin (0014); this action is the dashboard entry point. With
// `revokeOwnerAccess`, the owner's email also comes off the creator
// allowlist so they can't just create another workspace.
export async function adminDeleteWorkspace(
  workspaceId: string,
  revokeOwnerAccess = false,
): Promise<Result> {
  await requireSuperAdmin();
  const supabase = await createClient();

  // Resolve the owner BEFORE deleting (roster reads of a deleted workspace
  // can be filtered out).
  const { data: owner } = await supabase
    .from("workspace_members")
    .select("user_id, member:profiles(email)")
    .eq("workspace_id", workspaceId)
    .eq("role", "owner")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  const ownerRow = owner as
    | { user_id: string; member: { email: string } | null }
    | null;

  const { error } = await supabase.rpc("delete_workspace", {
    p_workspace_id: workspaceId,
  });
  if (error) return { error: error.message };

  // Drop the request that produced this workspace so it disappears from
  // "Recent decisions" - the workspace no longer exists, so the record is
  // just confusing.
  await supabase
    .from("workspace_requests")
    .delete()
    .eq("workspace_id", workspaceId);

  if (revokeOwnerAccess && ownerRow) {
    if (ownerRow.member?.email) {
      await supabase
        .from("workspace_creators")
        .delete()
        .eq("email", ownerRow.member.email.toLowerCase());
    }
    // Void any approved-but-unused requests too, or they could still
    // create one more workspace from the old approval.
    await supabase
      .from("workspace_requests")
      .delete()
      .eq("requested_by", ownerRow.user_id)
      .eq("status", "approved")
      .is("workspace_id", null);
  }

  revalidatePath("/admin");
  return {
    success: revokeOwnerAccess
      ? "Workspace deleted and owner's creation access revoked."
      : "Workspace deleted.",
  };
}
