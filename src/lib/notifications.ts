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
