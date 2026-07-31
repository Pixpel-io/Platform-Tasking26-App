"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getRealtimeClient } from "@/lib/supabase/client";

// Refresh the sidebar (and any header rendering the channel name) when a
// channel is renamed, its description updates, or another admin action
// changes the row. Channel creation / deletion is already covered by
// useProjectsLive-style hooks that watch channel_members; this handles the
// UPDATE case those miss.
export function useChannelsLive(workspaceId: string) {
  const router = useRouter();

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let client: Awaited<ReturnType<typeof getRealtimeClient>> | null = null;
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        router.refresh();
      }, 150);
    };

    void getRealtimeClient().then((supabase) => {
      if (cancelled) return;
      client = supabase;
      channel = supabase
        .channel(`channels-live:${workspaceId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "channels",
            filter: `workspace_id=eq.${workspaceId}`,
          },
          scheduleRefresh,
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (channel && client) void client.removeChannel(channel);
    };
  }, [workspaceId, router]);
}
