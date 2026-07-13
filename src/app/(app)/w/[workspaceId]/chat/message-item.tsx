"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { useProfileCard } from "@/components/profile-card";
import { EmojiPicker } from "@/components/emoji-picker";
import type { MessageWithRelations } from "@/lib/chat-shared";
import { QUICK_REACTIONS } from "@/lib/emoji";
import { formatMessageBody } from "@/lib/message-format";
import {
  CLEOTILDA_ID,
  isViaCleotilda,
  stripViaCleotilda,
} from "@/lib/cleotilda-shared";
import { AttachmentView } from "./attachment-view";
import type { MentionMember } from "./composer";

const CLEOTILDA_LOGO = "/image/taskcycle-ios-appicon-1024.png";

// Cleotilda posts via an RPC and isn't a normal profile row, so the joined
// author can arrive null and the message shows a logo + name of its own.
function CleotildaAvatar() {
  return (
    <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2">
      <Image
        src={CLEOTILDA_LOGO}
        alt="Cleotilda"
        width={36}
        height={36}
        className="h-full w-full object-cover"
        draggable={false}
      />
    </span>
  );
}

// Renders body text with @mentions highlighted + Slack-style code formatting.
function Body({ text }: { text: string }) {
  return formatMessageBody(text);
}

// Small badge shown beside the sender's name when the message was sent on
// their behalf by the Cleotilda assistant.
function ViaCleotilda() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-0.5 pr-1.5 text-[10px] font-medium text-primary"
      title="Sent via Cleotilda"
    >
      <Image
        src="/image/taskcycle-ios-appicon-1024.png"
        alt=""
        width={14}
        height={14}
        className="rounded-full"
        draggable={false}
      />
      via Cleotilda
    </span>
  );
}

function ReactionPills({
  reactions,
  meId,
  onReact,
}: {
  reactions: MessageWithRelations["message_reactions"];
  meId: string;
  onReact: (emoji: string) => void;
}) {
  if (reactions.length === 0) return null;
  const byEmoji = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const cur = byEmoji.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.user_id === meId) cur.mine = true;
    byEmoji.set(r.emoji, cur);
  }
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {[...byEmoji.entries()].map(([emoji, { count, mine }]) => (
        <button
          key={emoji}
          onClick={() => onReact(emoji)}
          className={`flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums transition-colors duration-150 ${
            mine
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border bg-surface text-muted hover:border-primary/30 hover:text-foreground"
          }`}
        >
          <span className="text-sm leading-none">{emoji}</span>
          <span>{count}</span>
        </button>
      ))}
    </div>
  );
}

export function MessageItem({
  message,
  meId,
  grouped,
  readers,
  onReact,
  onEdit,
  onDelete,
  onPin,
  onOpenThread,
  replyCount,
}: {
  message: MessageWithRelations;
  meId: string;
  grouped: boolean;
  // Group read receipts: members who've read up to this message (their
  // high-water mark). Undefined in DMs and for messages no one has reached.
  readers?: MentionMember[];
  onReact: (emoji: string) => void;
  onEdit: (body: string) => void;
  onDelete: () => void;
  onPin: () => void;
  onOpenThread?: () => void;
  replyCount?: number;
}) {
  const openProfile = useProfileCard();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  // "down" opens below the button, "up" opens above it - chosen by available
  // viewport space so the picker is never clipped off the bottom/top.
  const [pickerDir, setPickerDir] = useState<"down" | "up">("down");
  const reactRef = useRef<HTMLDivElement>(null);

  function openFullPicker() {
    const PICKER_HEIGHT = 320; // matches EmojiPicker h-80
    const rect = reactRef.current?.getBoundingClientRect();
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom;
      setPickerDir(spaceBelow < PICKER_HEIGHT + 16 ? "up" : "down");
    }
    setShowFullPicker(true);
  }

  // Close the reaction popup when clicking outside it (it can stay open after
  // the cursor leaves the message row, so it needs its own dismiss).
  useEffect(() => {
    if (!showEmoji) return;
    function onDocClick(e: MouseEvent) {
      if (reactRef.current && !reactRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
        setShowFullPicker(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showEmoji]);
  const isMine = message.user_id === meId;
  const isCleotilda = message.user_id === CLEOTILDA_ID;
  const author = message.profiles;
  const authorName =
    author?.full_name ?? author?.email ?? (isCleotilda ? "Cleotilda" : "Unknown");
  const isOptimistic = message.id.startsWith("temp-");

  const time = new Date(message.created_at).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (message.deleted_at) {
    return (
      <div className="group flex gap-3 rounded-lg px-2 py-1">
        <div className="w-9 shrink-0" />
        <p className="text-sm italic text-muted">This message was deleted.</p>
      </div>
    );
  }

  // System events (e.g. "Alice added Bob") render as a centered, unobtrusive
  // line with no avatar or bubble - Slack-style.
  if (message.kind === "system") {
    return (
      <div className="my-2 flex items-center justify-center gap-2 px-4 text-center">
        <span className="h-px flex-1 bg-border/60" />
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <svg
            className="h-3.5 w-3.5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M19 8v6M22 11h-6" />
          </svg>
          {message.body}
          <span className="text-muted/60">· {time}</span>
        </span>
        <span className="h-px flex-1 bg-border/60" />
      </div>
    );
  }

  return (
    <div
      className={`group relative flex animate-fade-in gap-3 rounded-lg px-2 py-1 transition-colors duration-150 hover:bg-surface-2/60 ${
        grouped ? "" : "mt-2.5"
      } ${isOptimistic ? "opacity-60" : ""}`}
    >
      {grouped ? (
        <span className="w-9 shrink-0 pt-0.5 text-right text-[10px] text-transparent group-hover:text-muted">
          {time}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => author && openProfile(author)}
          disabled={!author}
          aria-label={`View ${authorName}`}
          className="shrink-0 cursor-pointer self-start rounded-full transition-transform hover:scale-105 disabled:cursor-default disabled:hover:scale-100"
        >
          {isCleotilda ? (
            <CleotildaAvatar />
          ) : (
            <Avatar
              name={author?.full_name ?? null}
              email={author?.email ?? null}
              avatarUrl={author?.avatar_url ?? null}
            />
          )}
        </button>
      )}

      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <button
              type="button"
              onClick={() => author && openProfile(author)}
              disabled={!author}
              className="cursor-pointer text-sm font-semibold text-foreground hover:underline disabled:cursor-default disabled:no-underline"
            >
              {authorName}
            </button>
            {isViaCleotilda(message.body) && <ViaCleotilda />}
            <span className="text-xs text-muted">{time}</span>
            {message.pinned_at && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 17v5M9 10.76V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6.76l2 3.24H7l2-3.24z" />
                </svg>
                Pinned
              </span>
            )}
          </div>
        )}

        {editing ? (
          <div className="mt-1">
            <textarea
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onEdit(draft);
                  setEditing(false);
                }
                if (e.key === "Escape") {
                  setDraft(message.body);
                  setEditing(false);
                }
              }}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="mt-1 flex gap-2 text-xs text-muted">
              <button
                className="text-primary hover:underline"
                onClick={() => {
                  onEdit(draft);
                  setEditing(false);
                }}
              >
                Save
              </button>
              <button
                onClick={() => {
                  setDraft(message.body);
                  setEditing(false);
                }}
                className="hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-[72ch] text-[15px] leading-relaxed text-foreground">
            {/* Grouped rows have no name line, so the via-badge rides inline. */}
            {grouped && isViaCleotilda(message.body) && (
              <span className="mr-1.5 inline-block align-middle">
                <ViaCleotilda />
              </span>
            )}
            <Body text={stripViaCleotilda(message.body)} />
            {message.edited_at && (
              <span className="ml-1.5 align-baseline text-[10px] text-muted">
                (edited)
              </span>
            )}
          </div>
        )}

        {message.message_attachments.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {message.message_attachments.map((a) => (
              <AttachmentView key={a.id} attachment={a} />
            ))}
          </div>
        )}

        <ReactionPills
          reactions={message.message_reactions}
          meId={meId}
          onReact={onReact}
        />

        {onOpenThread && (replyCount ?? 0) > 0 && (
          <button
            onClick={onOpenThread}
            className="group/thread mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-primary transition-colors duration-150 hover:border-primary/40 hover:bg-primary/5"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {replyCount} {replyCount === 1 ? "reply" : "replies"}
            <span className="text-muted transition-transform duration-150 group-hover/thread:translate-x-0.5">
              →
            </span>
          </button>
        )}

        {readers && readers.length > 0 && (
          <div className="mt-1.5 flex items-center">
            <span className="mr-1 text-[10px] text-muted">Seen by</span>
            <div className="flex -space-x-1.5">
              {readers.slice(0, 5).map((r) => (
                <span
                  key={r.id}
                  title={r.full_name ?? r.email}
                  className="rounded-full ring-2 ring-surface"
                >
                  <Avatar
                    name={r.full_name}
                    email={r.email}
                    avatarUrl={r.avatar_url}
                    size="xs"
                  />
                </span>
              ))}
            </div>
            {readers.length > 5 && (
              <span className="ml-1 text-[10px] font-medium text-muted">
                +{readers.length - 5}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Hover actions */}
      {!isOptimistic && !editing && (
        <div
          className={`absolute right-2 top-0 -translate-y-1/2 animate-scale-in items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 shadow-md group-hover:flex ${
            showEmoji ? "flex" : "hidden"
          }`}
        >
          <div className="relative" ref={reactRef}>
            <ActionBtn
              label="React"
              onClick={() => {
                setShowEmoji((s) => !s);
                setShowFullPicker(false);
              }}
              d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"
            />
            {showEmoji && !showFullPicker && (
              <div className="absolute right-0 top-8 z-20 flex animate-scale-in items-center gap-1 rounded-lg border border-border bg-surface p-1 shadow-lg">
                {QUICK_REACTIONS.map((e) => (
                  <button
                    key={e}
                    onClick={() => {
                      onReact(e);
                      setShowEmoji(false);
                    }}
                    className="cursor-pointer rounded p-1 text-base transition-transform hover:scale-110 hover:bg-surface-2"
                  >
                    {e}
                  </button>
                ))}
                <button
                  onClick={openFullPicker}
                  aria-label="More emojis"
                  title="More emojis"
                  className="grid h-7 w-7 cursor-pointer place-items-center rounded text-muted hover:bg-surface-2 hover:text-foreground"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </div>
            )}
            {showEmoji && showFullPicker && (
              <div
                className={`absolute right-0 z-30 animate-scale-in ${
                  pickerDir === "up" ? "bottom-8" : "top-8"
                }`}
              >
                <EmojiPicker
                  onSelect={(e) => {
                    onReact(e);
                    setShowEmoji(false);
                    setShowFullPicker(false);
                  }}
                  onClose={() => {
                    setShowEmoji(false);
                    setShowFullPicker(false);
                  }}
                />
              </div>
            )}
          </div>
          {onOpenThread && (
            <ActionBtn
              label="Reply in thread"
              onClick={onOpenThread}
              d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
            />
          )}
          <ActionBtn
            label={message.pinned_at ? "Unpin" : "Pin"}
            onClick={onPin}
            d="M12 17v5M9 10.76V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6.76l2 3.24H7l2-3.24z"
          />
          {isMine && (
            <>
              <ActionBtn
                label="Edit"
                onClick={() => setEditing(true)}
                d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
              />
              <ActionBtn
                label="Delete"
                onClick={onDelete}
                danger
                d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  d,
  danger,
}: {
  label: string;
  onClick: () => void;
  d: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-7 w-7 place-items-center rounded text-muted hover:bg-surface-2 ${
        danger ? "hover:text-danger" : "hover:text-foreground"
      }`}
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
        <path d={d} />
      </svg>
    </button>
  );
}
