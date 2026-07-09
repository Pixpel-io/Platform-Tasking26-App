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
    let cancelled = false;

    void getRealtimeClient().then((supabase) => {
      if (cancelled) return;

      async function recount() {
        const { data } = await supabase
          .from("notifications")
          .select("workspace_id")
          .is("read_at", null);
        const next: Record<string, number> = {};
        for (const row of data ?? []) {
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
            const wid = (payload.new as { workspace_id?: string })
              ?.workspace_id;
            if (wid) {
              setCounts((prev) => ({ ...prev, [wid]: (prev[wid] ?? 0) + 1 }));
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
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) void channel.unsubscribe();
    };
  }, [userId]);

  return counts;
}
