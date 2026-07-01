"use client";

// Fires native OS/browser notifications (the Chrome popup you get from Slack).
// Best-effort: if the API is missing, permission is denied, or the tab is
// focused, we simply do nothing and let the in-app toast carry the alert.

export function desktopNotificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

// Asks the browser for permission once. Must be triggered by a user gesture the
// first time or Chrome ignores it, so call this from a click/keydown handler.
export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (!desktopNotificationsSupported()) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showDesktopNotification(opts: {
  title: string;
  body?: string | null;
  icon?: string | null;
  tag?: string;
  onClick?: () => void;
}) {
  if (!desktopNotificationsSupported()) return;
  if (Notification.permission !== "granted") return;
  // Don't double-alert when the user is already looking at the tab.
  if (typeof document !== "undefined" && document.visibilityState === "visible") {
    return;
  }
  try {
    const n = new Notification(opts.title, {
      body: opts.body ?? undefined,
      icon: opts.icon ?? "/favicon.ico",
      tag: opts.tag,
    });
    if (opts.onClick) {
      n.onclick = () => {
        window.focus();
        opts.onClick?.();
        n.close();
      };
    }
  } catch {
    // ignore
  }
}
