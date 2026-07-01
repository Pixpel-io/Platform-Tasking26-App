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
  workspaceId: string,
  userId: string,
  initial: Record<string, number>,
) {
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
        .channel(`dm-unreads:${workspaceId}:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `workspace_id=eq.${workspaceId}`,
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
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) void channel.unsubscribe();
    };
  }, [workspaceId, userId]);

  return counts;
}
