"use client";

import { createClient } from "@/lib/supabase/client";
import { getS3DownloadUrl, getS3DownloadUrls } from "@/app/(app)/s3-actions";
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

// -- S3 micro-batching --------------------------------------------------------
// Every image bubble mounts at once and each asks for its signed URL. Next.js
// runs server actions SERIALLY, so N images meant N sequential round trips and
// bubbles that stayed blank for seconds. Instead we collect all S3 requests
// made in the same tick and flush them through ONE getS3DownloadUrls call.
type Pending = {
  resolve: (url: string | null) => void;
  reject: (err: unknown) => void;
};
let s3Queue = new Map<string, Pending>();
let flushScheduled = false;

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  // Microtask: batches every synchronous getAttachmentUrl call from the same
  // render without adding a visible delay.
  void Promise.resolve().then(flushS3Queue);
}

async function flushS3Queue() {
  flushScheduled = false;
  const batch = s3Queue;
  s3Queue = new Map();
  const paths = [...batch.keys()];
  if (paths.length === 0) return;

  try {
    const { urls } = await getS3DownloadUrls(paths);
    for (const [path, pending] of batch) {
      pending.resolve(urls[path] ?? null);
    }
  } catch (err) {
    for (const pending of batch.values()) pending.reject(err);
  }
}

function signS3(storagePath: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    s3Queue.set(storagePath, { resolve, reject });
    scheduleFlush();
  });
}

export function getAttachmentUrl(storagePath: string): Promise<string | null> {
  const hit = cache.get(storagePath);
  if (hit && Date.now() - hit.at < REUSE_MS) return hit.url;

  const url = isS3Path(storagePath)
    ? signS3(storagePath).then((u) => {
        // A batch miss (bad key / transient) falls back to a single sign so a
        // single failure never strands the bubble.
        if (u !== null) return u;
        return getS3DownloadUrl(storagePath).then((res) => res.url ?? null);
      })
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
