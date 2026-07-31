"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getRealtimeClient } from "@/lib/supabase/client";

// Refreshes the sidebar / dashboard live when a project is created, renamed,
// soft-deleted or restored anywhere in this workspace. RLS scopes realtime
// delivery to rows the user can already see, so a member-only project never
// leaks to everyone; the current user just calls router.refresh() and the
// server re-queries their own visible list.
export function useProjectsLive(workspaceId: string, userId: string) {
  const router = useRouter();

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
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
      channel = supabase
        .channel(`projects:${workspaceId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "projects",
            filter: `workspace_id=eq.${workspaceId}`,
          },
          scheduleRefresh,
        )
        // A member added to a private project may only get to see it after the
        // project_members row lands - subscribe to that too so their view
        // catches up live without a manual reload.
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "project_members",
          },
          (payload) => {
            const memberId =
              (payload.new as { user_id?: string })?.user_id ??
              (payload.old as { user_id?: string })?.user_id;
            // Other members joining/leaving a board does not change this
            // user's sidebar. Refresh only when this user's access changes.
            if (memberId === userId) scheduleRefresh();
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (channel) void channel.unsubscribe();
    };
  }, [workspaceId, userId, router]);
}
