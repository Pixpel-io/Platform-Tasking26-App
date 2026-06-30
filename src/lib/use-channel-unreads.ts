"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { playNotificationSound } from "@/lib/notify-sound";

// Tracks unread message counts per group/channel for the sidebar, keyed by
// channel id. New top-level messages from OTHER users bump the count and play a
// notification sound; messages in the channel the user is currently viewing
// (matched against the pathname) are considered read and never accrue.
export function useChannelUnreads(
  workspaceId: string,
  userId: string,
  initial: Record<string, number>,
) {
  const [counts, setCounts] = useState<Record<string, number>>(initial);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Clear the badge for whichever channel the user is currently viewing.
  useEffect(() => {
    const match = pathname.match(/\/c\/([0-9a-f-]+)/i);
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
    const supabase = createClient();
    const channel = supabase
      .channel(`channel-unreads:${workspaceId}:${userId}`)
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
            channel_id?: string | null;
            user_id?: string;
            parent_id?: string | null;
          };
          // Only top-level channel messages from someone else count.
          if (!row.channel_id || row.parent_id) return;
          if (row.user_id === userId) return;

          // Ignore if the user is already viewing this channel.
          const active = pathnameRef.current.includes(`/c/${row.channel_id}`);
          if (active) return;

          playNotificationSound();
          setCounts((prev) => ({
            ...prev,
            [row.channel_id as string]:
              (prev[row.channel_id as string] ?? 0) + 1,
          }));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, userId]);

  return counts;
}
