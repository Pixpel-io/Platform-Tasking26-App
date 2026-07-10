"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getRealtimeClient } from "@/lib/supabase/client";

// Refreshes the DM contact roster live when membership changes anywhere the
// current user can see it: someone accepting a workspace invite inserts a
// workspace_members row; accepting a personal DM invite inserts a
// dm_connections row. RLS scopes delivery, so events only arrive for
// workspaces/pairs this user belongs to.
export function useDmRoster(userId: string) {
  const router = useRouter();

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    void getRealtimeClient().then((supabase) => {
      if (cancelled) return;
      channel = supabase
        .channel(`dm-roster:${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "workspace_members" },
          () => router.refresh(),
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "dm_connections" },
          () => router.refresh(),
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) void channel.unsubscribe();
    };
  }, [userId, router]);
}
