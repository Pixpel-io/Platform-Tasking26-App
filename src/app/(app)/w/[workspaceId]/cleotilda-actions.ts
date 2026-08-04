"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { chatWithCleotilda } from "@/lib/cleotilda";
import type { CleotildaEmailDraft } from "@/lib/cleotilda-shared";
import { enforceMailRateLimit, sendMail } from "@/lib/mail-server";

// Assistant panel backend: takes the running panel conversation and returns
// Cleotilda's next reply. Membership-checked; tools run as the caller (RLS).
export async function askCleotilda(
  workspaceId: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<{ reply?: string; mutated?: boolean; pendingEmail?: CleotildaEmailDraft; error?: string }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: member } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!member) return { error: "Not a member of this workspace." };

  const { data: me } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single();

  const safeHistory = (history ?? [])
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.length <= 8000,
    )
    .slice(-16);
  if (safeHistory.length === 0 || safeHistory[safeHistory.length - 1].role !== "user") {
    return { error: "Nothing to answer." };
  }

  try {
    const { reply, mutated, pendingEmail } = await chatWithCleotilda({
      workspaceId,
      userId: user.id,
      userName: me?.full_name ?? me?.email ?? "Someone",
      history: safeHistory,
    });
    // Anything created (project/group/task/DM) should show up in the
    // server-rendered sidebar and boards immediately.
    if (mutated) {
      revalidatePath(`/w/${workspaceId}`, "layout");
    }
    return { reply, mutated, pendingEmail };
  } catch (err) {
    console.error("[cleotilda-panel]", err);
    return { error: "Cleotilda couldn't respond right now. Try again." };
  }
}

export async function sendCleotildaEmail(
  workspaceId: string,
  draft: CleotildaEmailDraft,
): Promise<{ ok?: true; messageId?: string; error?: string }> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: member } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!member) return { error: "Not a member of this workspace." };

  const accountId = String(draft.accountId ?? "").trim();
  const to = String(draft.to ?? "").trim();
  const cc = String(draft.cc ?? "").trim();
  const subject = String(draft.subject ?? "").trim();
  const text = String(draft.text ?? "").trim();
  if (!accountId || !to || !subject || !text) return { error: "The email draft is incomplete." };
  if (to.length > 2000 || cc.length > 2000 || subject.length > 998 || text.length > 900000 || /[\r\n]/.test(subject)) {
    return { error: "The email draft exceeds the allowed size." };
  }
  try {
    await enforceMailRateLimit(user.id, "send");
    const result = await sendMail(user.id, accountId, { to, cc: cc || undefined, subject, text });
    return { ok: true, messageId: result.messageId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not send the email." };
  }
}
