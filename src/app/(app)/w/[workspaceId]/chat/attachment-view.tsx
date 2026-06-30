"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MessageAttachment } from "@/lib/supabase/types";

const BUCKET = "chat-attachments";

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function AttachmentView({ attachment }: { attachment: MessageAttachment }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(attachment.storage_path, 60 * 60)
      .then(({ data }) => {
        if (active) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [attachment.storage_path]);

  if (attachment.kind === "image") {
    return (
      <a href={url ?? undefined} target="_blank" rel="noreferrer" className="block">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={attachment.file_name}
            className="max-h-80 max-w-sm rounded-lg border border-border object-cover"
          />
        ) : (
          <div className="h-40 w-64 animate-pulse rounded-lg bg-surface-2" />
        )}
      </a>
    );
  }

  if (attachment.kind === "video") {
    return url ? (
      <video
        src={url}
        controls
        className="max-h-80 max-w-sm rounded-lg border border-border"
      />
    ) : (
      <div className="h-40 w-64 animate-pulse rounded-lg bg-surface-2" />
    );
  }

  if (attachment.kind === "voice") {
    return url ? (
      <audio src={url} controls className="max-w-xs" />
    ) : (
      <div className="h-10 w-48 animate-pulse rounded-lg bg-surface-2" />
    );
  }

  // Generic file
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className="flex max-w-sm items-center gap-3 rounded-lg border border-border bg-surface p-3 hover:bg-surface-2"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M13 2v7h7" />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">
          {attachment.file_name}
        </span>
        <span className="block text-xs text-muted">
          {formatSize(attachment.size_bytes)}
        </span>
      </span>
    </a>
  );
}
