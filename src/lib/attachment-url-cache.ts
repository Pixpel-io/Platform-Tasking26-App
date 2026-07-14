"use client";

import { createClient } from "@/lib/supabase/client";
import { getS3DownloadUrl } from "@/app/(app)/s3-actions";
import { isS3Path } from "@/lib/s3-shared";

const BUCKET = "chat-attachments";

// Signed attachment URLs live for 1h; reuse each one for 50min so a URL is
// never handed out moments before it expires.
const REUSE_MS = 50 * 60 * 1000;

type Entry = { url: Promise<string | null>; at: number };

// Module-level memo of storage_path → signed URL. Signing produces a NEW url
// every call (the signature embeds a timestamp), and the browser caches by
// exact URL - so before this cache, every room switch re-signed and therefore
// re-downloaded every image. Reusing the same signed URL across mounts makes
// the browser's HTTP cache actually hit. The promise (not the value) is
// cached so concurrent mounts of the same file share one signing request.
const cache = new Map<string, Entry>();

export function getAttachmentUrl(storagePath: string): Promise<string | null> {
  const hit = cache.get(storagePath);
  if (hit && Date.now() - hit.at < REUSE_MS) return hit.url;

  const url = isS3Path(storagePath)
    ? getS3DownloadUrl(storagePath).then((res) => res.url ?? null)
    : createClient()
        .storage.from(BUCKET)
        .createSignedUrl(storagePath, 60 * 60)
        .then(({ data }) => data?.signedUrl ?? null);

  // Don't poison the cache with failures - retry on next request.
  const entry: Entry = {
    at: Date.now(),
    url: url.then((u) => {
      if (u === null) cache.delete(storagePath);
      return u;
    }),
  };
  cache.set(storagePath, entry);
  return entry.url;
}
