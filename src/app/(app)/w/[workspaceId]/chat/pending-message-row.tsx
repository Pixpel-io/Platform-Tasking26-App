"use client";

import { Avatar } from "@/components/avatar";
import {
  dismissPendingSend,
  retryPendingSend,
  type PendingSend,
} from "./pending-store";

// A single circular progress ring for one in-flight upload. Matches the
// composer's <UploadRing> so the visual is consistent whether the file is
// still queued in the composer or being uploaded in the background.
function ProgressRing({ percent }: { percent: number }) {
  const R = 7;
  const CIRC = 2 * Math.PI * R;
  const indeterminate = percent <= 0;
  return (
    <svg
      className={`h-4 w-4 -rotate-90 shrink-0 ${indeterminate ? "animate-spin" : ""}`}
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
  );
}

// Ghost row for a message that's still uploading / sending. Renders in the
// same slot as a real message so the user can see their outgoing content
// immediately, with live progress. Survives chat navigation because the
// underlying state lives in a module-level store, not in React state.
export function PendingMessageRow({ send }: { send: PendingSend }) {
  const time = new Date(send.createdAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  const statusLabel =
    send.status === "error"
      ? send.error || "Failed to send"
      : send.status === "sending"
        ? "Sending…"
        : uploadingLabel(send);

  return (
    <div className="group relative mt-2.5 flex animate-fade-in gap-3 rounded-lg px-2 py-1 opacity-70">
      <span className="shrink-0 self-start">
        <Avatar
          name={send.meName}
          email={null}
          avatarUrl={send.meAvatarUrl}
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">
            {send.meName}
          </span>
          <span className="text-xs text-muted">{time}</span>
          <span
            className={`text-xs ${
              send.status === "error" ? "text-danger" : "text-muted"
            }`}
          >
            · {statusLabel}
          </span>
        </div>

        {send.body && (
          <div className="max-w-[72ch] whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
            {send.body}
          </div>
        )}

        {send.files.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            {send.files.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2"
              >
                <ProgressRing
                  percent={f.status === "uploaded" ? 100 : f.percent}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {f.fileName}
                  </span>
                  <span
                    className={`block text-xs ${
                      f.status === "error" ? "text-danger" : "text-muted"
                    }`}
                  >
                    {fileStatusText(f.status, f.percent, f.sizeBytes)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}

        {send.status === "error" && (
          <div className="mt-2 flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => retryPendingSend(send.id)}
              className="cursor-pointer font-medium text-primary hover:underline"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => dismissPendingSend(send.id)}
              className="cursor-pointer font-medium text-muted hover:text-foreground hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function uploadingLabel(send: PendingSend): string {
  if (send.files.length === 0) return "Sending…";
  const total = send.files.length;
  const done = send.files.filter((f) => f.status === "uploaded").length;
  if (done === total) return "Sending…";
  return `Uploading ${done + 1}/${total}…`;
}

function fileStatusText(
  status: "queued" | "uploading" | "uploaded" | "error",
  percent: number,
  sizeBytes: number,
): string {
  if (status === "error") return "Upload failed";
  if (status === "uploaded") return "Uploaded · " + formatSize(sizeBytes);
  if (status === "uploading" && percent > 0) return `${percent}% · ${formatSize(sizeBytes)}`;
  return "Waiting…";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
