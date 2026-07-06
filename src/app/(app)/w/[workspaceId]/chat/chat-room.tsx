"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useTransition,
} from "react";
import type { MessageWithRelations } from "@/lib/chat-shared";
import { useChatMessages } from "@/lib/use-chat-messages";
import { useMessageAlerts } from "@/lib/use-message-alerts";
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
import { Composer, type MentionMember } from "./composer";
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
  members = [],
  initialMessages,
  lastReadAt,
}: {
  target: Target;
  meId: string;
  meName: string;
  members?: MentionMember[];
  initialMessages: MessageWithRelations[];
  lastReadAt?: string | null;
}) {
  const { messages, setMessages } = useChatMessages(
    { channelId: target.channelId, conversationId: target.conversationId },
    initialMessages,
  );
  const [, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Where the user left off, computed once from the server-provided read
  // state at open. markRead below advances the DB immediately, so this frozen
  // snapshot is what keeps the "New" divider in place while reading.
  const firstUnreadRef = useRef<{ id: string | null; count: number }>(
    undefined as never,
  );
  if (firstUnreadRef.current === undefined) {
    let id: string | null = null;
    let count = 0;
    // Never-opened rooms (no read state) open at the bottom like before.
    if (lastReadAt) {
      const cutoff = new Date(lastReadAt).getTime();
      for (const m of initialMessages) {
        if (m.deleted_at || m.user_id === meId) continue;
        if (new Date(m.created_at).getTime() > cutoff) {
          id ??= m.id;
          count += 1;
        }
      }
    }
    firstUnreadRef.current = { id, count };
  }
  const firstUnreadId = firstUnreadRef.current.id;

  // Optimistic outgoing messages (instant echo before the server row arrives).
  // Realtime can deliver the real row before the send transition ends; once it
  // has (same author + body, sent moments ago), drop the temp echo so the
  // message isn't shown twice mid-send.
  const [optimistic, addOptimistic] = useOptimistic(
    messages,
    (state, pending: MessageWithRelations) => {
      const arrived = state.some(
        (m) =>
          !m.id.startsWith("temp-") &&
          m.user_id === pending.user_id &&
          m.body === pending.body &&
          Math.abs(
            new Date(m.created_at).getTime() -
              new Date(pending.created_at).getTime(),
          ) < 15000,
      );
      return arrived ? state : [...state, pending];
    },
  );

  const { typingUsers, broadcastTyping } = useTyping(target, meId, meName);
  const { unreadCount, setAtBottom } = useMessageAlerts(
    messages,
    meId,
    firstUnreadRef.current.count,
  );

  // Whether the viewport is near the bottom - controls auto-scroll and whether
  // the "new messages" pill accrues.
  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  // Initial position: land on the first unread message (with the "New"
  // divider just above the viewport top) so reading resumes where the user
  // left off; with nothing unread, open at the newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (firstUnreadId) {
      const row = el.querySelector(`[data-message-id="${firstUnreadId}"]`);
      if (row) {
        (row as HTMLElement).scrollIntoView({ block: "start" });
        el.scrollTop -= 56; // breathing room so the divider is visible
        setAtBottom(isNearBottom());
        return;
      }
    }
    bottomRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to newest only when the user is already at the bottom, so we
  // don't yank them away while they're reading history.
  useEffect(() => {
    if (isNearBottom()) scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Echo the sender so the optimistic row shows the name/avatar, not
      // "Unknown", until the real row (with the full profile) arrives.
      profiles: {
        id: meId,
        email: meName,
        full_name: meName,
        title: null,
        avatar_url: null,
        presence: "online",
        last_seen_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
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

  // Toggle a reaction optimistically so it appears instantly, then persist.
  // Realtime will reconcile the row with the authoritative server state.
  function handleReact(messageId: string, emoji: string) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const mine = m.message_reactions.find(
          (r) => r.user_id === meId && r.emoji === emoji,
        );
        if (mine) {
          return {
            ...m,
            message_reactions: m.message_reactions.filter(
              (r) => r !== mine,
            ),
          };
        }
        return {
          ...m,
          message_reactions: [
            ...m.message_reactions,
            {
              id: `temp-${crypto.randomUUID()}`,
              message_id: messageId,
              user_id: meId,
              emoji,
              created_at: new Date().toISOString(),
            },
          ],
        };
      }),
    );
    startTransition(() => {
      void toggleReaction(messageId, emoji);
    });
  }

  // Deleted messages disappear entirely (no placeholder row). Filtering before
  // day-grouping also removes dividers for days left with no visible messages.
  const grouped = useMemo(
    () => groupByDay(optimistic.filter((m) => !m.deleted_at)),
    [optimistic],
  );

  return (
    <div className="relative flex h-full flex-col">
      <div
        ref={scrollRef}
        onScroll={() => setAtBottom(isNearBottom())}
        className="flex-1 overflow-y-auto px-2 py-4 sm:px-4 sm:py-6"
      >
        {optimistic.length === 0 && (
          <div className="grid h-full place-items-center text-center">
            <div className="flex flex-col items-center animate-fade-in-up">
              <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-linear-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-inset ring-primary/10">
                <svg
                  className="h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <p className="text-base font-semibold text-foreground">
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
            <div className="sticky top-0 z-10 my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-linear-to-r from-transparent to-border" />
              <span className="rounded-full border border-border bg-surface px-3.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted shadow-sm">
                {day}
              </span>
              <span className="h-px flex-1 bg-linear-to-l from-transparent to-border" />
            </div>
            {items.map((m, i) => {
              const prev = items[i - 1];
              // A message only chains onto the previous one when that message
              // actually shows an author header - deleted rows and system
              // lines render without one, so they break the group.
              const grouped =
                prev &&
                !prev.deleted_at &&
                prev.kind !== "system" &&
                m.kind !== "system" &&
                prev.user_id === m.user_id &&
                !m.parent_id &&
                new Date(m.created_at).getTime() -
                  new Date(prev.created_at).getTime() <
                  5 * 60 * 1000;
              return (
                <div key={m.id} data-message-id={m.id}>
                  {m.id === firstUnreadId && (
                    <div className="my-3 flex items-center gap-3" aria-label="New messages">
                      <span className="h-px flex-1 bg-danger/50" />
                      <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-danger">
                        New
                      </span>
                    </div>
                  )}
                <MessageItem
                  message={m}
                  meId={meId}
                  grouped={!!grouped}
                  onReact={(emoji) => handleReact(m.id, emoji)}
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
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {unreadCount > 0 && (
        <button
          onClick={() => {
            scrollToBottom();
            setAtBottom(true);
          }}
          className="absolute bottom-28 left-1/2 z-20 flex -translate-x-1/2 animate-scale-in cursor-pointer items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-lg transition-opacity hover:opacity-90"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
          {unreadCount} new {unreadCount === 1 ? "message" : "messages"}
        </button>
      )}

      <TypingIndicator users={typingUsers} />

      <Composer
        workspaceId={target.workspaceId}
        meId={meId}
        members={members}
        onSend={handleSend}
        onTyping={broadcastTyping}
      />
    </div>
  );
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function groupByDay(messages: MessageWithRelations[]) {
  const out: { day: string; items: MessageWithRelations[] }[] = [];
  for (const m of messages) {
    const day = dayLabel(m.created_at);
    const last = out[out.length - 1];
    if (last && last.day === day) last.items.push(m);
    else out.push({ day, items: [m] });
  }
  return out;
}
