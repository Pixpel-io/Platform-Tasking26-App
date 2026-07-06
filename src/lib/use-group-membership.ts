"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getRealtimeClient } from "@/lib/supabase/client";

// When the current user is added to (or removed from) a group, their own
// channel_members row changes. Refresh the router so the sidebar's group list
// reloads live - no page reload needed. Realtime evaluates the row against the
// user's SELECT policy, which now passes because they're a member.
export function useGroupMembership(userId: string) {
  const router = useRouter();

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    void getRealtimeClient().then((supabase) => {
      if (cancelled) return;
      channel = supabase
        .channel(`group-membership:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "channel_members",
            filter: `user_id=eq.${userId}`,
          },
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
