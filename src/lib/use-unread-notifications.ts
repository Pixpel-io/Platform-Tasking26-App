"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getRealtimeClient } from "@/lib/supabase/client";

// Live unread-notification count for the current user in a workspace. Seeded
// from the server count, then kept in sync via Realtime: inserts bump it,
// updates that set read_at re-count from the server (cheap, head-only).
export function useUnreadNotifications(
  workspaceId: string,
  userId: string,
  initialCount: number,
) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let client: Awaited<ReturnType<typeof getRealtimeClient>> | null = null;
    let cancelled = false;

    void getRealtimeClient().then((supabase) => {
      if (cancelled) return;
      client = supabase;

      async function recount() {
        const { count: c } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .is("read_at", null);
        setCount(c ?? 0);
      }

      channel = supabase
        .channel(`notifications:${workspaceId}:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          () => setCount((c) => c + 1),
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
          // Recount on SUBSCRIBED so anything that landed in the gap between
          // the server seed and the live channel is picked up.
          if (status === "SUBSCRIBED") void recount();
        });
    });

    return () => {
      cancelled = true;
      // removeChannel drops the channel from the client's registry, so a
      // fresh mount (Strict Mode / HMR) gets a new channel object; plain
      // .unsubscribe() leaves it cached and the next .on() call throws
      // "cannot add postgres_changes callbacks after subscribe()".
      if (channel && client) void client.removeChannel(channel);
    };
  }, [workspaceId, userId]);

  return count;
}
