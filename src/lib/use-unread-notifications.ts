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
        // Match getUnreadNotificationCount's server query: this workspace's
        // notifications PLUS global DM notifications (workspace_id null).
        const { count: c } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .or(`workspace_id.eq.${workspaceId},workspace_id.is.null`)
          .neq("type", "mail.new")
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
          (payload) => {
            // Bell counts this workspace's notifications + global DM ones
            // (workspace_id null). Skip inserts destined for other workspaces
            // so the badge stays accurate between recounts.
            const row = payload.new as { workspace_id?: string | null; type?: string };
            if (row.type === "mail.new") return;
            const wid = row.workspace_id;
            if (wid == null || wid === workspaceId) {
              setCount((c) => c + 1);
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
