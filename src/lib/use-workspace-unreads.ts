"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getRealtimeClient } from "@/lib/supabase/client";

// Live unread-notification counts per workspace for the current user - drives
// the badges in the workspace switcher. Seeded from the server, inserts bump
// the right workspace, read-updates trigger a cheap full recount.
export function useWorkspaceUnreads(
  userId: string,
  initial: Record<string, number>,
): Record<string, number> {
  const [counts, setCounts] = useState(initial);
  // Re-seed without a setState-in-effect: track the last server snapshot and
  // reset state during render when it changes (React's recommended pattern).
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setCounts(initial);
  }

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let client: Awaited<ReturnType<typeof getRealtimeClient>> | null = null;
    let cancelled = false;

    void getRealtimeClient().then((supabase) => {
      if (cancelled) return;
      client = supabase;

      async function recount() {
        // Mirror getUnreadCountsByWorkspace: DM notifications are cross-
        // workspace, they shouldn't inflate a specific workspace's badge.
        const { data } = await supabase
          .from("notifications")
          .select("workspace_id")
          .neq("type", "dm")
          .neq("type", "mail.new")
          .is("read_at", null);
        const next: Record<string, number> = {};
        for (const row of data ?? []) {
          if (!row.workspace_id) continue;
          next[row.workspace_id] = (next[row.workspace_id] ?? 0) + 1;
        }
        setCounts(next);
      }

      channel = supabase
        .channel(`workspace-unreads:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const row = payload.new as {
              workspace_id?: string | null;
              type?: string;
            };
            // DM notifications are cross-workspace; don't inflate any
            // specific workspace's badge with them.
            if (row.type === "dm" || row.type === "mail.new") return;
            if (row.workspace_id) {
              setCounts((prev) => ({
                ...prev,
                [row.workspace_id!]: (prev[row.workspace_id!] ?? 0) + 1,
              }));
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          () => void recount(),
        )
        .subscribe((status) => {
          // Any INSERT that landed between the server-rendered seed and the
          // subscription going live would be silently missed - the SQA
          // reported this as "another workspace got a notification but no
          // badge showed". A recount the moment we're SUBSCRIBED closes
          // that gap and also self-heals after a reconnect.
          if (status === "SUBSCRIBED") void recount();
        });
    });

    return () => {
      cancelled = true;
      // removeChannel drops the channel from the client's registry so the
      // next mount (Strict Mode / HMR) gets a fresh one; plain unsubscribe
      // leaves it cached and the next .on() call throws.
      if (channel && client) void client.removeChannel(channel);
    };
  }, [userId]);

  return counts;
}
