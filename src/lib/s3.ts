// Server-only S3 module. AWS credentials live exclusively here - importing
// this file from a client component fails the build via "server-only".
import "server-only";

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

// -- Config (server env only - no NEXT_PUBLIC_ prefix, never bundled) --------

const config = {
  AWS: {
    REGION: process.env.AWS_REGION ?? "",
    ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? "",
    SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    BUCKET: process.env.AWS_S3_BUCKET ?? "",
  },
  // Per-file cap for presigned uploads (default 300 MB).
  MAX_UPLOAD_BYTES:
    Number(process.env.S3_MAX_UPLOAD_MB || 300) * 1024 * 1024,
};

export function s3Enabled(): boolean {
  return Boolean(
    config.AWS.REGION &&
      config.AWS.ACCESS_KEY_ID &&
      config.AWS.SECRET_ACCESS_KEY &&
      config.AWS.BUCKET,
  );
}

export const s3 = new S3Client({
  region: config.AWS.REGION,
  credentials: {
    accessKeyId: config.AWS.ACCESS_KEY_ID,
    secretAccessKey: config.AWS.SECRET_ACCESS_KEY,
  },
});

// -- Validation ---------------------------------------------------------------

// Top-level MIME families we accept for chat attachments.
const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/", "application/", "text/"];

// Conservative extension shape: letters/digits only, short. Everything else
// falls back to "bin" so a hostile filename can't inject into the key.
function safeExtension(fileName: string, mime: string): string {
  const fromName = /\.([a-zA-Z0-9]{1,8})$/.exec(fileName)?.[1];
  if (fromName) return fromName.toLowerCase();
  const fromMime = /^[a-z]+\/([a-z0-9.+-]{1,20})$/i.exec(mime)?.[1];
  return (fromMime ?? "bin").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
}

export function validateUpload(input: {
  fileType: string;
  fileSizeBytes: number;
}): string | null {
  if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(input.fileType)) {
    return "Unrecognized file type.";
  }
  if (!ALLOWED_MIME_PREFIXES.some((p) => input.fileType.startsWith(p))) {
    return "This file type isn't allowed.";
  }
  if (!Number.isFinite(input.fileSizeBytes) || input.fileSizeBytes <= 0) {
    return "Invalid file size.";
  }
  if (input.fileSizeBytes > config.MAX_UPLOAD_BYTES) {
    const mb = Math.round(config.MAX_UPLOAD_BYTES / (1024 * 1024));
    return `File is too large (max ${mb} MB).`;
  }
  return null;
}

// -- Presigned POST (upload) --------------------------------------------------

export async function presignUpload(input: {
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
}) {
  const fileType = input.fileType;
  const fileSizeInBytes = input.fileSizeBytes;

  // Generate unique key for the file. UUID prevents collisions and the fixed
  // "uploads/" prefix means callers can never choose (or escape) the key.
  const key = `uploads/${uuidv4()}.${safeExtension(input.fileName, fileType)}`;
  const maxSizeInBytes = fileSizeInBytes;

  // Create presigned POST with conditions
  const { url, fields } = await createPresignedPost(s3, {
    Bucket: config.AWS.BUCKET,
    Key: key,
    Conditions: [
      ["content-length-range", 0, maxSizeInBytes],
      ["starts-with", "$Content-Type", fileType.split("/")[0]],
    ],
    Fields: {
      "Content-Type": fileType,
    },
    Expires: 3600,
  });

  return {
    url,
    fields,
    key,
    expiresIn: 3600,
  };
}

// -- Presigned GET (download/view) --------------------------------------------

export async function presignDownload(
  key: string,
  opts?: { downloadAs?: string },
): Promise<string> {
  // `downloadAs` signs Content-Disposition: attachment into the URL, so the
  // browser saves the file natively (its own progress UI, original filename)
  // instead of the app buffering the whole object through fetch().
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: config.AWS.BUCKET,
      Key: key,
      // S3 sends no Cache-Control by default, so browsers re-validated (or
      // re-fetched) media on every room switch. Uploads are immutable
      // (UUID-keyed), so let the browser cache them for the signed URL's
      // lifetime.
      ResponseCacheControl: "private, max-age=3600, immutable",
      ...(opts?.downloadAs
        ? {
            ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(opts.downloadAs)}`,
          }
        : {}),
    }),
    { expiresIn: 3600 },
  );
}
