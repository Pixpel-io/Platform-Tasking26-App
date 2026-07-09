import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import {
  NOTIFICATION_SELECT,
  notificationHref,
  type NotificationWithActor,
} from "@/lib/notifications-shared";

export { notificationHref };
export type { NotificationWithActor };

export const getNotifications = cache(
  async (
    workspaceId: string,
    limit = 50,
  ): Promise<NotificationWithActor[]> => {
    await requireUser();
    const supabase = await createClient();
    const { data } = await supabase
      .from("notifications")
      .select(NOTIFICATION_SELECT)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data as NotificationWithActor[] | null) ?? [];
  },
);

// Unread notification counts for EVERY workspace the user belongs to, keyed
// by workspace id - drives the per-workspace badges in the switcher. RLS
// already scopes rows to the current user.
export const getUnreadCountsByWorkspace = cache(
  async (): Promise<Record<string, number>> => {
    await requireUser();
    const supabase = await createClient();
    const { data } = await supabase
      .from("notifications")
      .select("workspace_id")
      .is("read_at", null);
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      counts[row.workspace_id] = (counts[row.workspace_id] ?? 0) + 1;
    }
    return counts;
  },
);

export const getUnreadNotificationCount = cache(
  async (workspaceId: string): Promise<number> => {
    await requireUser();
    const supabase = await createClient();
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("read_at", null);
    return count ?? 0;
  },
);
