// Client-safe S3 constants (no SDK, no credentials).

// S3-backed attachments carry this prefix in storage_path so readers can tell
// them apart from Supabase Storage paths.
export const S3_PATH_PREFIX = "s3:";

export function isS3Path(storagePath: string): boolean {
  return storagePath.startsWith(S3_PATH_PREFIX);
}
