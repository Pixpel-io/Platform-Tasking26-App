"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getRealtimeClient } from "@/lib/supabase/client";

// Keep the sidebar / switcher tiles in sync when a workspace is renamed, its
// accent colour is changed, a new logo is uploaded, or it's soft-deleted.
// One subscription per user - RLS scopes rows to workspaces the caller is a
// member of, so we never leak events for workspaces they don't belong to.
//
// If the CURRENT workspace is soft-deleted (deleted_at set), the router
// refresh will hit the workspace layout's membership guard on the server and
// send the user home; no client-side redirect logic needed here.
export function useWorkspacesLive(userId: string) {
  const router = useRouter();

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let client: Awaited<ReturnType<typeof getRealtimeClient>> | null = null;
    let cancelled = false;

    void getRealtimeClient().then((supabase) => {
      if (cancelled) return;
      client = supabase;
      channel = supabase
        .channel(`workspaces-live:${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "workspaces" },
          () => router.refresh(),
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel && client) void client.removeChannel(channel);
    };
  }, [userId, router]);
}
