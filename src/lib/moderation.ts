// Server-only image moderation via AWS Rekognition. Same credentials as S3
// (the file is already there - Rekognition reads it directly by key so we
// don't pay egress or re-upload it). Called from sendMessage via after() so
// the send round-trip isn't blocked on the scan.
import "server-only";

import {
  RekognitionClient,
  DetectModerationLabelsCommand,
} from "@aws-sdk/client-rekognition";

// Rekognition returns a tree of labels; anything above this confidence flips
// the attachment to "sensitive". 55 is Rekognition's own default and matches
// what Slack / FB tend to trip on for adult / graphic content.
const MIN_CONFIDENCE = 55;

// Top-level categories we treat as sensitive. Rekognition also emits softer
// labels (e.g. "Rude Gestures") which we ignore - the goal is FB-style
// nudity / graphic warnings, not a full workplace-safety filter.
const SENSITIVE_TOP_LEVEL = new Set<string>([
  "Explicit Nudity",
  "Nudity",
  "Sexual Activity",
  "Graphic Violence Or Gore",
  "Violence",
  "Visually Disturbing",
  "Explicit",
]);

const config = {
  REGION: process.env.AWS_REGION ?? "",
  ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? "",
  SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  BUCKET: process.env.AWS_S3_BUCKET ?? "",
};

export function rekognitionEnabled(): boolean {
  return Boolean(
    config.REGION &&
      config.ACCESS_KEY_ID &&
      config.SECRET_ACCESS_KEY &&
      config.BUCKET,
  );
}

const rekognition = new RekognitionClient({
  region: config.REGION,
  credentials: {
    accessKeyId: config.ACCESS_KEY_ID,
    secretAccessKey: config.SECRET_ACCESS_KEY,
  },
});

export type ModerationResult =
  | { status: "clean"; labels: string[] }
  | { status: "flagged"; labels: string[] }
  | { status: "skipped" }
  | { status: "failed"; reason: string };

// Scan an S3-backed image for sensitive content. `key` is the S3 object key
// (no bucket / no path prefix) - the same one presignUpload returned.
export async function moderateImageAtKey(
  key: string,
): Promise<ModerationResult> {
  if (!rekognitionEnabled()) return { status: "skipped" };
  try {
    const res = await rekognition.send(
      new DetectModerationLabelsCommand({
        Image: {
          S3Object: {
            Bucket: config.BUCKET,
            Name: key,
          },
        },
        MinConfidence: MIN_CONFIDENCE,
      }),
    );
    const hits = (res.ModerationLabels ?? []).filter((l) => {
      const name = l.ParentName || l.Name;
      return name != null && SENSITIVE_TOP_LEVEL.has(name);
    });
    const labels = Array.from(
      new Set(
        hits
          .map((l) => l.Name)
          .filter((n): n is string => typeof n === "string"),
      ),
    );
    return hits.length > 0
      ? { status: "flagged", labels }
      : { status: "clean", labels: [] };
  } catch (err) {
    return {
      status: "failed",
      reason: err instanceof Error ? err.message : "unknown",
    };
  }
}
