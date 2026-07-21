import type { Notification, Profile } from "@/lib/supabase/types";

export type NotificationWithActor = Notification & {
  actor: Profile | null;
  // Context for cross-workspace clarity: which workspace (and group) the
  // notification came from. Null when RLS hides the row (shouldn't happen
  // for the recipient, but render defensively).
  workspace: { name: string } | null;
  channel: { name: string } | null;
};

// actor_id and user_id both reference profiles, so the embed must name the FK.
export const NOTIFICATION_SELECT =
  "*, actor:profiles!notifications_actor_id_fkey(*), workspace:workspaces(name), channel:channels(name)";

// Where a notification points. The notification's own workspace_id wins so a
// toast from another workspace opens in THAT workspace, not the current one.
export function notificationHref(
  workspaceId: string,
  n: Pick<
    Notification,
    | "workspace_id"
    | "channel_id"
    | "conversation_id"
    | "task_id"
    | "project_id"
    | "type"
  >,
): string | null {
  // DM notifications with no workspace at all (recipient belongs to none)
  // open in the global /dm shell.
  if (!n.workspace_id && !workspaceId && n.conversation_id) {
    return `/dm/${n.conversation_id}`;
  }
  const base = `/w/${n.workspace_id ?? workspaceId}`;
  if (n.channel_id) return `${base}/c/${n.channel_id}`;
  if (n.conversation_id) return `${base}/dm/${n.conversation_id}`;
  if (n.project_id) return `${base}/projects/${n.project_id}`;
  // Role change: land on the members list so the recipient can see the new
  // badge on their own row.
  if (n.type === "workspace.admin") return `${base}/settings/members`;
  return null;
}

// "Workspace · #group" / "Workspace" context line for a notification, or null
// when there's nothing useful to add (same workspace, no group).
export function notificationContext(
  currentWorkspaceId: string,
  n: Pick<Notification, "workspace_id" | "channel_id"> & {
    workspace?: { name: string } | null;
    channel?: { name: string } | null;
  },
): string | null {
  // DMs are global (one thread across workspaces), so naming a workspace on
  // a DM notification is meaningless - only group notifications carry their
  // workspace + #group context.
  if (!n.channel_id) return null;
  const parts: string[] = [];
  if (n.workspace_id !== currentWorkspaceId && n.workspace?.name) {
    parts.push(n.workspace.name);
  }
  if (n.channel?.name) {
    parts.push(`#${n.channel.name}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
