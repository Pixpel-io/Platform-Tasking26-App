"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { ConversationWithParticipants } from "@/lib/chat-shared";
import { getRealtimeClient } from "@/lib/supabase/client";

// Last-activity time per DM conversation, kept live so the DM list re-sorts
// the moment a message is sent or received (WhatsApp-style: latest chat on
// top). Seeds from conversations.updated_at (bumped per message by migration
// 0036) and advances on realtime message INSERTs - RLS scopes delivery to
// conversations the user participates in.
export function useDmActivity(
  userId: string,
  conversations: ConversationWithParticipants[],
): Record<string, number> {
  const [activity, setActivity] = useState<Record<string, number>>(() =>
    seed(conversations),
  );

  // Re-seed when the server list changes (new conversation, refresh).
  useEffect(() => {
    setActivity((prev) => ({ ...seed(conversations), ...prev }));
  }, [conversations]);

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    void getRealtimeClient().then((supabase) => {
      if (cancelled) return;
      channel = supabase
        .channel(`dm-activity:${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            const row = payload.new as {
              conversation_id?: string | null;
              created_at?: string;
            };
            if (!row.conversation_id) return;
            const at = row.created_at
              ? new Date(row.created_at).getTime()
              : Date.now();
            setActivity((prev) =>
              (prev[row.conversation_id as string] ?? 0) >= at
                ? prev
                : { ...prev, [row.conversation_id as string]: at },
            );
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) void channel.unsubscribe();
    };
  }, [userId]);

  return activity;
}

function seed(
  conversations: ConversationWithParticipants[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of conversations) {
    out[c.id] = new Date(c.updated_at).getTime();
  }
  return out;
}
