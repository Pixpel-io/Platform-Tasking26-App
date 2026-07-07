"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { chatWithCleotilda } from "@/lib/cleotilda";

// Assistant panel backend: takes the running panel conversation and returns
// Cleotilda's next reply. Membership-checked; tools run as the caller (RLS).
export async function askCleotilda(
  workspaceId: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<{ reply?: string; error?: string }> {
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
    const reply = await chatWithCleotilda({
      workspaceId,
      userId: user.id,
      userName: me?.full_name ?? me?.email ?? "Someone",
      history: safeHistory,
    });
    return { reply };
  } catch (err) {
    console.error("[cleotilda-panel]", err);
    return { error: "Cleotilda couldn't respond right now. Try again." };
  }
}
