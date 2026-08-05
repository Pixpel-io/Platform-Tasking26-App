"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getRealtimeClient } from "@/lib/supabase/client";

// Mail is user-global rather than workspace-owned. Seed on the server so the
// badge is correct on first paint, then recount on every relevant realtime
// change so new mail and read-on-open updates stay in sync across tabs/devices.
export function useMailUnreads(userId: string, initialCount: number) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => setCount(initialCount), [initialCount]);

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let client: Awaited<ReturnType<typeof getRealtimeClient>> | null = null;
    let recount: (() => Promise<void>) | null = null;
    const onLocalRead = () => void recount?.();
    window.addEventListener("tasking:mail-read-state-changed", onLocalRead);

    void getRealtimeClient().then((supabase) => {
      if (cancelled) return;
      client = supabase;

      recount = async () => {
        const { count: next } = await supabase
          .from("mail_notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .is("read_at", null);
        if (!cancelled) setCount(next ?? 0);
      };

      channel = supabase
        .channel(`mail-unreads:${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "mail_notifications", filter: `user_id=eq.${userId}` },
          () => void recount?.(),
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") void recount?.();
        });
    });

    return () => {
      cancelled = true;
      window.removeEventListener("tasking:mail-read-state-changed", onLocalRead);
      if (channel && client) void client.removeChannel(channel);
    };
  }, [userId]);

  return count;
}
