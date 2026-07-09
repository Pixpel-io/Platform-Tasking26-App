"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/avatar";
import { EmojiPicker } from "@/components/emoji-picker";
import { highlightComposerValue } from "@/lib/message-format";
import type { PendingAttachment } from "../chat-actions";
import { VoiceRecorder } from "./voice-recorder";
import { createUploadUrl } from "@/app/(app)/s3-actions";
import { S3_PATH_PREFIX } from "@/lib/s3-shared";

const BUCKET = "chat-attachments";

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

type Uploading = {
  id: string;
  fileName: string;
  progress: "uploading" | "done" | "error";
  // 0..100 while uploading (S3 XHR reports real progress; Supabase fallback
  // stays indeterminate at 0).
  percent: number;
  attachment?: PendingAttachment;
};

// POST a presigned form to S3 via XHR so we get upload progress events
// (fetch has no upload progress API).
function postWithProgress(
  url: string,
  form: FormData,
  onProgress: (percent: number) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(form);
  });
}

// Small circular progress ring + percent label for an in-flight upload.
// percent 0 with no progress events yet renders as a spinning arc.
function UploadRing({ percent }: { percent: number }) {
  const R = 7;
  const CIRC = 2 * Math.PI * R;
  const indeterminate = percent <= 0;
  return (
    <span className="flex items-center gap-1 text-muted">
      <svg
        className={`h-4 w-4 -rotate-90 ${indeterminate ? "animate-spin" : ""}`}
        viewBox="0 0 20 20"
      >
        <circle
          cx="10"
          cy="10"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="2.5"
        />
        <circle
          cx="10"
          cy="10"
          r={R}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={
            indeterminate ? CIRC * 0.75 : CIRC * (1 - percent / 100)
          }
          className="transition-[stroke-dashoffset] duration-200"
        />
      </svg>
      {!indeterminate && (
        <span className="min-w-7 tabular-nums">{percent}%</span>
      )}
    </span>
  );
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

export function Composer({
  workspaceId,
  meId,
  members = [],
  onSend,
  onTyping,
  placeholder = "Write a message…  (use @ to mention)",
}: {
  workspaceId: string;
  meId: string;
  members?: MentionMember[];
  onSend: (body: string, attachments: PendingAttachment[]) => void;
  onTyping?: () => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const [uploads, setUploads] = useState<Uploading[]>([]);
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

  const ready = uploads.every((u) => u.progress !== "uploading");
  const canSend =
    (value.trim().length > 0 || uploads.some((u) => u.attachment)) && ready;

  function submit() {
    if (!canSend) return;
    const attachments = uploads
      .map((u) => u.attachment)
      .filter((a): a is PendingAttachment => !!a);
    onSend(value.trim(), attachments);
    setValue("");
    setUploads([]);
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

  // Upload one file. S3 first (via a server-issued presigned POST - the
  // browser never sees AWS credentials); Supabase Storage when S3 isn't
  // configured. Returns the storage path or null on failure.
  async function uploadOne(file: File, id: string): Promise<string | null> {
    const setPercent = (percent: number) =>
      setUploads((prev) =>
        prev.map((u) => (u.id === id ? { ...u, percent } : u)),
      );

    const presign = await createUploadUrl({
      workspaceId,
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileSizeBytes: file.size,
    });

    if ("url" in presign) {
      // Direct browser → S3 POST using only the returned url + fields.
      const form = new FormData();
      Object.entries(presign.fields).forEach(([k, v]) => form.append(k, v));
      form.append("file", file);
      const ok = await postWithProgress(presign.url, form, setPercent);
      return ok ? `${S3_PATH_PREFIX}${presign.key}` : null;
    }

    if ("error" in presign) return null;

    // S3 disabled - Supabase Storage fallback.
    const supabase = createClient();
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${workspaceId}/${meId}/${id}-${safeName}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    return error ? null : path;
  }

  async function handleFiles(files: FileList | File[], durationMs?: number) {
    for (const file of Array.from(files)) {
      const id = crypto.randomUUID();
      setUploads((prev) => [
        ...prev,
        { id, fileName: file.name, progress: "uploading", percent: 0 },
      ]);

      let path: string | null = null;
      try {
        path = await uploadOne(file, id);
      } catch {
        path = null;
      }

      setUploads((prev) =>
        prev.map((u) =>
          u.id === id
            ? path === null
              ? { ...u, progress: "error" }
              : {
                  ...u,
                  progress: "done",
                  attachment: {
                    storagePath: path,
                    fileName: file.name,
                    mimeType: file.type || null,
                    sizeBytes: file.size,
                    kind: attachmentKind(file.type),
                    durationMs: durationMs ?? null,
                  },
                }
            : u,
        ),
      );
    }
  }

  return (
    <div className="border-t border-border bg-surface p-2 sm:p-3">
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
      {uploads.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {uploads.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
            >
              <span className="max-w-40 truncate text-foreground">
                {u.fileName}
              </span>
              {u.progress === "uploading" && (
                <UploadRing percent={u.percent} />
              )}
              {u.progress === "done" && (
                <svg
                  className="h-3.5 w-3.5 text-success"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
              {u.progress === "error" && (
                <span className="text-danger">failed</span>
              )}
              <button
                onClick={() =>
                  setUploads((prev) => prev.filter((x) => x.id !== u.id))
                }
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
          ))}
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
            // autocorrect and text-prediction mangle words on space (and the
            // spellcheck squiggle fights the styled overlay), so disable all
            // input assistance here. writingsuggestions is the Edge/Chrome
            // text-prediction opt-out; data-gramm keeps Grammarly out.
            spellCheck={false}
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
            <VoiceRecorder
              onFinish={(file, durationMs) => {
                setMicError(null);
                void handleFiles([file], durationMs);
              }}
              onError={(message) => setMicError(message)}
            />
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
