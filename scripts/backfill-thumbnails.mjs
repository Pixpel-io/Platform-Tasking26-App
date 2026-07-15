// One-time backfill: generate WebP thumbnails for image attachments uploaded
// before the thumbnail feature existed (thumb_path IS NULL).
//
// The composer makes thumbnails in the browser via canvas; this does the same
// downscale server-side with sharp, uploads each thumb to S3 under the same
// uploads/<uuid>.webp key shape the app already trusts, and sets thumb_path so
// the chat bubble renders the small file instead of the multi-MB original.
//
// Idempotent + resumable: only touches rows still missing a thumb_path, and a
// re-run after a partial pass just picks up whatever's left. Read-mostly - the
// only writes are new thumb objects in S3 and the thumb_path column.
//
// Usage (from d:/Tasking-Web-App):
//   node scripts/backfill-thumbnails.mjs           # do the work
//   node scripts/backfill-thumbnails.mjs --dry-run # report only, no writes

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

config({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");

// Match the client thumbnailer (src/lib/make-thumbnail.ts).
const THUMB_MAX = 768;
const THUMB_QUALITY = 72;
const S3_PATH_PREFIX = "s3:";

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_S3_BUCKET,
} = process.env;

for (const [k, v] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_S3_BUCKET,
})) {
  if (!v) {
    console.error(`Missing env var: ${k}. Run from d:/Tasking-Web-App.`);
    process.exit(1);
  }
}

const supabase = createClient(
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

const KEY_RE = /^uploads\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/i;

function s3KeyFromPath(storagePath) {
  if (!storagePath.startsWith(S3_PATH_PREFIX)) return null;
  const key = storagePath.slice(S3_PATH_PREFIX.length);
  return KEY_RE.test(key) ? key : null;
}

async function streamToBuffer(body) {
  const chunks = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function makeThumb(buf) {
  const img = sharp(buf, { failOn: "none" });
  const meta = await img.metadata();
  if (!meta.width || !meta.height) return null;
  // Never upscale; only shrink the long edge to THUMB_MAX.
  const longest = Math.max(meta.width, meta.height);
  const resized =
    longest > THUMB_MAX
      ? img.resize({
          width: meta.width >= meta.height ? THUMB_MAX : undefined,
          height: meta.height > meta.width ? THUMB_MAX : undefined,
          fit: "inside",
        })
      : img;
  const out = await resized.webp({ quality: THUMB_QUALITY }).toBuffer();
  // Only worth it if the thumb is actually smaller than the original.
  return out.length < buf.length ? out : null;
}

async function main() {
  console.log(
    `Backfilling attachment thumbnails${DRY_RUN ? " (DRY RUN)" : ""}...\n`,
  );

  // Only S3-backed images with no thumb yet.
  const { data: rows, error } = await supabase
    .from("message_attachments")
    .select("id, storage_path")
    .eq("kind", "image")
    .is("thumb_path", null)
    .like("storage_path", `${S3_PATH_PREFIX}%`);

  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  const targets = (rows ?? []).filter((r) => s3KeyFromPath(r.storage_path));
  console.log(`Found ${targets.length} image(s) needing a thumbnail.\n`);

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of targets) {
    const key = s3KeyFromPath(row.storage_path);
    try {
      const obj = await s3.send(
        new GetObjectCommand({ Bucket: AWS_S3_BUCKET, Key: key }),
      );
      const original = await streamToBuffer(obj.Body);
      const thumb = await makeThumb(original);

      if (!thumb) {
        skipped++;
        console.log(`- skip ${key} (thumb no smaller / undecodable)`);
        continue;
      }

      const thumbKey = `uploads/${randomUUID()}.webp`;
      if (!DRY_RUN) {
        await s3.send(
          new PutObjectCommand({
            Bucket: AWS_S3_BUCKET,
            Key: thumbKey,
            Body: thumb,
            ContentType: "image/webp",
          }),
        );
        const { error: upErr } = await supabase
          .from("message_attachments")
          .update({ thumb_path: `${S3_PATH_PREFIX}${thumbKey}` })
          .eq("id", row.id);
        if (upErr) throw new Error(upErr.message);
      }

      done++;
      const pct = Math.round((thumb.length / original.length) * 100);
      console.log(
        `+ ${key} → ${thumbKey} (${(original.length / 1024).toFixed(0)}KB → ${(thumb.length / 1024).toFixed(0)}KB, ${pct}%)`,
      );
    } catch (e) {
      failed++;
      console.error(`! fail ${key}: ${e.message}`);
    }
  }

  console.log(
    `\nDone. ${done} thumbnailed, ${skipped} skipped, ${failed} failed.${
      DRY_RUN ? " (nothing written)" : ""
    }`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
