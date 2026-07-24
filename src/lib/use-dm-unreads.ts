"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getRealtimeClient } from "@/lib/supabase/client";

// Tracks unread message counts per direct-message conversation for the sidebar,
// keyed by conversation id. New messages from OTHER users bump the count and
// play a notification sound; messages in the room the user is currently viewing
// (matched against the pathname) are considered read and never accrue.
export function useDmUnreads(
  _workspaceId: string,
  userId: string,
  initial: Record<string, number>,
) {
  void _workspaceId;
  const [counts, setCounts] = useState<Record<string, number>>(initial);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Clear the badge for whichever conversation the user is currently viewing.
  useEffect(() => {
    const match = pathname.match(/\/dm\/([0-9a-f-]+)/i);
    const activeId = match?.[1];
    if (!activeId) return;
    setCounts((prev) => {
      if (!prev[activeId]) return prev;
      const next = { ...prev };
      delete next[activeId];
      return next;
    });
  }, [pathname]);

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    void getRealtimeClient().then((supabase) => {
      if (cancelled) return;
      channel = supabase
        .channel(`dm-unreads:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            // No workspace filter: DMs are global, and a message sent while
            // the sender sits in another workspace must still count here.
            // RLS already limits delivery to messages this user can read.
          },
          (payload) => {
            const row = payload.new as {
              conversation_id?: string | null;
              user_id?: string;
              parent_id?: string | null;
            };
            // Only top-level DM messages from someone else count.
            if (!row.conversation_id || row.parent_id) return;
            if (row.user_id === userId) return;

            // Ignore if the user is already viewing this conversation.
            const active = pathnameRef.current.includes(
              `/dm/${row.conversation_id}`,
            );
            if (active) return;

            setCounts((prev) => ({
              ...prev,
              [row.conversation_id as string]:
                (prev[row.conversation_id as string] ?? 0) + 1,
            }));
          },
        )
        // Cross-device read sync: when this user reads a DM on ANOTHER
        // device (mobile, or another browser), Supabase writes their new
        // last_read_at to `read_state`. We drop the local unread count
        // for that conversation immediately so the sidebar badge stays
        // consistent with what mobile/other-tab now shows.
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "read_state",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const row = (payload.new ?? payload.old) as {
              conversation_id?: string | null;
            } | null;
            const convId = row?.conversation_id;
            if (!convId) return;
            setCounts((prev) => {
              if (!prev[convId]) return prev;
              const next = { ...prev };
              delete next[convId];
              return next;
            });
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) void channel.unsubscribe();
    };
  }, [userId]);

  return counts;
}
