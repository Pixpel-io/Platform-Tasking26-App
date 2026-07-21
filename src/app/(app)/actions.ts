"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { emailEnabled, sendInviteEmail } from "@/lib/email";
import {
  CreateWorkspaceSchema,
  InviteSchema,
  UpdateWorkspaceSchema,
  fieldErrorsOf,
  type FormState,
} from "@/lib/validation";

async function siteOrigin() {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function createWorkspace(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = CreateWorkspaceSchema.safeParse({
    workspaceName: formData.get("workspaceName"),
    organizationName: formData.get("organizationName"),
    color: formData.get("color") || undefined,
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error) };
  }

  // Optional teammate emails collected by the chip input (JSON array).
  let inviteEmails: string[] = [];
  try {
    const raw = formData.get("inviteEmails");
    if (typeof raw === "string" && raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        inviteEmails = [
          ...new Set(
            list
              .filter((e): e is string => typeof e === "string")
              .map((e) => e.trim().toLowerCase())
              .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
              .filter((e) => e !== user.email?.toLowerCase()),
          ),
        ].slice(0, 20);
      }
    }
  } catch {
    // Malformed JSON - ignore; invites are best-effort.
  }

  const supabase = await createClient();

  // Workspace creation is gated: allowlisted creators (and super admins)
  // create directly; everyone else files a request for super admin approval.
  const { data: allowed } = await supabase.rpc("can_create_workspace");
  const { data: approvedRequest } = await supabase
    .from("workspace_requests")
    .select("id")
    .eq("requested_by", user.id)
    .eq("status", "approved")
    .is("workspace_id", null)
    .limit(1)
    .maybeSingle();

  if (!allowed && !approvedRequest) {
    // Reuse an existing pending request instead of stacking duplicates.
    const { data: pending } = await supabase
      .from("workspace_requests")
      .select("id")
      .eq("requested_by", user.id)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();
    if (pending) {
      return {
        error:
          "Your workspace request is already pending super admin approval.",
      };
    }
    const { error: reqError } = await supabase.from("workspace_requests").insert({
      requested_by: user.id,
      workspace_name: parsed.data.workspaceName,
      organization_name: parsed.data.organizationName || null,
      color: parsed.data.color || null,
    });
    if (reqError) return { error: reqError.message };
    return {
      success:
        "Request sent! A super admin needs to approve it before your workspace is created. You'll be able to create it once approved.",
    };
  }

  const { data, error } = await supabase.rpc("create_workspace_gated", {
    p_workspace_name: parsed.data.workspaceName,
    p_organization_name: parsed.data.organizationName || undefined,
    p_color: parsed.data.color || undefined,
  });

  if (error) return { error: error.message };

  // Consume the approved request (one approval = one workspace).
  if (!allowed && approvedRequest) {
    await supabase
      .from("workspace_requests")
      .update({ workspace_id: data })
      .eq("id", approvedRequest.id);
  }

  // Fire the invites before redirecting. Best-effort: a failed invite must
  // not block workspace creation.
  for (const email of inviteEmails) {
    const { data: invite } = await supabase
      .from("invites")
      .insert({
        workspace_id: data,
        email,
        role: "member",
        invited_by: user.id,
      })
      .select("token")
      .single();
    if (invite) {
      await deliverInvite(supabase, {
        workspaceId: data,
        email,
        token: invite.token,
        userId: user.id,
        userEmail: user.email,
      });
    }
  }

  revalidatePath("/", "layout");
  redirect(`/w/${data}`);
}

export async function updateWorkspace(
  workspaceId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser();
  const parsed = UpdateWorkspaceSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color"),
    companyName: formData.get("companyName") || undefined,
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const supabase = await createClient();
  const { data: workspace, error } = await supabase
    .from("workspaces")
    .update({ name: parsed.data.name, color: parsed.data.color.toLowerCase() })
    .eq("id", workspaceId)
    .select("organization_id")
    .single();

  if (error) return { error: error.message };

  // Company (organization) name is owner-only; RLS silently no-ops otherwise.
  if (parsed.data.companyName && workspace?.organization_id) {
    const { error: orgError } = await supabase
      .from("organizations")
      .update({ name: parsed.data.companyName })
      .eq("id", workspace.organization_id);
    if (orgError) return { error: orgError.message };
  }

  revalidatePath("/", "layout");
  return { success: "Workspace updated." };
}

export async function deleteWorkspace(workspaceId: string): Promise<FormState> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_workspace", {
    p_workspace_id: workspaceId,
  });

  if (error) return { error: error.message };

  // The RPC returns the DELETED workspace's id - never redirect there (404).
  // Land on another workspace the user belongs to, or onboarding when this
  // was their last one.
  const { data: remaining } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces!inner(id, deleted_at)")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .is("workspaces.deleted_at", null)
    .neq("workspace_id", workspaceId)
    .limit(1)
    .maybeSingle();

  revalidatePath("/", "layout");
  redirect(remaining ? `/w/${remaining.workspace_id}` : "/onboarding");
}

export async function inviteMember(
  workspaceId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = InviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const supabase = await createClient();

  // Don't invite someone who's already a member.
  const { data: existingMember } = await supabase
    .from("workspace_members")
    .select("user_id, profiles!inner(email)")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .ilike("profiles.email", email)
    .maybeSingle();
  if (existingMember) {
    return { error: `${email} is already a member of this workspace.` };
  }

  // Reuse an existing pending invite for the same email instead of stacking
  // duplicate rows - refresh its role + token and re-send.
  const { data: existing } = await supabase
    .from("invites")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let token: string;
  if (existing) {
    const { data: updated, error } = await supabase
      .from("invites")
      .update({
        role: parsed.data.role,
        token: crypto.randomUUID(),
        invited_by: user.id,
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
      .eq("id", existing.id)
      .select("token")
      .single();
    if (error) return { error: error.message };
    token = updated.token;
  } else {
    const { data: invite, error } = await supabase
      .from("invites")
      .insert({
        workspace_id: workspaceId,
        email,
        role: parsed.data.role,
        invited_by: user.id,
      })
      .select("token")
      .single();
    if (error) return { error: error.message };
    token = invite.token;
  }

  revalidatePath(`/w/${workspaceId}/settings/members`);
  return deliverInvite(supabase, { workspaceId, email, token, userId: user.id, userEmail: user.email });
}

export async function resendInvite(
  workspaceId: string,
  inviteId: string,
): Promise<FormState> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: invite, error } = await supabase
    .from("invites")
    .update({
      token: crypto.randomUUID(),
      invited_by: user.id,
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    })
    .eq("id", inviteId)
    .eq("status", "pending")
    .select("email, token")
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/w/${workspaceId}/settings/members`);
  return deliverInvite(supabase, {
    workspaceId,
    email: invite.email,
    token: invite.token,
    userId: user.id,
    userEmail: user.email,
  });
}

// Builds the accept link and sends the invite email (or returns a shareable
// link when email isn't configured / the send fails).
async function deliverInvite(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: {
    workspaceId: string;
    email: string;
    token: string;
    userId: string;
    userEmail?: string | null;
  },
): Promise<FormState> {
  const origin = await siteOrigin();
  const acceptUrl = `${origin}/invite/${opts.token}`;

  if (!emailEnabled()) {
    return {
      success: `Invite created. Email isn't configured - share this link: ${acceptUrl}`,
    };
  }

  const [{ data: workspace }, { data: inviter }] = await Promise.all([
    supabase.from("workspaces").select("name").eq("id", opts.workspaceId).single(),
    supabase.from("profiles").select("full_name").eq("id", opts.userId).single(),
  ]);

  const { error: emailError } = await sendInviteEmail({
    to: opts.email,
    workspaceName: workspace?.name ?? "your workspace",
    inviterName: inviter?.full_name ?? opts.userEmail ?? "A teammate",
    acceptUrl,
  });

  if (emailError) {
    return {
      success: `Invite saved, but the email failed to send (${emailError}). Share this link: ${acceptUrl}`,
    };
  }

  return { success: `Invitation emailed to ${opts.email}.` };
}

export async function acceptInvite(token: string): Promise<{ error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invite", {
    p_token: token,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  redirect(`/w/${data}`);
}

export async function revokeInvite(workspaceId: string, inviteId: string) {
  await requireUser();
  const supabase = await createClient();

  // Revoke every pending invite for this email so stale duplicates from before
  // the dedupe fix also clear out, not just the row that was clicked.
  const { data: target } = await supabase
    .from("invites")
    .select("email")
    .eq("id", inviteId)
    .single();

  const query = supabase
    .from("invites")
    .update({ status: "revoked" })
    .eq("workspace_id", workspaceId)
    .eq("status", "pending");

  if (target?.email) {
    await query.ilike("email", target.email);
  } else {
    await query.eq("id", inviteId);
  }

  revalidatePath(`/w/${workspaceId}/settings/members`);
}

// Soft-removes a member from a workspace. RLS already restricts this to
// owners/admins; we additionally refuse to remove an owner so the workspace is
// never left without one.
export async function removeMember(
  workspaceId: string,
  memberId: string,
): Promise<FormState> {
  await requireUser();
  const supabase = await createClient();

  const { data: target } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("id", memberId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!target) return { error: "Member not found." };
  if (target.role === "owner") {
    return { error: "The workspace owner can't be removed." };
  }

  const { error } = await supabase
    .from("workspace_members")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", memberId)
    .eq("workspace_id", workspaceId);

  if (error) return { error: error.message };

  revalidatePath(`/w/${workspaceId}/settings/members`);
  return { success: "Member removed." };
}

// Owner-only: promote a member to admin, or demote an admin back to member.
// The RPC (0043) enforces every gate - only owners can call it, the owner
// itself can't be changed, and the caller can't touch their own role - so
// this action just forwards the call and revalidates.
export async function changeMemberRole(
  workspaceId: string,
  memberUserId: string,
  role: "admin" | "member",
): Promise<FormState> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_workspace_member_role", {
    p_workspace_id: workspaceId,
    p_member_user_id: memberUserId,
    p_role: role,
  });
  if (error) return { error: error.message };

  revalidatePath(`/w/${workspaceId}/settings/members`);
  revalidatePath(`/w/${workspaceId}`, "layout");
  return { success: role === "admin" ? "Promoted to admin." : "Changed to member." };
}

export async function updateProfile(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const avatarUrl = String(formData.get("avatarUrl") ?? "").trim();

  if (fullName.length < 2) {
    return { fieldErrors: { fullName: ["Name must be at least 2 characters."] } };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      title: title || null,
      avatar_url: avatarUrl || null,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: "Profile updated." };
}

export async function updatePresence(
  status: "online" | "offline" | "busy" | "away",
) {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase
    .from("profiles")
    .update({ presence: status, last_seen_at: new Date().toISOString() })
    .eq("id", user.id);
}

// Slack-style custom status: emoji + short text with an optional auto-expiry.
// Pass empty text to clear.
export async function setProfileStatus(input: {
  emoji: string | null;
  text: string;
  expiresAt: string | null;
}): Promise<FormState> {
  const user = await requireUser();
  const text = input.text.trim().slice(0, 100);
  const clearing = text.length === 0;

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update(
      clearing
        ? { status_emoji: null, status_text: null, status_expires_at: null }
        : {
            status_emoji: input.emoji,
            status_text: text,
            status_expires_at: input.expiresAt,
          },
    )
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: clearing ? "Status cleared." : "Status set." };
}
