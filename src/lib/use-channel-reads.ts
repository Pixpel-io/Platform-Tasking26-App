"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { ChannelRead } from "@/lib/chat-shared";
import { getRealtimeClient } from "@/lib/supabase/client";

// Live read positions of every member in a group, for read receipts. Seeds
// from the server snapshot, then keeps each member's row current as they read
// (read_state INSERT/UPDATE, published + RLS-exposed to channel peers by
// migration 0034). Keyed by user_id so a member has exactly one entry.
export function useChannelReads(
  channelId: string | undefined,
  initial: ChannelRead[],
) {
  const [reads, setReads] = useState<Record<string, ChannelRead>>(() =>
    seed(initial),
  );

  // Re-seed when the room (or its server snapshot) changes.
  useEffect(() => {
    setReads(seed(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    if (!channelId) return;
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    const apply = (row: ChannelRead) =>
      setReads((prev) => ({
        ...prev,
        [row.user_id]: {
          user_id: row.user_id,
          last_read_at: row.last_read_at,
          last_read_message_id: row.last_read_message_id ?? null,
        },
      }));

    void getRealtimeClient().then((supabase) => {
      if (cancelled) return;
      channel = supabase
        .channel(`channel-reads:${channelId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "read_state",
            filter: `channel_id=eq.${channelId}`,
          },
          (payload) => {
            const row = payload.new as ChannelRead | null;
            if (row?.user_id) apply(row);
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) void channel.unsubscribe();
    };
  }, [channelId]);

  return reads;
}

function seed(initial: ChannelRead[]): Record<string, ChannelRead> {
  const out: Record<string, ChannelRead> = {};
  for (const r of initial) out[r.user_id] = r;
  return out;
}
