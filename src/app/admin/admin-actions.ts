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
