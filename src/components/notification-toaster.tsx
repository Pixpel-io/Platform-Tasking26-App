"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getRealtimeClient } from "@/lib/supabase/client";
import {
  NOTIFICATION_SELECT,
  notificationContext,
  notificationHref,
  type NotificationWithActor,
} from "@/lib/notifications-shared";
import { playNotificationSound } from "@/lib/notify-sound";
import {
  ensureNotificationPermission,
  showDesktopNotification,
} from "@/lib/notify-desktop";
import { Avatar } from "@/components/avatar";

const TYPE_ICON: Record<string, string> = {
  mention:
    "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
  dm: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  "task.assigned":
    "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  "task.status":
    "M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20",
  "task.comment":
    "M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.5-.76L3 21l1.76-6A8.5 8.5 0 1 1 21 11.5zM8 10h8M8 14h5",
  "group.added":
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M19 8v6M22 11h-6",
};

type Toast = NotificationWithActor & { leaving?: boolean };

const VISIBLE_MS = 6000;

// Slack-style live alert. Subscribes to the current user's notification inserts
// and pops a toast in the top-right corner, regardless of which page they're on
// (the notifications page itself is excluded since it already shows them live).
export function NotificationToaster({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    );
    // Drop it after the exit animation finishes.
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 220);
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  // Browsers only grant notification permission from a user gesture, so ask on
  // the first click/keydown after mount, then stop listening.
  useEffect(() => {
    const request = () => {
      void ensureNotificationPermission();
      window.removeEventListener("pointerdown", request);
      window.removeEventListener("keydown", request);
    };
    window.addEventListener("pointerdown", request);
    window.addEventListener("keydown", request);
    return () => {
      window.removeEventListener("pointerdown", request);
      window.removeEventListener("keydown", request);
    };
  }, []);

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    void getRealtimeClient().then((supabase) => {
      if (cancelled) return;
      channel = supabase
        .channel(`notification-toaster:${workspaceId}:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          async (payload) => {
            const id = (payload.new as { id?: string })?.id;
            if (!id) return;
            // Don't pop a toast while the user is reading the notifications page.
            if (pathnameRef.current.endsWith("/notifications")) return;

            const { data } = await supabase
              .from("notifications")
              .select(NOTIFICATION_SELECT)
              .eq("id", id)
              .single();
            if (!data) return;
            const row = data as unknown as NotificationWithActor;

            playNotificationSound();
            const href = notificationHref(workspaceId, row);
            const context = notificationContext(workspaceId, row);
            showDesktopNotification({
              title: context ? `${row.title} (${context})` : row.title,
              body: row.body,
              icon: row.actor?.avatar_url ?? undefined,
              tag: row.id,
              onClick: href ? () => (window.location.href = href) : undefined,
            });
            setToasts((prev) => {
              if (prev.some((t) => t.id === row.id)) return prev;
              // Cap the stack so a burst doesn't fill the screen.
              return [row, ...prev].slice(0, 4);
            });
            const timer = setTimeout(() => dismiss(row.id), VISIBLE_MS);
            timers.current.set(row.id, timer);
          },
        )
        .subscribe();
    });

    const pending = timers.current;
    return () => {
      cancelled = true;
      if (channel) void channel.unsubscribe();
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, [workspaceId, userId, dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((n) => {
        const href = notificationHref(workspaceId, n);
        const icon = TYPE_ICON[n.type] ?? TYPE_ICON.dm;
        const actorName = n.actor?.full_name ?? n.actor?.email ?? null;
        const inner = (
          <div
            className={`glass pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-surface/95 p-3.5 shadow-lg shadow-black/10 backdrop-blur transition-colors hover:border-primary/40 ${
              n.leaving ? "animate-toast-out" : "animate-toast-in"
            }`}
          >
            <span className="relative mt-0.5 shrink-0">
              {actorName ? (
                <Avatar
                  name={n.actor?.full_name}
                  email={n.actor?.email}
                  avatarUrl={n.actor?.avatar_url}
                  size="sm"
                />
              ) : (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={icon} />
                  </svg>
                </span>
              )}
              <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full border-2 border-surface bg-primary text-primary-foreground">
                <svg
                  viewBox="0 0 24 24"
                  className="h-2.5 w-2.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={icon} />
                </svg>
              </span>
            </span>
            <div className="min-w-0 flex-1">
              {(() => {
                const context = notificationContext(workspaceId, n);
                return (
                  context && (
                    <p className="mb-0.5 truncate text-[11px] font-medium uppercase tracking-wide text-primary">
                      {context}
                    </p>
                  )
                );
              })()}
              <p className="truncate text-sm font-semibold text-foreground">
                {n.title}
              </p>
              {n.body && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                  {n.body}
                </p>
              )}
            </div>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dismiss(n.id);
              }}
              aria-label="Dismiss notification"
              className="pointer-events-auto -mr-1 -mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
        return href ? (
          <Link key={n.id} href={href} onClick={() => dismiss(n.id)}>
            {inner}
          </Link>
        ) : (
          <div key={n.id}>{inner}</div>
        );
      })}
    </div>
  );
}
