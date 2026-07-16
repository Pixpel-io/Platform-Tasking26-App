"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

type Result = { error?: string };

export async function markAllNotificationsRead(
  workspaceId: string,
): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notifications_read", {
    p_workspace_id: workspaceId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/w/${workspaceId}`, "layout");
  return {};
}

export async function markNotificationRead(
  workspaceId: string,
  notificationId: string,
): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .is("read_at", null);
  if (error) return { error: error.message };
  revalidatePath(`/w/${workspaceId}`, "layout");
  return {};
}

// Clear every unread notification tied to one board when the user opens it -
// Slack-style: visiting the room is what dismisses its badge. RLS scopes the
// update to the caller's own rows so this can't touch anyone else.
export async function markProjectNotificationsRead(
  workspaceId: string,
  projectId: string,
): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("project_id", projectId)
    .is("read_at", null);
  if (error) return { error: error.message };
  return {};
}
