// =============================================================================
// Format a `notifications` row into a Telegram message (HTML) + deep link.
// Kept separate from `notifications-shared.ts` because that file is client-
// safe; anything Telegram-related is strictly server side.
// =============================================================================

import type { Notification } from "@/lib/supabase/types";
import { escapeTelegramHtml } from "@/lib/telegram";

// Minimum fields the fanout endpoint needs from `notifications` + the joined
// context. Keeping this in one place so the fanout endpoint's SQL SELECT and
// the formatter never drift.
export type FanoutNotification = Pick<
  Notification,
  | "id"
  | "type"
  | "title"
  | "body"
  | "workspace_id"
  | "channel_id"
  | "conversation_id"
  | "project_id"
  | "task_id"
  | "actor_id"
> & {
  workspace: { name: string } | null;
  channel: { name: string } | null;
  actor: { full_name: string | null; email: string | null } | null;
};

// Map notification type to (a) whether the user's preferences allow it and
// (b) the short label we prepend for scan-ability in the Telegram feed.
type CategoryKey =
  | "mentions_enabled"
  | "dms_enabled"
  | "group_messages_enabled"
  | "task_events_enabled";

const TYPE_META: Record<
  string,
  { category: CategoryKey; label: string; emoji: string }
> = {
  mention: { category: "mentions_enabled", label: "Mention", emoji: "@" },
  dm: { category: "dms_enabled", label: "Direct message", emoji: "✉" },
  "group.message": {
    category: "group_messages_enabled",
    label: "Group message",
    emoji: "#",
  },
  "task.assigned": {
    category: "task_events_enabled",
    label: "Task assigned",
    emoji: "✓",
  },
  "task.status": {
    category: "task_events_enabled",
    label: "Task status",
    emoji: "→",
  },
  "task.comment": {
    category: "task_events_enabled",
    label: "Task comment",
    emoji: "💬",
  },
  "group.added": {
    category: "group_messages_enabled",
    label: "Added to group",
    emoji: "+",
  },
  "group.removed": {
    category: "group_messages_enabled",
    label: "Removed from group",
    emoji: "−",
  },
  "project.added": {
    category: "task_events_enabled",
    label: "Added to project",
    emoji: "+",
  },
  "workspace.admin": {
    category: "task_events_enabled",
    label: "Workspace admin",
    emoji: "★",
  },
};

// Return null when the notification type is unknown or the user has disabled
// the corresponding category. Fanout endpoint uses that as a "skip" signal.
export function shouldForwardToChannel(
  n: FanoutNotification,
  prefs: {
    mentions_enabled: boolean;
    dms_enabled: boolean;
    group_messages_enabled: boolean;
    task_events_enabled: boolean;
  },
): boolean {
  const meta = TYPE_META[n.type];
  if (!meta) return false;
  return prefs[meta.category];
}

export function formatNotificationForTelegram(
  n: FanoutNotification,
  siteUrl: string,
): { text: string; action?: { label: string; url: string } } {
  const meta = TYPE_META[n.type] ?? { label: "Notification", emoji: "•" };
  const label = escapeTelegramHtml(meta.label);
  const context = notificationContextLine(n);
  const title = escapeTelegramHtml(n.title || meta.label);
  const body = n.body ? escapeTelegramHtml(n.body).slice(0, 400) : "";

  const lines: string[] = [];
  lines.push(`<b>${meta.emoji} ${label}</b>`);
  if (context) lines.push(`<i>${escapeTelegramHtml(context)}</i>`);
  lines.push("");
  lines.push(title);
  if (body) {
    lines.push("");
    lines.push(body);
  }

  const url = deepLink(n, siteUrl);
  return {
    text: lines.join("\n"),
    action: url ? { label: "Open in Tasking", url } : undefined,
  };
}

function notificationContextLine(n: FanoutNotification): string | null {
  const parts: string[] = [];
  if (n.workspace?.name) parts.push(n.workspace.name);
  if (n.channel?.name) parts.push(`#${n.channel.name}`);
  return parts.length ? parts.join(" · ") : null;
}

// Mirrors the client-side notificationHref() logic. Kept independent because
// the client version is under `use client` files whose imports we don't want
// to drag into the server bundle.
function deepLink(n: FanoutNotification, siteUrl: string): string | null {
  const base = siteUrl.replace(/\/$/, "");
  if (!n.workspace_id && n.conversation_id) {
    return `${base}/dm/${n.conversation_id}`;
  }
  if (!n.workspace_id) return `${base}/notifications`;
  const ws = `${base}/w/${n.workspace_id}`;
  if (n.channel_id) return `${ws}/c/${n.channel_id}`;
  if (n.conversation_id) return `${ws}/dm/${n.conversation_id}`;
  if (n.project_id) return `${ws}/projects/${n.project_id}`;
  return `${ws}/notifications`;
}
