"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getRealtimeClient } from "@/lib/supabase/client";

// Live per-board unread-notification counts inside one workspace - drives the
// badges next to each task board in the sidebar. Same shape as
// useWorkspaceUnreads: server-seeded, INSERT bumps the matching project,
// UPDATE triggers a cheap full recount (so "mark as read" clears the badge
// live for every open tab).
export function useProjectUnreads(
  workspaceId: string,
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
          .select("project_id")
          .eq("workspace_id", workspaceId)
          .not("project_id", "is", null)
          .is("read_at", null);
        const next: Record<string, number> = {};
        for (const row of data ?? []) {
          if (!row.project_id) continue;
          next[row.project_id] = (next[row.project_id] ?? 0) + 1;
        }
        setCounts(next);
      }

      channel = supabase
        .channel(`project-unreads:${workspaceId}:${userId}`)
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
              project_id?: string | null;
            };
            if (row.workspace_id !== workspaceId) return;
            if (!row.project_id) return;
            setCounts((prev) => ({
              ...prev,
              [row.project_id!]: (prev[row.project_id!] ?? 0) + 1,
            }));
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
  }, [workspaceId, userId]);

  return counts;
}
