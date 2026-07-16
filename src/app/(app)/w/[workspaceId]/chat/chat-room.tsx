"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type { ChannelRead, MessageWithRelations } from "@/lib/chat-shared";
import { CLEOTILDA_ID } from "@/lib/cleotilda-shared";
import { useChannelReads } from "@/lib/use-channel-reads";
import { useChatMessages } from "@/lib/use-chat-messages";
import { useMessageAlerts } from "@/lib/use-message-alerts";
import {
  deleteMessage,
  editMessage,
  markRead,
  togglePin,
  toggleReaction,
} from "../chat-actions";
import { MessageItem } from "./message-item";
import { ForwardDialog } from "./forward-dialog";
import { buildReplySnippet } from "@/lib/chat-shared";
import { Composer, type MentionMember, type Selected } from "./composer";
import {
  enqueuePendingSend,
  pendingTargetKey,
  reconcilePendingSend,
  usePendingSends,
} from "./pending-store";
import { PendingMessageRow } from "./pending-message-row";
import {
  CleotildaThinking,
  TypingIndicator,
  useTypingBroadcast,
  useTypingIn,
} from "./typing";

const CLEOTILDA_HANDLE = "cleotilda";

type Target = {
  // Null when the room is opened from the global /dm shell (no workspace).
  workspaceId: string | null;
  channelId?: string;
  conversationId?: string;
};

export function ChatRoom({
  target,
  meId,
  meName,
  meAvatarUrl = null,
  members = [],
  initialMessages,
  lastReadAt,
  initialReads = [],
}: {
  target: Target;
  meId: string;
  meName: string;
  // Own avatar for the optimistic echo - without it the sender's DP blinks
  // to the letter fallback for a moment on every send.
  meAvatarUrl?: string | null;
  members?: MentionMember[];
  initialMessages: MessageWithRelations[];
  lastReadAt?: string | null;
  // Group read receipts: every channel member's last-read position at open.
  // Empty for DMs (receipts are group-only).
  initialReads?: ChannelRead[];
}) {
  const { messages, setMessages } = useChatMessages(
    { channelId: target.channelId, conversationId: target.conversationId },
    initialMessages,
  );
  const [, startTransition] = useTransition();
  // The message the composer is currently replying to (inline quoted reply).
  const [replyTo, setReplyTo] = useState<MessageWithRelations | null>(null);
  // The message being forwarded (opens the destination picker dialog).
  const [forwarding, setForwarding] = useState<MessageWithRelations | null>(
    null,
  );
  // True while a message that summoned @cleotilda is awaiting its AI reply, so
  // the room can show a "Cleotilda is thinking…" three-dot indicator.
  const [cleotildaThinking, setCleotildaThinking] = useState(false);
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

  // In-flight sends (upload + insert not yet confirmed) live in a module-level
  // store that survives chat navigation - see pending-store.ts. Ghost rows for
  // them get appended to the message list below.
  const pendingSends = usePendingSends(target);

  // When a real message arrives that matches one of our pending sends, drop
  // the ghost so the row isn't shown twice. Matching is body + author + close
  // timestamp - the send action doesn't echo the client id, so we can't match
  // by id.
  useEffect(() => {
    const tk = pendingTargetKey(target);
    for (const m of messages) {
      if (m.user_id !== meId) continue;
      reconcilePendingSend({
        targetKey: tk,
        userId: meId,
        body: m.body,
        createdAt: m.created_at,
      });
    }
  }, [messages, target, meId]);

  const typingUsers = useTypingIn(target);
  const broadcastTyping = useTypingBroadcast(target);
  const { unreadCount, setAtBottom } = useMessageAlerts(
    messages,
    meId,
    firstUnreadRef.current.count,
  );

  // Group read receipts: each member's live last-read position. DMs pass no
  // channelId, so this stays inert (empty) there.
  const channelReads = useChannelReads(target.channelId, initialReads);

  // Instagram-style: show each reader's avatar once, under the newest message
  // they've read (their high-water mark) - not on every earlier message. Only
  // for groups; skip yourself and never tag a reader under their own message.
  const readReceipts = useMemo(() => {
    const out: Record<string, MentionMember[]> = {};
    if (!target.channelId) return out;
    const memberById = new Map(members.map((m) => [m.id, m]));
    const visible = messages.filter((m) => !m.deleted_at);
    for (const read of Object.values(channelReads)) {
      if (read.user_id === meId) continue;
      const member = memberById.get(read.user_id);
      if (!member) continue;
      const readTime = new Date(read.last_read_at).getTime();
      let mark: MessageWithRelations | null = null;
      for (let i = visible.length - 1; i >= 0; i--) {
        if (new Date(visible[i].created_at).getTime() <= readTime) {
          mark = visible[i];
          break;
        }
      }
      if (mark && mark.user_id !== read.user_id) {
        (out[mark.id] ??= []).push(member);
      }
    }
    return out;
  }, [target.channelId, channelReads, members, messages, meId]);

  // Resolve any reactor's user_id to a display profile for the "who reacted"
  // popover. Sourced from channel members (empty in DMs), the current user, and
  // every loaded message's author - which together cover anyone who can react.
  const reactorById = useMemo(() => {
    const map = new Map<
      string,
      { full_name: string | null; email: string | null; avatar_url: string | null }
    >();
    for (const m of members) {
      map.set(m.id, {
        full_name: m.full_name,
        email: m.email,
        avatar_url: m.avatar_url,
      });
    }
    for (const msg of messages) {
      if (msg.profiles && !map.has(msg.user_id)) {
        map.set(msg.user_id, {
          full_name: msg.profiles.full_name,
          email: msg.profiles.email,
          avatar_url: msg.profiles.avatar_url,
        });
      }
    }
    map.set(meId, {
      full_name: meName,
      email: map.get(meId)?.email ?? null,
      avatar_url: meAvatarUrl,
    });
    return map;
  }, [members, messages, meId, meName, meAvatarUrl]);

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

  // Jump to a quoted original when its reply's quote strip is clicked, and
  // flash it so the eye lands on the right row (Slack/WhatsApp behaviour).
  const scrollToMessage = useCallback((messageId: string) => {
    const el = scrollRef.current;
    const row = el?.querySelector(`[data-message-id="${messageId}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    const target = row.querySelector("[data-message-body]") ?? row;
    target.classList.add("reply-flash");
    setTimeout(() => target.classList.remove("reply-flash"), 1600);
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

  // Auto-scroll to newest when the user is already at the bottom (so we don't
  // yank them away while reading history) - or when a new pending send lands,
  // which should always show the user what they just posted.
  useEffect(() => {
    if (pendingSends.length > 0 || isNearBottom()) {
      scrollToBottom();
      if (pendingSends.length > 0) setAtBottom(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, pendingSends.length]);

  // Keep the "Cleotilda is thinking…" indicator in view when it appears.
  useEffect(() => {
    if (cleotildaThinking && isNearBottom()) scrollToBottom();
  }, [cleotildaThinking, isNearBottom, scrollToBottom]);

  // The responder is detached from the send action, so the dots clear when
  // Cleotilda's reply arrives over realtime - with a timeout backstop in case
  // it never does (AI failure is swallowed server-side and posts nothing).
  const lastMsg = messages[messages.length - 1];
  useEffect(() => {
    if (cleotildaThinking && lastMsg?.user_id === CLEOTILDA_ID) {
      setCleotildaThinking(false);
    }
  }, [cleotildaThinking, lastMsg]);
  useEffect(() => {
    if (!cleotildaThinking) return;
    const t = setTimeout(() => setCleotildaThinking(false), 120_000);
    return () => clearTimeout(t);
  }, [cleotildaThinking]);

  // Mark the room read when messages change.
  useEffect(() => {
    const last = messages[messages.length - 1];
    void markRead({
      channelId: target.channelId,
      conversationId: target.conversationId,
      lastMessageId: last?.id,
    });
  }, [messages, target.channelId, target.conversationId]);

  function handleSend(body: string, files: Selected[]) {
    // Snapshot the reply target now; the banner is cleared right after so the
    // pending send (and the persisted row) still carry the quote.
    const replyingTo = replyTo;
    // A summon shows the thinking indicator until Cleotilda's reply lands via
    // realtime (sendMessage returns before the AI finishes - the responder
    // runs in after(), detached from the action).
    const summonsCleotilda = new RegExp(`@${CLEOTILDA_HANDLE}\\b`, "i").test(
      body,
    );
    if (summonsCleotilda) setCleotildaThinking(true);
    setReplyTo(null);
    enqueuePendingSend({
      workspaceId: target.workspaceId,
      channelId: target.channelId,
      conversationId: target.conversationId,
      body,
      replyToId: replyingTo?.id ?? null,
      meId,
      meName,
      meAvatarUrl,
      files,
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
    () => groupByDay(messages.filter((m) => !m.deleted_at)),
    [messages],
  );

  return (
    <div className="relative flex h-full flex-col">
      <div
        ref={scrollRef}
        onScroll={() => setAtBottom(isNearBottom())}
        className="flex-1 overflow-y-auto px-2 py-4 sm:px-4 sm:py-6"
      >
        {messages.length === 0 && pendingSends.length === 0 && (
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
                  readers={readReceipts[m.id]}
                  reactorById={reactorById}
                  onReply={() => setReplyTo(m)}
                  onForward={() => setForwarding(m)}
                  onJumpToMessage={scrollToMessage}
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
        {pendingSends.map((s) => (
          <PendingMessageRow key={s.id} send={s} />
        ))}
        {cleotildaThinking && <CleotildaThinking />}
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
        replyTo={
          replyTo
            ? {
                id: replyTo.id,
                authorName:
                  replyTo.user_id === meId
                    ? "yourself"
                    : replyTo.profiles?.full_name ??
                      replyTo.profiles?.email ??
                      "Unknown",
                snippet: buildReplySnippet(replyTo),
              }
            : null
        }
        onCancelReply={() => setReplyTo(null)}
      />

      {forwarding && (
        <ForwardDialog
          message={forwarding}
          workspaceId={target.workspaceId}
          onClose={() => setForwarding(null)}
        />
      )}
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
