"use client";

// Shared browser-side upload helpers for attaching files to workspace content
// (chat messages, task comments, anything else). Preserves S3 progress events
// via XHR (fetch has no upload-progress API) and falls back to Supabase
// Storage when S3 isn't configured.

import { createClient } from "@/lib/supabase/client";
import { makeThumbnail } from "@/lib/make-thumbnail";
import { createUploadUrl } from "@/app/(app)/s3-actions";
import { S3_PATH_PREFIX } from "@/lib/s3-shared";

// Supabase Storage bucket used when S3 isn't configured. The bucket is
// shared across attachment types (chat, tasks) - each caller writes into a
// unique per-user, per-uuid path so the fallback stays namespace-safe.
const FALLBACK_BUCKET = "chat-attachments";

export type AttachmentKind = "file" | "image" | "video" | "voice";

export function attachmentKind(mime: string): AttachmentKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "voice";
  return "file";
}

// POST a presigned form to S3 via XHR so the caller gets upload progress
// events (fetch has no upload-progress API).
export function postWithProgress(
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

// Upload one file to storage and return its `storage_path` (or null on
// failure). `id` is a caller-generated identifier used to disambiguate the
// path in the Supabase Storage fallback branch (S3 uses a server-issued key).
export async function uploadOne(
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
    .from(FALLBACK_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  return error ? null : path;
}

// Best-effort WebP thumbnail for images, uploaded alongside the original so
// the message / comment bubble can render a small preview instead of the HD
// asset. Failure is silent - the caller falls back to the original.
export async function uploadThumb(
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
    return await uploadOne(
      workspaceId,
      meId,
      thumbFile,
      `${id}-thumb`,
      () => {},
    );
  } catch {
    return null;
  }
}

// Return { width, height } for an image or video File measured via a
// throw-away object URL; undefined for other types or on failure. Callers
// pass this to persist intrinsic dimensions so downstream layouts can
// reserve the exact display box before the file loads.
export function measureDimensions(
  file: File,
): Promise<{ width?: number; height?: number }> {
  const kind = attachmentKind(file.type);
  if (kind !== "image" && kind !== "video") return Promise.resolve({});
  const url = URL.createObjectURL(file);
  return new Promise((resolve) => {
    if (kind === "image") {
      const img = new window.Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        resolve({});
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } else {
      const v = document.createElement("video");
      v.onloadedmetadata = () => {
        resolve({ width: v.videoWidth, height: v.videoHeight });
        URL.revokeObjectURL(url);
      };
      v.onerror = () => {
        resolve({});
        URL.revokeObjectURL(url);
      };
      v.src = url;
    }
  });
}
