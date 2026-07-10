"use server";

// Personal DM invitations (Juan's model): connect two people with no shared
// workspace so they can DM - and nothing else. Mirrors the workspace-invite
// flow: email + token link, accept gated on the signed-in email matching.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { emailEnabled, sendDmInviteEmail } from "@/lib/email";
import type { FormState } from "@/lib/validation";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function siteOrigin() {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function sendDmInvite(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return { fieldErrors: { email: ["Enter a valid email address."] } };
  }
  if (email === user.email?.toLowerCase()) {
    return { fieldErrors: { email: ["That's your own email."] } };
  }

  const supabase = await createClient();

  // Already connected? (Registered user with a standing connection or a
  // shared workspace shows up in the DM list already.)
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingProfile) {
    const { data: connected } = await supabase.rpc("has_dm_connection", {
      p_a: user.id,
      p_b: existingProfile.id,
    });
    if (connected) {
      return { error: "You're already connected with this person." };
    }
  }

  // Reuse a pending invite for the same email instead of stacking rows.
  const { data: existing } = await supabase
    .from("dm_invites")
    .select("id")
    .eq("invited_by", user.id)
    .eq("status", "pending")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let token: string;
  if (existing) {
    const { data: updated, error } = await supabase
      .from("dm_invites")
      .update({
        token: crypto.randomUUID(),
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
      .eq("id", existing.id)
      .select("token")
      .single();
    if (error) return { error: error.message };
    token = updated.token;
  } else {
    const { data: invite, error } = await supabase
      .from("dm_invites")
      .insert({ email, invited_by: user.id })
      .select("token")
      .single();
    if (error) return { error: error.message };
    token = invite.token;
  }

  const origin = await siteOrigin();
  const acceptUrl = `${origin}/dm-invite/${token}`;

  if (!emailEnabled()) {
    return {
      success: `Invite created. Email isn't configured - share this link: ${acceptUrl}`,
    };
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const { error: emailError } = await sendDmInviteEmail({
    to: email,
    inviterName: me?.full_name ?? user.email ?? "Someone",
    acceptUrl,
  });

  if (emailError) {
    return {
      success: `Invite saved, but the email failed to send (${emailError}). Share this link: ${acceptUrl}`,
    };
  }

  return { success: `Invitation emailed to ${email}.` };
}

export async function acceptDmInvite(
  token: string,
): Promise<{ error?: string }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: conversationId, error } = await supabase.rpc(
    "accept_dm_invite",
    { p_token: token },
  );
  if (error) return { error: error.message };

  // Land in the new DM inside any workspace the accepter belongs to.
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces!inner(deleted_at)")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .is("workspaces.deleted_at", null)
    .limit(1)
    .maybeSingle();

  revalidatePath("/", "layout");
  if (membership) {
    redirect(`/w/${membership.workspace_id}/dm/${conversationId}`);
  }
  // No workspace at all: onboarding will pick things up.
  redirect("/onboarding");
}
