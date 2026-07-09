"use client";

// Fires native OS/browser notifications (the popup you get from Slack).
// Works across Windows and macOS: Chrome/Edge/Firefox use the promise-based
// Notification API; Safari on macOS (any version) needs the legacy
// callback-style requestPermission, handled below. Best-effort: if the API is
// missing, permission is denied, or the tab is focused, we simply do nothing
// and let the in-app toast carry the alert.

export function desktopNotificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

// Asks the browser for permission once. Must be triggered by a user gesture
// the first time (Chrome and Safari both ignore it otherwise), so call this
// from a click/keydown handler.
export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (!desktopNotificationsSupported()) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    // Older macOS Safari implements requestPermission(callback) and returns
    // undefined instead of a promise. Wrap so both shapes resolve.
    return await new Promise<NotificationPermission>((resolve) => {
      const maybePromise = Notification.requestPermission((perm) => {
        // Legacy callback path (Safari).
        resolve(perm);
      });
      if (maybePromise && typeof maybePromise.then === "function") {
        // Modern promise path (Chrome/Edge/Firefox/new Safari).
        maybePromise.then(resolve).catch(() => resolve(Notification.permission));
      }
    });
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
      // Safari on macOS ignores `icon` (it always shows the browser/app icon);
      // harmless to pass it for the browsers that do render it. Without an
      // actor avatar we fall back to the TasKing logo.
      icon: opts.icon ?? "/icon-192.png",
      // Small brand mark some platforms show alongside the notification.
      badge: "/icon-192.png",
      tag: opts.tag,
    });
    if (opts.onClick) {
      n.onclick = () => {
        // Safari is stricter about focusing from a notification click; parent
        // may be null when the tab was closed, so guard everything.
        try {
          window.focus();
          if (window.parent) window.parent.focus();
        } catch {
          // ignore focus failures
        }
        opts.onClick?.();
        n.close();
      };
    }
  } catch {
    // ignore
  }
}
