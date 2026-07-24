"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getRealtimeClient } from "@/lib/supabase/client";

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
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    void getRealtimeClient().then((supabase) => {
      if (cancelled) return;
      channel = supabase
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

            setCounts((prev) => ({
              ...prev,
              [row.channel_id as string]:
                (prev[row.channel_id as string] ?? 0) + 1,
            }));
          },
        )
        // Cross-device read sync — when this user reads a channel on
        // mobile (or another tab), Supabase writes their new last_read_at
        // to `read_state`. Drop the local unread count so the sidebar
        // badge matches what the other device now shows.
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
              channel_id?: string | null;
            } | null;
            const chId = row?.channel_id;
            if (!chId) return;
            setCounts((prev) => {
              if (!prev[chId]) return prev;
              const next = { ...prev };
              delete next[chId];
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
  }, [workspaceId, userId]);

  return counts;
}
