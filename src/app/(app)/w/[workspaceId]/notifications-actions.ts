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
