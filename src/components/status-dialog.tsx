"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui";
import { EMOJI_CATEGORIES } from "@/lib/emoji";
import type { Profile } from "@/lib/supabase/types";
import { setProfileStatus } from "@/app/(app)/actions";

// A profile's status is live when it has text and hasn't expired.
export function activeStatus(
  profile: Pick<Profile, "status_emoji" | "status_text" | "status_expires_at">,
): { emoji: string | null; text: string } | null {
  if (!profile.status_text) return null;
  if (
    profile.status_expires_at &&
    new Date(profile.status_expires_at).getTime() <= Date.now()
  ) {
    return null;
  }
  return { emoji: profile.status_emoji, text: profile.status_text };
}

// Slack's preset suggestions with their default expiries.
const SUGGESTIONS: {
  emoji: string;
  text: string;
  expiry: ExpiryKey;
}[] = [
  { emoji: "📅", text: "In a meeting", expiry: "1h" },
  { emoji: "🚌", text: "Commuting", expiry: "30m" },
  { emoji: "🤒", text: "Out sick", expiry: "today" },
  { emoji: "🌴", text: "Vacationing", expiry: "never" },
  { emoji: "🏡", text: "Working remotely", expiry: "today" },
];

type ExpiryKey = "never" | "30m" | "1h" | "4h" | "today" | "week";

const EXPIRY_OPTIONS: { key: ExpiryKey; label: string }[] = [
  { key: "never", label: "Don't clear" },
  { key: "30m", label: "30 minutes" },
  { key: "1h", label: "1 hour" },
  { key: "4h", label: "4 hours" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
];

function expiryToIso(key: ExpiryKey): string | null {
  const now = new Date();
  switch (key) {
    case "never":
      return null;
    case "30m":
      return new Date(now.getTime() + 30 * 60_000).toISOString();
    case "1h":
      return new Date(now.getTime() + 60 * 60_000).toISOString();
    case "4h":
      return new Date(now.getTime() + 4 * 60 * 60_000).toISOString();
    case "today": {
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return end.toISOString();
    }
    case "week": {
      // End of Sunday.
      const end = new Date(now);
      end.setDate(end.getDate() + ((7 - end.getDay()) % 7));
      end.setHours(23, 59, 59, 999);
      return end.toISOString();
    }
  }
}

export function StatusDialog({
  profile,
  onClose,
}: {
  profile: Profile;
  onClose: () => void;
}) {
  const current = activeStatus(profile);
  const [emoji, setEmoji] = useState<string | null>(current?.emoji ?? null);
  const [text, setText] = useState(current?.text ?? "");
  const [expiry, setExpiry] = useState<ExpiryKey>("today");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const emojiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!emojiOpen) return;
    function onDoc(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setEmojiOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [emojiOpen]);

  function save(next: { emoji: string | null; text: string; expiry: ExpiryKey }) {
    startTransition(async () => {
      await setProfileStatus({
        emoji: next.emoji,
        text: next.text,
        expiresAt: expiryToIso(next.expiry),
      });
      onClose();
    });
  }

  // Portal to <body>: ancestors with backdrop-filter/transform would trap
  // this fixed overlay and let page content bleed through the dialog.
  return createPortal(
    <div
      className="fixed inset-0 z-100 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Set a status
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Emoji + text input */}
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-background px-2 py-1.5 focus-within:shadow-sm">
          <div ref={emojiRef} className="relative">
            <button
              onClick={() => setEmojiOpen((o) => !o)}
              aria-label="Choose an emoji"
              className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-lg transition-colors hover:bg-surface-2"
            >
              {emoji ?? (
                <svg className="h-5 w-5 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
                </svg>
              )}
            </button>
            {emojiOpen && (
              <div className="absolute left-0 top-full z-10 mt-1 h-56 w-[min(16rem,calc(100vw-4rem))] overflow-y-auto rounded-xl border border-border bg-surface p-2 shadow-xl">
                {EMOJI_CATEGORIES.map((cat) => (
                  <div key={cat.id}>
                    <p className="px-1 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted first:pt-0">
                      {cat.label}
                    </p>
                    <div className="grid grid-cols-8">
                      {cat.emojis.map((e) => (
                        <button
                          key={e}
                          onClick={() => {
                            setEmoji(e);
                            setEmojiOpen(false);
                          }}
                          className="grid h-7 w-7 cursor-pointer place-items-center rounded text-base hover:bg-surface-2"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={100}
            placeholder="What's your status?"
            autoFocus
            className="h-8 min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
          />
          {text && (
            <button
              onClick={() => {
                setText("");
                setEmoji(null);
              }}
              aria-label="Clear"
              className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded text-muted hover:text-foreground"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Suggestions (Slack-style) */}
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Suggestions
          </p>
          <div className="mt-1.5 space-y-0.5">
            {SUGGESTIONS.map((s) => {
              const label = EXPIRY_OPTIONS.find((o) => o.key === s.expiry)?.label;
              return (
                <button
                  key={s.text}
                  onClick={() => {
                    setEmoji(s.emoji);
                    setText(s.text);
                    setExpiry(s.expiry);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-2"
                >
                  <span className="text-base">{s.emoji}</span>
                  <span className="text-foreground">{s.text}</span>
                  <span className="text-muted">— {label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Expiry */}
        <div className="mt-4">
          <label
            htmlFor="status-expiry"
            className="text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Remove status after
          </label>
          <select
            id="status-expiry"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value as ExpiryKey)}
            className="mt-1.5 w-full cursor-pointer rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Actions. Stack below sm so three buttons don't collide inside the
            narrow dialog width. */}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {current && (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => save({ emoji: null, text: "", expiry: "never" })}
            >
              Clear status
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending || !text.trim()}
            onClick={() => save({ emoji, text, expiry })}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
