"use client";

import {
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import type { MessageWithRelations } from "@/lib/chat-shared";
import { useChatMessages } from "@/lib/use-chat-messages";
import {
  deleteMessage,
  editMessage,
  markRead,
  sendMessage,
  togglePin,
  toggleReaction,
  type PendingAttachment,
} from "../chat-actions";
import { MessageItem } from "./message-item";
import { Composer } from "./composer";
import { TypingIndicator, useTyping } from "./typing";

type Target = {
  workspaceId: string;
  channelId?: string;
  conversationId?: string;
};

export function ChatRoom({
  target,
  meId,
  meName,
  initialMessages,
}: {
  target: Target;
  meId: string;
  meName: string;
  initialMessages: MessageWithRelations[];
}) {
  const { messages } = useChatMessages(
    { channelId: target.channelId, conversationId: target.conversationId },
    initialMessages,
  );
  const [, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Optimistic outgoing messages (instant echo before the server row arrives).
  const [optimistic, addOptimistic] = useOptimistic(
    messages,
    (state, pending: MessageWithRelations) => [...state, pending],
  );

  const { typingUsers, broadcastTyping } = useTyping(target, meId, meName);

  // Auto-scroll to newest.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [optimistic.length]);

  // Mark the room read when messages change.
  useEffect(() => {
    const last = messages[messages.length - 1];
    void markRead({
      channelId: target.channelId,
      conversationId: target.conversationId,
      lastMessageId: last?.id,
    });
  }, [messages, target.channelId, target.conversationId]);

  function handleSend(body: string, attachments: PendingAttachment[]) {
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimisticMsg: MessageWithRelations = {
      id: tempId,
      workspace_id: target.workspaceId,
      channel_id: target.channelId ?? null,
      conversation_id: target.conversationId ?? null,
      parent_id: null,
      user_id: meId,
      kind: "user",
      body,
      edited_at: null,
      pinned_at: null,
      pinned_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      profiles: null,
      message_reactions: [],
      message_attachments: [],
    };
    startTransition(async () => {
      addOptimistic(optimisticMsg);
      await sendMessage({
        workspaceId: target.workspaceId,
        channelId: target.channelId,
        conversationId: target.conversationId,
        body,
        attachments,
      });
    });
  }

  const grouped = useMemo(() => groupByDay(optimistic), [optimistic]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {optimistic.length === 0 && (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="text-sm font-medium text-foreground">
                This is the very beginning.
              </p>
              <p className="mt-1 text-sm text-muted">
                Send a message to start the conversation.
              </p>
            </div>
          </div>
        )}

        {grouped.map(({ day, items }) => (
          <div key={day}>
            <div className="my-4 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="rounded-full border border-border bg-surface px-3 py-0.5 text-xs text-muted">
                {day}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            {items.map((m, i) => {
              const prev = items[i - 1];
              const grouped =
                prev &&
                prev.user_id === m.user_id &&
                !m.parent_id &&
                new Date(m.created_at).getTime() -
                  new Date(prev.created_at).getTime() <
                  5 * 60 * 1000;
              return (
                <MessageItem
                  key={m.id}
                  message={m}
                  meId={meId}
                  grouped={!!grouped}
                  onReact={(emoji) =>
                    startTransition(() => {
                      void toggleReaction(m.id, emoji);
                    })
                  }
                  onEdit={(body) =>
                    startTransition(() => {
                      void editMessage(m.id, body);
                    })
                  }
                  onDelete={() =>
                    startTransition(() => {
                      void deleteMessage(m.id);
                    })
                  }
                  onPin={() =>
                    startTransition(() => {
                      void togglePin(m.id, !m.pinned_at);
                    })
                  }
                />
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <TypingIndicator users={typingUsers} />

      <Composer
        workspaceId={target.workspaceId}
        meId={meId}
        onSend={handleSend}
        onTyping={broadcastTyping}
      />
    </div>
  );
}

function groupByDay(messages: MessageWithRelations[]) {
  const out: { day: string; items: MessageWithRelations[] }[] = [];
  for (const m of messages) {
    const day = new Date(m.created_at).toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    const last = out[out.length - 1];
    if (last && last.day === day) last.items.push(m);
    else out.push({ day, items: [m] });
  }
  return out;
}
