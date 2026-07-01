"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  NOTIFICATION_SELECT,
  notificationHref,
  type NotificationWithActor,
} from "@/lib/notifications-shared";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "../notifications-actions";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const TYPE_ICON: Record<string, string> = {
  mention: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
  dm: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  "task.assigned": "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  "group.added":
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M19 8v6M22 11h-6",
};

export function NotificationsList({
  workspaceId,
  initial,
}: {
  workspaceId: string;
  initial: NotificationWithActor[];
}) {
  const [items, setItems] = useState(initial);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setItems(initial);
  }, [initial]);

  // Live-prepend new notifications as they arrive.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-page:${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        async (payload) => {
          const id = (payload.new as { id?: string })?.id;
          if (!id) return;
          const { data } = await supabase
            .from("notifications")
            .select(NOTIFICATION_SELECT)
            .eq("id", id)
            .single();
          if (!data) return;
          const row = data as unknown as NotificationWithActor;
          setItems((prev) =>
            prev.some((n) => n.id === row.id) ? prev : [row, ...prev],
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId]);

  const unread = items.filter((n) => !n.read_at).length;

  function onMarkAll() {
    setItems((prev) =>
      prev.map((n) =>
        n.read_at ? n : { ...n, read_at: new Date().toISOString() },
      ),
    );
    startTransition(() => {
      void markAllNotificationsRead(workspaceId);
    });
  }

  function onOpen(n: NotificationWithActor) {
    if (n.read_at) return;
    setItems((prev) =>
      prev.map((x) =>
        x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x,
      ),
    );
    startTransition(() => {
      void markNotificationRead(workspaceId, n.id);
    });
  }

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Notifications
          </h1>
          <p className="mt-1 text-muted">
            {unread > 0
              ? `${unread} unread`
              : "You're all caught up."}
          </p>
        </div>
        {unread > 0 && (
          <button
            onClick={onMarkAll}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-2"
          >
            Mark all read
          </button>
        )}
      </header>

      {items.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">
          No notifications yet.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const href = notificationHref(workspaceId, n);
            const icon = TYPE_ICON[n.type] ?? TYPE_ICON.dm;
            const inner = (
              <div
                className={`flex items-start gap-3 rounded-xl border p-4 transition-colors ${
                  n.read_at
                    ? "border-border bg-surface hover:bg-surface-2"
                    : "border-primary/30 bg-primary/5 hover:bg-primary/10"
                }`}
              >
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
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
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="mt-0.5 truncate text-sm text-muted">
                      {n.body}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted">
                    {timeAgo(n.created_at)}
                  </p>
                </div>
                {!n.read_at && (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
              </div>
            );
            return href ? (
              <Link key={n.id} href={href} onClick={() => onOpen(n)}>
                {inner}
              </Link>
            ) : (
              <button
                key={n.id}
                onClick={() => onOpen(n)}
                className="block w-full text-left"
              >
                {inner}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
