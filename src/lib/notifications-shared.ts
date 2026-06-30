import type { Notification, Profile } from "@/lib/supabase/types";

export type NotificationWithActor = Notification & {
  actor: Profile | null;
};

// actor_id and user_id both reference profiles, so the embed must name the FK.
export const NOTIFICATION_SELECT =
  "*, actor:profiles!notifications_actor_id_fkey(*)";

// Where a notification points. Returns null when there's nothing to open.
export function notificationHref(
  workspaceId: string,
  n: Pick<
    Notification,
    "channel_id" | "conversation_id" | "task_id" | "project_id"
  >,
): string | null {
  const base = `/w/${workspaceId}`;
  if (n.channel_id) return `${base}/c/${n.channel_id}`;
  if (n.conversation_id) return `${base}/dm/${n.conversation_id}`;
  if (n.project_id) return `${base}/projects/${n.project_id}`;
  return null;
}
