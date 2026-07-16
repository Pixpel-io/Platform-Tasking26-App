"use client";

// Module-level store for in-flight sends. Lives outside the React tree, so
// switching chats (which unmounts <ChatRoom> and <Composer>) doesn't destroy
// the upload / send state - the store keeps running the XHRs, and any component
// that mounts and subscribes for the same target picks up the current progress
// straight away.

import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { makeThumbnail } from "@/lib/make-thumbnail";
import { createUploadUrl } from "@/app/(app)/s3-actions";
import { S3_PATH_PREFIX } from "@/lib/s3-shared";
import { sendMessage, type PendingAttachment } from "../chat-actions";

const BUCKET = "chat-attachments";

export type PendingFileStatus =
  | "queued"
  | "uploading"
  | "uploaded"
  | "error";

// One file being uploaded as part of a pending send. Kept flat / serializable
// (no File object leaks outside the store) so components can render it without
// worrying about references.
export type PendingFile = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: PendingAttachment["kind"];
  status: PendingFileStatus;
  percent: number;
  // Object URL for image / video previews. Revoked when the pending send is
  // removed from the store.
  previewUrl?: string;
};

export type PendingStatus = "uploading" | "sending" | "error";

// One outgoing message that hasn't been confirmed by the server yet - files
// still uploading, or the sendMessage call still in flight. Rendered as a
// ghost row in the message list until reconciled with the real inserted row.
export type PendingSend = {
  id: string;
  targetKey: string;
  // Null in the global /dm shell (no workspace) - text-only sends only.
  workspaceId: string | null;
  channelId: string | null;
  conversationId: string | null;
  body: string;
  replyToId: string | null;
  meId: string;
  meName: string;
  meAvatarUrl: string | null;
  createdAt: string;
  files: PendingFile[];
  status: PendingStatus;
  error?: string;
};

type Target = { channelId?: string | null; conversationId?: string | null };

export function pendingTargetKey(t: Target): string {
  return t.channelId ? `c:${t.channelId}` : `d:${t.conversationId ?? "?"}`;
}

// -- state -------------------------------------------------------------------

const byTarget = new Map<string, PendingSend[]>();
// Files kept out of the serialized state so React doesn't have to reconcile
// them - they only matter to the uploader.
const filesById = new Map<string, File>();
const listeners = new Set<() => void>();

function snapshotForTarget(tk: string): PendingSend[] {
  return byTarget.get(tk) ?? EMPTY;
}
// Stable empty array reference so useSyncExternalStore doesn't loop when a
// target has no pending sends.
const EMPTY: PendingSend[] = [];

function notify() {
  for (const l of listeners) l();
}

function replaceSend(id: string, patch: (p: PendingSend) => PendingSend): void {
  for (const [tk, arr] of byTarget) {
    const idx = arr.findIndex((p) => p.id === id);
    if (idx === -1) continue;
    const next = arr.slice();
    next[idx] = patch(arr[idx]);
    byTarget.set(tk, next);
    notify();
    return;
  }
}

function removeSend(id: string): void {
  for (const [tk, arr] of byTarget) {
    if (!arr.some((p) => p.id === id)) continue;
    const next = arr.filter((p) => p.id !== id);
    if (next.length === 0) byTarget.delete(tk);
    else byTarget.set(tk, next);
    // Clean up any lingering previews/files for this send.
    for (const f of arr.find((p) => p.id === id)?.files ?? []) {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      filesById.delete(f.id);
    }
    notify();
    return;
  }
}

// -- react hooks -------------------------------------------------------------

export function usePendingSends(target: Target): PendingSend[] {
  const tk = pendingTargetKey(target);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => snapshotForTarget(tk),
    () => EMPTY,
  );
}

// -- upload plumbing (moved from composer) -----------------------------------

function attachmentKind(mime: string): PendingAttachment["kind"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "voice";
  return "file";
}

// POST a presigned form to S3 via XHR so the caller gets upload progress
// events (fetch has no upload progress API).
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

async function uploadOne(
  workspaceId: string | null,
  meId: string,
  file: File,
  id: string,
  onPercent: (percent: number) => void,
): Promise<string | null> {
  if (!workspaceId) return null;
  const presign = await createUploadUrl({
    workspaceId,
    fileName: file.name,
    fileType: file.type || "application/octet-stream",
    fileSizeBytes: file.size,
  });

  if ("url" in presign) {
    const form = new FormData();
    Object.entries(presign.fields).forEach(([k, v]) => form.append(k, v));
    form.append("file", file);
    const ok = await postWithProgress(presign.url, form, onPercent);
    return ok ? `${S3_PATH_PREFIX}${presign.key}` : null;
  }

  if ("error" in presign) return null;

  // S3 disabled - Supabase Storage fallback (no per-chunk progress).
  const supabase = createClient();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${workspaceId}/${meId}/${id}-${safeName}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  return error ? null : path;
}

async function uploadThumb(
  workspaceId: string | null,
  meId: string,
  file: File,
  id: string,
): Promise<string | null> {
  try {
    const blob = await makeThumbnail(file);
    if (!blob) return null;
    const thumbFile = new File([blob], `thumb-${id}.webp`, {
      type: "image/webp",
    });
    return await uploadOne(workspaceId, meId, thumbFile, `${id}-thumb`, () => {});
  } catch {
    return null;
  }
}

// -- enqueue ----------------------------------------------------------------

export type EnqueueInput = {
  // Null in the global /dm shell; files can't be attached there so the upload
  // path is never taken.
  workspaceId: string | null;
  channelId?: string | null;
  conversationId?: string | null;
  body: string;
  replyToId?: string | null;
  meId: string;
  meName: string;
  meAvatarUrl: string | null;
  files: Array<{
    file: File;
    fileName: string;
    durationMs?: number;
    width?: number;
    height?: number;
    previewUrl?: string;
  }>;
};

// Start an upload+send in the background. The pending send stays in the store
// (and shows in the message list) until sendMessage returns; on success it's
// removed. Runs entirely outside React so unmounting the composer or chat
// room can't cancel it.
export function enqueuePendingSend(input: EnqueueInput): PendingSend {
  const sendId = crypto.randomUUID();
  const targetKey = pendingTargetKey({
    channelId: input.channelId,
    conversationId: input.conversationId,
  });

  const files: PendingFile[] = input.files.map((f) => {
    const fileId = crypto.randomUUID();
    filesById.set(fileId, f.file);
    return {
      id: fileId,
      fileName: f.fileName,
      mimeType: f.file.type,
      sizeBytes: f.file.size,
      kind: attachmentKind(f.file.type),
      status: "queued" as const,
      percent: 0,
      previewUrl: f.previewUrl,
    };
  });

  const send: PendingSend = {
    id: sendId,
    targetKey,
    workspaceId: input.workspaceId,
    channelId: input.channelId ?? null,
    conversationId: input.conversationId ?? null,
    body: input.body,
    replyToId: input.replyToId ?? null,
    meId: input.meId,
    meName: input.meName,
    meAvatarUrl: input.meAvatarUrl,
    createdAt: new Date().toISOString(),
    files,
    status: files.length > 0 ? "uploading" : "sending",
  };

  const existing = byTarget.get(targetKey) ?? [];
  byTarget.set(targetKey, [...existing, send]);
  notify();

  // Kick off the async work; we don't await it. The store updates itself as
  // each file's XHR reports progress and as sendMessage resolves.
  void runSend(send, input);
  return send;
}

async function runSend(send: PendingSend, input: EnqueueInput): Promise<void> {
  // Upload every file in parallel; per-file progress patches the store so any
  // subscribed component (composer or the chat-room ghost row) rerenders.
  const uploadResults = await Promise.all(
    send.files.map(
      async (
        pf,
        idx,
      ): Promise<{ fileId: string; attachment: PendingAttachment | null }> => {
        const file = filesById.get(pf.id);
        if (!file) return { fileId: pf.id, attachment: null };
        replaceSend(send.id, (p) => ({
          ...p,
          files: p.files.map((x, i) =>
            i === idx ? { ...x, status: "uploading" as const } : x,
          ),
        }));
        try {
          const original = input.files[idx];
          const kind = attachmentKind(file.type);
          const [path, thumbPath] = await Promise.all([
            uploadOne(input.workspaceId, input.meId, file, pf.id, (percent) => {
              replaceSend(send.id, (p) => ({
                ...p,
                files: p.files.map((x, i) =>
                  i === idx ? { ...x, percent } : x,
                ),
              }));
            }),
            kind === "image"
              ? uploadThumb(input.workspaceId, input.meId, file, pf.id)
              : null,
          ]);
          if (!path) {
            replaceSend(send.id, (p) => ({
              ...p,
              files: p.files.map((x, i) =>
                i === idx ? { ...x, status: "error" as const } : x,
              ),
            }));
            return { fileId: pf.id, attachment: null };
          }
          replaceSend(send.id, (p) => ({
            ...p,
            files: p.files.map((x, i) =>
              i === idx
                ? { ...x, status: "uploaded" as const, percent: 100 }
                : x,
            ),
          }));
          return {
            fileId: pf.id,
            attachment: {
              storagePath: path,
              thumbPath,
              fileName: original.fileName,
              mimeType: file.type || null,
              sizeBytes: file.size,
              kind,
              durationMs: original.durationMs ?? null,
              width: original.width ?? null,
              height: original.height ?? null,
            },
          };
        } catch {
          replaceSend(send.id, (p) => ({
            ...p,
            files: p.files.map((x, i) =>
              i === idx ? { ...x, status: "error" as const } : x,
            ),
          }));
          return { fileId: pf.id, attachment: null };
        }
      },
    ),
  );

  const failed = uploadResults.some((r) => r.attachment === null);
  if (failed) {
    replaceSend(send.id, (p) => ({
      ...p,
      status: "error",
      error: "Some files failed to upload.",
    }));
    return;
  }

  replaceSend(send.id, (p) => ({ ...p, status: "sending" }));

  const attachments = uploadResults
    .map((r) => r.attachment)
    .filter((a): a is PendingAttachment => a !== null);

  const result = await sendMessage({
    workspaceId: input.workspaceId,
    channelId: input.channelId ?? undefined,
    conversationId: input.conversationId ?? undefined,
    replyToId: input.replyToId ?? undefined,
    body: input.body,
    attachments,
  });

  if (result.error) {
    replaceSend(send.id, (p) => ({
      ...p,
      status: "error",
      error: result.error,
    }));
    return;
  }

  // Insert succeeded - drop the pending row. The real message will appear via
  // realtime (or the initialMessages fetch on a fresh mount).
  removeSend(send.id);
}

// -- external actions -------------------------------------------------------

// Called by the chat room when a real message arrives via realtime that
// matches one of our pending sends (same author + body + close timestamp).
// Prevents the ghost row from lingering after the real row shows up.
export function reconcilePendingSend(match: {
  targetKey: string;
  userId: string;
  body: string;
  createdAt: string;
}): void {
  const arr = byTarget.get(match.targetKey);
  if (!arr) return;
  const t = new Date(match.createdAt).getTime();
  const found = arr.find(
    (p) =>
      p.status !== "error" &&
      p.meId === match.userId &&
      p.body === match.body &&
      Math.abs(new Date(p.createdAt).getTime() - t) < 30_000,
  );
  if (found) removeSend(found.id);
}

// User-invoked: dismiss a failed pending send (or cancel a queued one, though
// the upload XHRs are not aborted - simplest useful cleanup).
export function dismissPendingSend(id: string): void {
  removeSend(id);
}

// User-invoked retry after a failure - re-runs upload + send with the same
// files. If the underlying File objects were dropped (e.g. after a full page
// reload), retry is a no-op and the caller should offer to remove instead.
export function retryPendingSend(id: string): void {
  let target: PendingSend | undefined;
  for (const arr of byTarget.values()) {
    target = arr.find((p) => p.id === id);
    if (target) break;
  }
  if (!target) return;
  const filePairs = target.files.map((pf) => ({ pf, file: filesById.get(pf.id) }));
  if (filePairs.some((p) => !p.file)) return;

  replaceSend(id, (p) => ({
    ...p,
    status: p.files.length > 0 ? "uploading" : "sending",
    error: undefined,
    files: p.files.map((x) => ({ ...x, status: "queued", percent: 0 })),
  }));

  void runSend(target, {
    workspaceId: target.workspaceId,
    channelId: target.channelId,
    conversationId: target.conversationId,
    body: target.body,
    replyToId: target.replyToId,
    meId: target.meId,
    meName: target.meName,
    meAvatarUrl: target.meAvatarUrl,
    files: filePairs.map(({ pf, file }) => ({
      file: file!,
      fileName: pf.fileName,
    })),
  });
}
