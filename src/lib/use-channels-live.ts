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
          () => router.refresh(),
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel && client) void client.removeChannel(channel);
    };
  }, [workspaceId, router]);
}
