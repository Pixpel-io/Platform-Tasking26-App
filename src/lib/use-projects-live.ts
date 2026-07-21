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
export function useProjectsLive(workspaceId: string) {
  const router = useRouter();

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

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
          () => router.refresh(),
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
          () => router.refresh(),
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) void channel.unsubscribe();
    };
  }, [workspaceId, router]);
}
