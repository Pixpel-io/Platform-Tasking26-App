"use server";

// The only doorway between the browser and S3. All AWS SDK work happens in
// src/lib/s3.ts (server-only); these actions validate the user + file and
// return the minimum data the client needs.

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  presignDownload,
  presignUpload,
  s3Enabled,
  validateUpload,
} from "@/lib/s3";
import { S3_PATH_PREFIX } from "@/lib/s3-shared";

type PresignResult =
  | { url: string; fields: Record<string, string>; key: string; expiresIn: number }
  | { disabled: true }
  | { error: string };

// Step 1 of the upload flow: the client asks for a presigned POST. The user
// must be signed in and a member of the workspace they claim to upload for;
// the file type/size are validated before any AWS call.
export async function createUploadUrl(input: {
  workspaceId: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
}): Promise<PresignResult> {
  await requireUser();

  // Composer falls back to Supabase Storage when S3 isn't configured.
  if (!s3Enabled()) return { disabled: true };

  const supabase = await createClient();
  const { data: isMember } = await supabase.rpc("is_workspace_member", {
    p_workspace_id: input.workspaceId,
  });
  if (!isMember) return { error: "Not a member of this workspace." };

  const invalid = validateUpload({
    fileType: input.fileType,
    fileSizeBytes: input.fileSizeBytes,
  });
  if (invalid) return { error: invalid };

  try {
    return await presignUpload({
      fileName: input.fileName,
      fileType: input.fileType,
      fileSizeBytes: input.fileSizeBytes,
    });
  } catch {
    return { error: "Could not prepare the upload. Try again." };
  }
}

// Step 3 (read side): short-lived download URL for an S3-backed attachment.
// The key is an unguessable UUID that only ever reaches workspace members via
// message_attachments rows (RLS-gated), so possession implies access; we still
// require a session and the uploads/ prefix.
export async function getS3DownloadUrl(
  storagePath: string,
  opts?: { downloadAs?: string },
): Promise<{ url?: string; error?: string }> {
  await requireUser();

  if (!storagePath.startsWith(S3_PATH_PREFIX)) {
    return { error: "Not an S3 attachment." };
  }
  const key = storagePath.slice(S3_PATH_PREFIX.length);
  if (!/^uploads\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/i.test(key)) {
    return { error: "Invalid attachment key." };
  }
  if (!s3Enabled()) return { error: "S3 is not configured." };

  try {
    return { url: await presignDownload(key, opts) };
  } catch {
    return { error: "Could not sign the download." };
  }
}

// Batch variant of getS3DownloadUrl. The chat renders one <AttachmentView>
// per image, and each used to fire its own getS3DownloadUrl server action -
// but Next.js runs server actions SERIALLY, so a room with N images meant N
// sequential round trips (each re-running requireUser()'s network getUser()),
// leaving later bubbles blank for seconds. Signing is pure local crypto, so
// this signs every requested key in ONE action: one auth check, one round
// trip, all URLs back together. Returns a path->url map; bad keys are omitted.
export async function getS3DownloadUrls(
  storagePaths: string[],
): Promise<{ urls: Record<string, string>; error?: string }> {
  await requireUser();

  if (!s3Enabled()) return { urls: {}, error: "S3 is not configured." };

  const urls: Record<string, string> = {};
  await Promise.all(
    // De-dupe so the same file signed twice in one batch costs one signature.
    [...new Set(storagePaths)].map(async (storagePath) => {
      if (!storagePath.startsWith(S3_PATH_PREFIX)) return;
      const key = storagePath.slice(S3_PATH_PREFIX.length);
      if (!/^uploads\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/i.test(key)) return;
      try {
        urls[storagePath] = await presignDownload(key);
      } catch {
        // Skip this one; the client falls back to a per-file retry.
      }
    }),
  );
  return { urls };
}

// Copy-image support: the S3 bucket sends no CORS headers, so the browser
// can't fetch attachment bytes itself (clipboard needs the raw bytes, unlike
// <img> which renders fine). Proxy the fetch through the server, where CORS
// doesn't apply, and hand back base64. Capped so a huge file can't balloon
// the response.
const PROXY_MAX_BYTES = 20 * 1024 * 1024;

export async function getS3AttachmentData(
  storagePath: string,
): Promise<{ base64?: string; mimeType?: string; error?: string }> {
  const signed = await getS3DownloadUrl(storagePath);
  if (!signed.url) return { error: signed.error ?? "Could not sign the download." };

  try {
    const res = await fetch(signed.url);
    if (!res.ok) return { error: "Could not fetch the file." };
    const buf = await res.arrayBuffer();
    if (buf.byteLength > PROXY_MAX_BYTES) {
      return { error: "File is too large to copy." };
    }
    return {
      base64: Buffer.from(buf).toString("base64"),
      mimeType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  } catch {
    return { error: "Could not fetch the file." };
  }
}
