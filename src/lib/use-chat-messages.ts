"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MessageWithRelations } from "@/lib/chat-shared";

// Name the sender FK explicitly — `messages` also has pinned_by → profiles,
// so a bare profiles(*) embed is ambiguous and resolves to null.
const MESSAGE_SELECT =
  "*, profiles:profiles!messages_user_id_fkey(*), message_reactions(*), message_attachments(*)";

type Target = { channelId?: string; conversationId?: string };

// Subscribes to message + reaction changes for one channel/conversation and
// keeps a live, ordered list of top-level messages. Reactions/edits/deletes
// re-fetch only the affected row to stay cheap.
export function useChatMessages(
  target: Target,
  initial: MessageWithRelations[],
) {
  const [messages, setMessages] = useState<MessageWithRelations[]>(initial);
  const targetKey = target.channelId ?? target.conversationId ?? "";
  const column = target.channelId ? "channel_id" : "conversation_id";

  // Reset when the room changes (keyed by target id, not the array identity).
  const initialRef = useRef(initial);
  initialRef.current = initial;
  useEffect(() => {
    setMessages(initialRef.current);
  }, [targetKey]);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    if (!targetKey) return;
    const supabase = createClient();

    async function refetchOne(id: string) {
      const { data } = await supabase
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("id", id)
        .single();
      if (!data) return;
      const row = data as unknown as MessageWithRelations;
      // Only top-level messages belong in the main list.
      if (row.parent_id) return;
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === row.id);
        if (row.deleted_at && idx === -1) return prev;
        if (idx === -1) return [...prev, row];
        const next = [...prev];
        next[idx] = row;
        return next;
      });
    }

    const channel = supabase
      .channel(`chat:${column}:${targetKey}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `${column}=eq.${targetKey}`,
        },
        (payload) => {
          const id =
            (payload.new as { id?: string })?.id ??
            (payload.old as { id?: string })?.id;
          if (id) void refetchOne(id);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        (payload) => {
          const mid =
            (payload.new as { message_id?: string })?.message_id ??
            (payload.old as { message_id?: string })?.message_id;
          if (mid && messagesRef.current.some((m) => m.id === mid)) {
            void refetchOne(mid);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetKey, column]);

  return { messages, setMessages };
}
