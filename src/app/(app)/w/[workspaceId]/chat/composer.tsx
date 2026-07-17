"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { EmojiPicker } from "@/components/emoji-picker";
import { highlightComposerValue } from "@/lib/message-format";
import type { PendingAttachment } from "../chat-actions";
import { VoiceRecorder } from "./voice-recorder";
import {
  useDraftSelected,
  useDraftValue,
} from "./composer-drafts-store";

export type MentionMember = {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
};

// Cleotilda, the AI assistant, is always mentionable even though she isn't a
// workspace member. Mentioning @cleotilda triggers an AI reply server-side.
export const CLEOTILDA_MENTION: MentionMember = {
  id: "c1e0711d-a000-4000-a000-000000000001",
  full_name: "Cleotilda (AI)",
  email: "cleotilda@tasking.app",
  avatar_url: null,
};

// The handle we insert must match how the server resolves mentions (the email
// local part, e.g. "@jane" for "jane@acme.com"). See sendMessage in chat-actions.
function mentionHandle(m: MentionMember): string {
  return m.email.split("@")[0];
}

// A file the user picked but hasn't sent yet. It stays entirely local (with an
// object-URL preview for media). Once Send is pressed the file is handed off
// to the pending-message store (which owns the upload+send flow and survives
// chat navigation); the composer never sees it again.
export type Selected = {
  id: string;
  file: File;
  fileName: string;
  durationMs?: number;
  // Intrinsic pixel size of image/video, measured locally at staging time so
  // the message list can reserve the exact box and avoid layout shift on load.
  width?: number;
  height?: number;
  // Object URL for image/video thumbnails; revoked when removed/sent.
  previewUrl?: string;
};

// Measure an image/video's intrinsic dimensions from its object URL. Resolves
// with undefined dimensions for other types or on failure - never rejects.
function measureDimensions(
  file: File,
  objectUrl: string,
): Promise<{ width?: number; height?: number }> {
  const kind = attachmentKind(file.type);
  if (kind === "image") {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () =>
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({});
      img.src = objectUrl;
    });
  }
  if (kind === "video") {
    return new Promise((resolve) => {
      const v = document.createElement("video");
      v.onloadedmetadata = () =>
        resolve({ width: v.videoWidth, height: v.videoHeight });
      v.onerror = () => resolve({});
      v.src = objectUrl;
    });
  }
  return Promise.resolve({});
}

function attachmentKind(mime: string): PendingAttachment["kind"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "voice";
  return "file";
}

// An open @mention popup: the token being typed and where the "@" sits so we
// can replace the right slice on selection.
type MentionState = {
  query: string;
  start: number;
  active: number;
};

// Find an @mention token immediately before the caret. It must sit at the
// start of the text or follow whitespace (so emails like a@b don't trigger it),
// and only contains the characters the server accepts. Returns null otherwise.
function detectMention(value: string, caret: number): { query: string; start: number } | null {
  const upTo = value.slice(0, caret);
  const match = /(?:^|\s)@([a-zA-Z0-9._-]*)$/.exec(upTo);
  if (!match) return null;
  return { query: match[1], start: caret - match[1].length - 1 };
}

// The message being replied to, shown as a banner above the input. Kept small
// so the composer doesn't depend on the full message shape.
export type ReplyTarget = {
  id: string;
  authorName: string;
  snippet: string;
};

export function Composer({
  workspaceId,
  channelId = null,
  conversationId = null,
  meId,
  members = [],
  onSend,
  onTyping,
  replyTo = null,
  onCancelReply,
  placeholder = "Write a message…  (use @ to mention)",
}: {
  // Null in the global /dm shell (no-workspace users): text-only composer,
  // attachments and voice need a workspace's storage context.
  workspaceId: string | null;
  // Which chat this composer belongs to - drives the drafts key so text and
  // staged files survive switching to another chat and coming back.
  channelId?: string | null;
  conversationId?: string | null;
  meId: string;
  members?: MentionMember[];
  // Composer packages up the staged files and hands them off; the pending
  // store owns the upload+send from here (see enqueuePendingSend). The composer
  // is done as soon as this returns.
  onSend: (body: string, files: Selected[]) => void;
  onTyping?: () => void;
  // When set, the composer shows a "Replying to …" banner; sending clears it
  // via the parent's onCancelReply.
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
  placeholder?: string;
}) {
  const draftTarget = { channelId, conversationId };
  const [value, setValue] = useDraftValue(draftTarget);
  const [selected, setSelected] = useDraftSelected(draftTarget);
  const [preview, setPreview] = useState<Selected | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mention, setMention] = useState<MentionState | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Members matching the active @token, capped so the list stays scannable.
  // Cleotilda (the AI assistant) is always offered alongside real members.
  const matches = (() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return [...members, CLEOTILDA_MENTION]
      .filter((m) => {
        if (m.id === meId) return false;
        const handle = mentionHandle(m).toLowerCase();
        const name = (m.full_name ?? "").toLowerCase();
        return handle.includes(q) || name.includes(q);
      })
      .slice(0, 8);
  })();
  const mentionOpen = mention !== null && matches.length > 0;

  // Recompute the @mention popup from the textarea's current caret.
  function syncMention(el: HTMLTextAreaElement) {
    const caret = el.selectionStart ?? el.value.length;
    const found = detectMention(el.value, caret);
    setMention((prev) =>
      found
        ? { ...found, active: prev && prev.start === found.start ? prev.active : 0 }
        : null,
    );
  }

  // Replace the active @token with the member's handle and a trailing space.
  function pickMention(m: MentionMember) {
    if (!mention) return;
    const el = taRef.current;
    const caret = el?.selectionStart ?? value.length;
    const handle = mentionHandle(m);
    const next = value.slice(0, mention.start) + "@" + handle + " " + value.slice(caret);
    setValue(next);
    setMention(null);
    onTyping?.();
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = mention.start + handle.length + 2;
      el.setSelectionRange(pos, pos);
      autoGrow(el);
    });
  }

  const canSend = value.trim().length > 0 || selected.length > 0;

  // Hand the staged files straight to the pending store via onSend, then reset
  // the composer immediately. Upload progress lives in the store from here on
  // and shows as a ghost row in the message list - so switching chats mid-send
  // doesn't stall the UI. The composer keeps the object-URL previews alive
  // (revoking them is the store's job once the file finishes uploading).
  function submit() {
    if (!canSend) return;
    const body = value.trim();
    onSend(body, selected);
    setValue("");
    setSelected([]);
    setPreview(null);
    if (taRef.current) taRef.current.style.height = "auto";
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // When the @mention popup is open, arrows/Enter/Tab drive it instead of
    // the textarea.
    if (mentionOpen && mention) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMention({ ...mention, active: (mention.active + 1) % matches.length });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMention({
          ...mention,
          active: (mention.active - 1 + matches.length) % matches.length,
        });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickMention(matches[Math.min(mention.active, matches.length - 1)]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    // Escape (with no @mention popup and an empty draft) cancels an active
    // reply, matching Slack.
    if (e.key === "Escape" && replyTo && !value) {
      e.preventDefault();
      onCancelReply?.();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  // Insert an emoji at the caret (or replace the current selection).
  function insertEmoji(emoji: string) {
    const el = taRef.current;
    if (!el) {
      setValue((v) => v + emoji);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    setValue(next);
    onTyping?.();
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + emoji.length;
      el.setSelectionRange(caret, caret);
      autoGrow(el);
    });
  }

  // Wrap the current selection in inline markers (`*`, `_`, `~`, `` ` ``) and
  // place the caret around the (possibly empty) selection so typing continues.
  function wrapSelection(open: string, close: string) {
    const el = taRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    const next =
      value.slice(0, start) + open + selected + close + value.slice(end);
    setValue(next);
    onTyping?.();
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caretStart = start + open.length;
      const caretEnd = caretStart + selected.length;
      el.setSelectionRange(caretStart, caretEnd);
      autoGrow(el);
    });
  }

  // Code: a multi-line/empty selection uses a fenced ```block```; a single-line
  // selection uses `inline`.
  function wrapCode() {
    const el = taRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    const block = selected.includes("\n") || selected.length === 0;
    if (block) wrapSelection("```\n", "\n```");
    else wrapSelection("`", "`");
  }

  // Prefix each selected line (or the current line) with a marker, used for
  // quotes ("> ") and lists ("- ", "1. ").
  function prefixLines(makePrefix: (lineIndex: number) => string) {
    const el = taRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    // Expand selection to full lines.
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = value.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = value.length;
    const block = value.slice(lineStart, lineEnd);
    const prefixed = block
      .split("\n")
      .map((line, i) => makePrefix(i) + line)
      .join("\n");
    const next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
    setValue(next);
    onTyping?.();
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(lineStart, lineStart + prefixed.length);
      autoGrow(el);
    });
  }

  // Link: wrap selection as Slack <url|label>. With no selection, insert a
  // template and put the caret on the url.
  function insertLink() {
    const el = taRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    const inner = selected ? `url|${selected}` : "url|text";
    const next = value.slice(0, start) + "<" + inner + ">" + value.slice(end);
    setValue(next);
    onTyping?.();
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const urlStart = start + 1;
      el.setSelectionRange(urlStart, urlStart + 3); // selects "url"
      autoGrow(el);
    });
  }

  // Selecting files only stages them locally (with a preview) - nothing is
  // uploaded until Send. Attaching and then discarding never touches S3.
  function handleFiles(files: FileList | File[], durationMs?: number) {
    if (!workspaceId) return; // no storage context in the global DM shell
    const staged: Selected[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      fileName: file.name,
      durationMs,
      // Object URL for every file so the staged preview is clickable (image /
      // video render inline; docs and other types open in a new tab).
      previewUrl: URL.createObjectURL(file),
    }));
    setSelected((prev) => [...prev, ...staged]);

    // Measure image/video dimensions in the background and patch them in, so
    // the sent message carries width/height and the list reserves exact space.
    staged.forEach((s) => {
      if (!s.previewUrl) return;
      void measureDimensions(s.file, s.previewUrl).then((dim) => {
        if (dim.width == null || dim.height == null) return;
        setSelected((prev) =>
          prev.map((x) =>
            x.id === s.id ? { ...x, width: dim.width, height: dim.height } : x,
          ),
        );
      });
    });
  }

  function removeSelected(id: string) {
    setPreview((p) => (p?.id === id ? null : p));
    setSelected((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  }

  // Revoke any outstanding object URLs when the composer unmounts.
  useEffect(() => {
    return () => {
      selected.forEach((s) => {
        if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus the input the moment a reply is started, so the user can type right
  // away without a second click (Slack behaviour).
  useEffect(() => {
    if (replyTo) taRef.current?.focus();
  }, [replyTo]);

  // When the composer mounts with a hydrated draft (user typed something,
  // switched chats, and came back), size the textarea to match. rows=1 alone
  // leaves a multi-line draft looking cramped.
  useEffect(() => {
    if (taRef.current && value) autoGrow(taRef.current);
    // Run once per mount; live edits handle their own resize on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="border-t border-border bg-surface p-2 sm:p-3">
      {preview && (
        <AttachmentPreviewModal
          item={preview}
          onClose={() => setPreview(null)}
        />
      )}
      {micError && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
          <span className="min-w-0 flex-1">{micError}</span>
          <button
            onClick={() => setMicError(null)}
            aria-label="Dismiss"
            className="grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded hover:bg-danger/15"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-border border-l-2 border-l-primary bg-surface-2/60 px-3 py-1.5 text-xs animate-fade-in">
          <svg
            className="h-3.5 w-3.5 shrink-0 text-primary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 17l-5-5 5-5M4 12h11a5 5 0 0 1 5 5v1" />
          </svg>
          <span className="min-w-0 flex-1 truncate">
            <span className="text-muted">Replying to </span>
            <span className="font-medium text-foreground">
              {replyTo.authorName}
            </span>
            <span className="text-muted"> · {replyTo.snippet}</span>
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded text-muted transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {selected.map((s) => {
            const kind = attachmentKind(s.file.type);
            const openPreview = () => setPreview(s);
            return (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
            >
              <button
                type="button"
                onClick={openPreview}
                title={`Preview ${s.fileName}`}
                className="flex min-w-0 cursor-pointer items-center gap-2 text-left"
              >
                {kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.previewUrl}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded object-cover"
                  />
                ) : kind === "video" ? (
                  <video
                    src={s.previewUrl}
                    className="h-8 w-8 shrink-0 rounded object-cover"
                    muted
                  />
                ) : (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-surface-2 text-muted">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                  </span>
                )}
                <span className="max-w-40 truncate text-foreground hover:underline">
                  {s.fileName}
                </span>
              </button>
              <button
                onClick={() => removeSelected(s.id)}
                aria-label="Remove"
                className="grid h-4 w-4 place-items-center rounded text-muted transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
            </div>
            );
          })}
        </div>
      )}

      <div
        onClick={(e) => {
          // Clicking anywhere in the box (not on a button) focuses the input.
          if (!(e.target as HTMLElement).closest("button")) {
            taRef.current?.focus();
          }
        }}
        className="flex cursor-text flex-col rounded-2xl border border-border bg-background shadow-sm transition-all duration-200 focus-within:shadow-md"
      >
        {/* Text input */}
        <div className="relative px-4 pt-3">
          {/* Styled mirror behind the textarea: shows bold/italic/etc. live.
              Shares identical box metrics with the textarea so the caret and
              text line up exactly. */}
          <div
            ref={overlayRef}
            aria-hidden
            className="pointer-events-none absolute inset-x-4 top-3 max-h-48 overflow-hidden whitespace-pre-wrap wrap-break-word text-sm leading-6 text-foreground"
          >
            {highlightComposerValue(value)}
          </div>
          <textarea
            ref={taRef}
            value={value}
            rows={1}
            placeholder={placeholder}
            // Chat is often Roman Urdu / mixed language: OS + browser
            // autocorrect and text-prediction mangle words on space, so those
            // stay off. Native spellcheck stays ON though - the browser draws
            // its squiggle against the (transparent) textarea's text metrics,
            // which match the visible styled overlay 1:1, so misspellings
            // underline under the right word. writingsuggestions is the
            // Edge/Chrome text-prediction opt-out; data-gramm keeps Grammarly
            // out (its overlay fights the styled mirror).
            spellCheck
            autoCorrect="off"
            autoCapitalize="none"
            autoComplete="off"
            data-gramm="false"
            data-enable-grammarly="false"
            {...{ writingsuggestions: "false" }}
            onScroll={(e) => {
              if (overlayRef.current)
                overlayRef.current.scrollTop = e.currentTarget.scrollTop;
            }}
            onChange={(e) => {
              setValue(e.target.value);
              autoGrow(e.target);
              syncMention(e.target);
              onTyping?.();
            }}
            onKeyUp={(e) => syncMention(e.currentTarget)}
            onClick={(e) => syncMention(e.currentTarget)}
            onBlur={() => setMention(null)}
            onKeyDown={handleKeyDown}
            onPaste={(e) => {
              // Screenshots (snipping tool etc.) arrive as clipboard files -
              // upload them like attachments instead of dropping them.
              const files = Array.from(e.clipboardData.items)
                .filter((item) => item.kind === "file")
                .map((item) => item.getAsFile())
                .filter((f): f is File => f != null);
              if (files.length === 0) return;
              e.preventDefault();
              void handleFiles(
                files.map((f, i) =>
                  f.name && f.name !== "image.png"
                    ? f
                    : new File(
                        [f],
                        `screenshot-${Date.now()}${i ? `-${i}` : ""}.png`,
                        { type: f.type || "image/png" },
                      ),
                ),
              );
            }}
            className="no-focus-ring relative block max-h-48 w-full resize-none bg-transparent text-sm leading-6 text-transparent caret-foreground placeholder:text-muted"
          />

          {mentionOpen && mention && (
            <div className="absolute bottom-full left-2 z-40 mb-2 w-72 max-w-[calc(100%-1rem)] animate-scale-in overflow-hidden rounded-xl border border-border bg-surface shadow-xl shadow-black/20">
              <p className="border-b border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Mention someone
              </p>
              <ul className="max-h-56 overflow-y-auto p-1">
                {matches.map((m, i) => {
                  const active = i === mention.active;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        // Pick on mousedown so it fires before the textarea's blur.
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickMention(m);
                        }}
                        onMouseEnter={() => setMention({ ...mention, active: i })}
                        className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                          active ? "bg-primary/10" : "hover:bg-surface-2"
                        }`}
                      >
                        <Avatar
                          name={m.full_name}
                          email={m.email}
                          avatarUrl={m.avatar_url}
                          size="xs"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {m.full_name ?? mentionHandle(m)}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            @{mentionHandle(m)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Action bar: formatting on the left, attach/emoji/send on the right.
            On small screens only the essentials show; the rest appear at sm+. */}
        <div className="flex items-center gap-1 px-2.5 pb-2 pt-1">
          <FmtBtn label="Bold" onClick={() => wrapSelection("*", "*")} d="M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z" />
          <FmtBtn label="Italic" onClick={() => wrapSelection("_", "_")} d="M19 4h-9M14 20H5M15 4L9 20" />
          <FmtBtn label="Strikethrough" className="hidden sm:grid" onClick={() => wrapSelection("~", "~")} d="M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16" />
          <FmtDivider className="hidden sm:block" />
          <FmtBtn label="Link" className="hidden sm:grid" onClick={insertLink} d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          <FmtBtn label="Ordered list" className="hidden sm:grid" onClick={() => { let n = 0; prefixLines(() => `${++n}. `); }} d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3a1 1 0 0 0-2-1" />
          <FmtBtn label="Bulleted list" className="hidden sm:grid" onClick={() => prefixLines(() => "- ")} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          <FmtBtn label="Blockquote" className="hidden sm:grid" onClick={() => prefixLines(() => "> ")} d="M3 21V8a2 2 0 0 1 2-2h0M3 13h6M9 21V8a2 2 0 0 1 2-2h0M9 13h6" />
          <FmtBtn label="Code" onClick={() => wrapSelection("`", "`")} d="M16 18l6-6-6-6M8 6l-6 6 6 6" />

          <span className="ml-auto flex items-center gap-1">
            {workspaceId && (
            <VoiceRecorder
              onFinish={(file, durationMs) => {
                setMicError(null);
                void handleFiles([file], durationMs);
              }}
              onError={(message) => setMicError(message)}
            />
            )}
            {workspaceId && (
            <button
              onClick={() => fileRef.current?.click()}
              aria-label="Attach file"
              title="Attach file"
              className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <svg
                className="h-4.5 w-4.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            )}
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="relative">
              <button
                onClick={() => setEmojiOpen((o) => !o)}
                aria-label="Emoji"
                title="Emoji"
                aria-expanded={emojiOpen}
                className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <svg
                  className="h-4.5 w-4.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
                </svg>
              </button>
              {emojiOpen && (
                <div className="absolute bottom-10 right-0 z-30 animate-scale-in">
                  <EmojiPicker
                    onSelect={(emoji) => insertEmoji(emoji)}
                    onClose={() => setEmojiOpen(false)}
                  />
                </div>
              )}
            </div>
            <span className="mx-1 h-5 w-px bg-border" />
            <button
              onClick={submit}
              disabled={!canSend}
              aria-label="Send"
              className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg bg-linear-to-br from-primary to-primary/75 text-primary-foreground shadow-sm shadow-primary/30 transition-all duration-150 hover:-translate-y-px hover:shadow-md hover:shadow-primary/40 active:scale-95 disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
            >
              <svg
                className="h-4.5 w-4.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </span>
        </div>
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-muted/70">
        <kbd className="rounded border border-border bg-surface-2 px-1 py-0.5 font-sans text-[10px] text-muted">Enter</kbd>{" "}
        to send ·{" "}
        <kbd className="rounded border border-border bg-surface-2 px-1 py-0.5 font-sans text-[10px] text-muted">Shift+Enter</kbd>{" "}
        for a new line
      </p>
    </div>
  );
}

// In-app preview of a staged (not-yet-sent) attachment. Images and video
// render inline; PDFs use an iframe; everything else falls back to a name +
// download link. Closes on backdrop click or Escape.
function AttachmentPreviewModal({
  item,
  onClose,
}: {
  item: Selected;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const kind = attachmentKind(item.file.type);
  const isPdf = item.file.type === "application/pdf";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/70 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-3xl animate-scale-in flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {item.fileName}
          </span>
          <a
            href={item.previewUrl}
            download={item.fileName}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            aria-label="Download"
            title="Download"
          >
            <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
          </a>
          <button
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-background p-2">
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.previewUrl}
              alt={item.fileName}
              className="max-h-[75vh] max-w-full object-contain"
            />
          ) : kind === "video" ? (
            <video
              src={item.previewUrl}
              controls
              autoPlay
              className="max-h-[75vh] max-w-full"
            />
          ) : kind === "voice" ? (
            <audio src={item.previewUrl} controls className="w-full" />
          ) : isPdf ? (
            <iframe
              src={item.previewUrl}
              title={item.fileName}
              className="h-[75vh] w-full rounded-lg bg-white"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <svg className="h-12 w-12 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              <p className="text-sm text-muted">
                No inline preview for this file type.
              </p>
              <a
                href={item.previewUrl}
                download={item.fileName}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              >
                Download {item.fileName}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FmtBtn({
  label,
  onClick,
  d,
  className = "grid",
}: {
  label: string;
  onClick: () => void;
  d: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`${className} h-7 w-7 cursor-pointer place-items-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-foreground`}
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

function FmtDivider({ className = "" }: { className?: string }) {
  return <span className={`mx-1 h-4 w-px bg-border ${className}`} />;
}
