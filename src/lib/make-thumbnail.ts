"use client";

// Downscale an image file to a small WebP thumbnail for the chat bubble.
// Bubbles cap at 384x320 CSS px, so 768px covers 2x displays. Returns null
// when the source is already tiny (thumbnail would save nothing) or can't be
// decoded (e.g. unsupported format) - callers fall back to the original.
const THUMB_MAX = 768;
const THUMB_QUALITY = 0.72;

export async function makeThumbnail(file: File): Promise<Blob | null> {
  if (!file.type.startsWith("image/")) return null;
  // GIFs animate; a static thumb would freeze them.
  if (file.type === "image/gif") return null;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = THUMB_MAX / Math.max(bitmap.width, bitmap.height);
    if (scale >= 1 && file.size < 300 * 1024) return null;

    const w = Math.max(1, Math.round(bitmap.width * Math.min(scale, 1)));
    const h = Math.max(1, Math.round(bitmap.height * Math.min(scale, 1)));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", THUMB_QUALITY),
    );
    // Only worth shipping if it's actually smaller than the original.
    return blob && blob.size < file.size ? blob : null;
  } catch {
    return null;
  }
}
