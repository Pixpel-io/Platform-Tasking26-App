"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PendingAttachment } from "../chat-actions";

const BUCKET = "chat-attachments";

type Uploading = {
  id: string;
  fileName: string;
  progress: "uploading" | "done" | "error";
  attachment?: PendingAttachment;
};

function attachmentKind(mime: string): PendingAttachment["kind"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "voice";
  return "file";
}

export function Composer({
  workspaceId,
  meId,
  onSend,
  onTyping,
  placeholder = "Write a message…  (use @ to mention)",
}: {
  workspaceId: string;
  meId: string;
  onSend: (body: string, attachments: PendingAttachment[]) => void;
  onTyping?: () => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const [uploads, setUploads] = useState<Uploading[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  async function handleFiles(files: FileList) {
    const supabase = createClient();
    for (const file of Array.from(files)) {
      const id = crypto.randomUUID();
      setUploads((prev) => [
        ...prev,
        { id, fileName: file.name, progress: "uploading" },
      ]);

      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${workspaceId}/${meId}/${id}-${safeName}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });

      setUploads((prev) =>
        prev.map((u) =>
          u.id === id
            ? error
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
                  },
                }
            : u,
        ),
      );
    }
  }

  return (
    <div className="border-t border-border bg-surface p-3">
      {uploads.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {uploads.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
            >
              <span className="max-w-[160px] truncate text-foreground">
                {u.fileName}
              </span>
              {u.progress === "uploading" && (
                <span className="text-muted">uploading…</span>
              )}
              {u.progress === "error" && (
                <span className="text-danger">failed</span>
              )}
              <button
                onClick={() =>
                  setUploads((prev) => prev.filter((x) => x.id !== u.id))
                }
                aria-label="Remove"
                className="text-muted hover:text-danger"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
        <button
          onClick={() => fileRef.current?.click()}
          aria-label="Attach file"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
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
        <textarea
          ref={taRef}
          value={value}
          rows={1}
          placeholder={placeholder}
          onChange={(e) => {
            setValue(e.target.value);
            autoGrow(e.target);
            onTyping?.();
          }}
          onKeyDown={handleKeyDown}
          className="max-h-48 flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={!canSend}
          aria-label="Send"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
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
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
      <p className="mt-1 px-1 text-[11px] text-muted/70">
        Enter to send · Shift+Enter for a new line · 📎 to attach
      </p>
    </div>
  );
}
