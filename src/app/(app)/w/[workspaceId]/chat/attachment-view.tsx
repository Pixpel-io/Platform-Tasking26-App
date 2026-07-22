"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import type { MessageAttachment } from "@/lib/supabase/types";
import { getS3AttachmentData, getS3DownloadUrl } from "@/app/(app)/s3-actions";
import { getAttachmentUrl } from "@/lib/attachment-url-cache";
import { isS3Path } from "@/lib/s3-shared";

const BUCKET = "chat-attachments";

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

// Force a download instead of opening the file in a tab. Signs a fresh URL
// with Content-Disposition: attachment and navigates to it, so the browser
// streams the file itself (native progress, original filename) - the old
// fetch()->blob approach died on cross-origin S3 URLs and buffered the whole
// file in memory.
async function downloadAttachment(attachment: MessageAttachment) {
  let href: string | null = null;
  if (isS3Path(attachment.storage_path)) {
    const res = await getS3DownloadUrl(attachment.storage_path, {
      downloadAs: attachment.file_name,
    });
    href = res.url ?? null;
  } else {
    const supabase = createClient();
    const { data } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(attachment.storage_path, 60 * 60, {
        download: attachment.file_name,
      });
    href = data?.signedUrl ?? null;
  }
  if (!href) return;
  const a = document.createElement("a");
  a.href = href;
  a.download = attachment.file_name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Copy image bytes to the clipboard (PNG - the only type ClipboardItem
// reliably supports across browsers). S3 attachments can't be fetch()ed from
// the browser (the bucket sends no CORS headers - <img> renders fine, but JS
// reads of the bytes are blocked), so those bytes come through a server-action
// proxy instead. Safari also requires clipboard.write() to be called with a
// promise created synchronously in the user gesture, hence the thenable
// ClipboardItem shape.
async function copyImage(url: string, storagePath: string) {
  const blobPromise = (async () => {
    let blob: Blob;
    if (isS3Path(storagePath)) {
      const res = await getS3AttachmentData(storagePath);
      if (!res.base64) throw new Error(res.error ?? "fetch failed");
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      blob = new Blob([bytes], { type: res.mimeType });
    } else {
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch failed");
      blob = await res.blob();
    }
    if (blob.type === "image/png") return blob;
    // Re-encode to PNG through a canvas.
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!png) throw new Error("encode failed");
    return png;
  })();
  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": blobPromise }),
  ]);
}

// Display box for image/video, scaled from intrinsic dimensions to fit the
// bubble's max size (max-w-sm = 384px, max-h-80 = 320px) while preserving
// aspect ratio. Returned so the container reserves the exact space before the
// media loads - the placeholder and the loaded media occupy identical boxes,
// so nothing shifts (and the chat never jumps) when the file finishes loading.
// 320 px fits a 360-390 px phone with the chat scroller's px-4 padding on
// both sides; the wrapper below also clamps to 100 % of its parent so nothing
// horizontally overflows on narrower screens.
const MEDIA_MAX_W = 320;
const MEDIA_MAX_H = 320;
function mediaBox(
  width: number | null,
  height: number | null,
): { width: number; height: number } | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  const scale = Math.min(MEDIA_MAX_W / width, MEDIA_MAX_H / height, 1);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export function AttachmentView({ attachment }: { attachment: MessageAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // FB-style sensitive scrim: images flagged by Rekognition render blurred
  // until the viewer taps "See anyway". Only affects the current tab / this
  // message row - other people still see their own scrim.
  const [revealed, setRevealed] = useState(false);
  const box = mediaBox(attachment.width, attachment.height);
  const isSensitive = attachment.sensitive && !revealed;

  useEffect(() => {
    let active = true;
    // Signed URLs come from a module-level cache that reuses each URL for its
    // whole lifetime - a fresh signature per mount defeated the browser's HTTP
    // cache, so switching rooms re-downloaded every image.
    void getAttachmentUrl(attachment.storage_path).then((u) => {
      if (active) setUrl(u);
    });
    if (attachment.thumb_path) {
      void getAttachmentUrl(attachment.thumb_path).then((u) => {
        if (active) setThumbUrl(u);
      });
    }
    return () => {
      active = false;
    };
  }, [attachment.storage_path, attachment.thumb_path]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  }, []);

  // Hover download button shared by the media renders below.
  const downloadBtn = url && (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void downloadAttachment(attachment);
      }}
      aria-label={`Download ${attachment.file_name}`}
      title="Download"
      className="absolute right-2 top-2 z-10 grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-black/60 text-white opacity-0 shadow-md backdrop-blur-sm transition-opacity hover:bg-black/80 focus-visible:opacity-100 group-hover/att:opacity-100"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </svg>
    </button>
  );

  if (attachment.kind === "image") {
    // Bubble renders the small WebP thumb when one exists; the HD original
    // only downloads when the viewer opens. Old attachments (no thumb) keep
    // using the original.
    const bubbleSrc = thumbUrl ?? url;
    return (
      <>
        <div className="group/att relative inline-block">
          <button
            type="button"
            onClick={() => {
              if (isSensitive) return; // scrim's own button handles reveal
              if (url) setViewerOpen(true);
            }}
            onContextMenu={(e) => {
              if (!url || isSensitive) return;
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY });
            }}
            className={`block text-left ${isSensitive ? "cursor-default" : "cursor-zoom-in"}`}
            aria-label={`View ${attachment.file_name}`}
            style={box ? { width: box.width, height: box.height, maxWidth: "100%" } : undefined}
          >
            {/* Slack-style blur-up: a soft placeholder holds the exact box so
                nothing shifts, then the image cross-fades from blurred to sharp
                the moment it decodes - no spinner, no pop-in. */}
            <div
              className={`relative overflow-hidden rounded-lg border border-border bg-surface-2 ${
                box ? "h-full w-full" : "h-40 w-64"
              }`}
            >
              {bubbleSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={bubbleSrc}
                  alt={attachment.file_name}
                  width={box?.width}
                  height={box?.height}
                  // Off-screen media waits until scrolled near - opening a long
                  // room doesn't fetch its entire image history at once.
                  loading="lazy"
                  decoding="async"
                  // A cache-hot image can finish decoding before React attaches
                  // onLoad; catch that via the ref so it never stays blurred.
                  ref={(el) => {
                    if (el?.complete) setImgLoaded(true);
                  }}
                  onLoad={() => setImgLoaded(true)}
                  className={`h-full w-full object-cover transition-all duration-500 ease-out hover:opacity-95 ${
                    imgLoaded
                      ? "scale-100 opacity-100"
                      : "scale-105 blur-xl opacity-0"
                  } ${
                    // FB-style sensitive scrim: heavy blur that persists until
                    // "See anyway" is tapped, on top of the normal blur-up.
                    isSensitive ? "scale-110 blur-2xl" : "blur-0"
                  }`}
                />
              )}
              {isSensitive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/25 p-3 text-center backdrop-blur-sm">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white shadow-md">
                    <svg
                      className="h-4.5 w-4.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    </svg>
                  </span>
                  <p className="max-w-55 text-xs font-semibold text-white">
                    Sensitive content
                  </p>
                  <p className="max-w-55 text-[11px] text-white/80">
                    This may contain graphic or adult content.
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRevealed(true);
                    }}
                    className="mt-1 cursor-pointer rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-black transition-colors hover:bg-white"
                  >
                    See anyway
                  </button>
                </div>
              )}
            </div>
          </button>
          {!isSensitive && downloadBtn}
        </div>

        {menu && url && (
          <ImageContextMenu
            x={menu.x}
            y={menu.y}
            onClose={() => setMenu(null)}
            onCopyImage={() => {
              setMenu(null);
              void copyImage(url, attachment.storage_path)
                .then(() => flash("Image copied"))
                .catch(() => flash("Couldn't copy image"));
            }}
            onCopyLink={() => {
              setMenu(null);
              void navigator.clipboard
                .writeText(url)
                .then(() => flash("Link copied"))
                .catch(() => flash("Couldn't copy link"));
            }}
            onDownload={() => {
              setMenu(null);
              void downloadAttachment(attachment);
            }}
          />
        )}

        {viewerOpen && url && (
          <ImageViewer
            url={url}
            fileName={attachment.file_name}
            onClose={() => setViewerOpen(false)}
            onCopyImage={() =>
              void copyImage(url, attachment.storage_path)
                .then(() => flash("Image copied"))
                .catch(() => flash("Couldn't copy image"))
            }
            onDownload={() => void downloadAttachment(attachment)}
          />
        )}

        {toast &&
          createPortal(
            <div className="fixed bottom-6 left-1/2 z-120 -translate-x-1/2 animate-fade-in rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background shadow-lg">
              {toast}
            </div>,
            document.body,
          )}
      </>
    );
  }

  if (attachment.kind === "video") {
    return url ? (
      <div
        className="group/att relative inline-block"
        style={box ? { width: box.width, height: box.height, maxWidth: "100%" } : undefined}
      >
        <video
          src={url}
          controls
          // Metadata only (first frame + duration) until the user hits play -
          // otherwise every video in the room streams its full file on open.
          preload="metadata"
          className={`rounded-lg border border-border ${
            box ? "h-full w-full" : "max-h-80 max-w-sm"
          }`}
        />
        {downloadBtn}
      </div>
    ) : (
      <div
        className={`rounded-lg border border-border bg-surface-2 ${
          box ? "" : "h-40 w-64"
        }`}
        style={box ? { width: box.width, height: box.height, maxWidth: "100%" } : undefined}
      />
    );
  }

  if (attachment.kind === "voice") {
    return url ? (
      <VoicePlayer
        url={url}
        durationMs={attachment.duration_ms}
        onDownload={() => void downloadAttachment(attachment)}
      />
    ) : (
      <div className="h-12 w-72 rounded-2xl border border-border bg-surface-2" />
    );
  }

  // Generic file: open in a new tab on click, download via the hover button.
  return (
    <div className="group/att relative inline-block w-full max-w-sm">
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 pr-11 hover:bg-surface-2"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <path d="M13 2v7h7" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">
            {attachment.file_name}
          </span>
          <span className="block text-xs text-muted">
            {formatSize(attachment.size_bytes)}
          </span>
        </span>
      </a>
      {url && (
        <button
          type="button"
          onClick={() => void downloadAttachment(attachment)}
          aria-label={`Download ${attachment.file_name}`}
          title="Download"
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-muted opacity-0 transition-all hover:bg-primary/10 hover:text-primary focus-visible:opacity-100 group-hover/att:opacity-100"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── Right-click context menu (Slack: Copy image / Copy link / Download) ─────

function ImageContextMenu({
  x,
  y,
  onClose,
  onCopyImage,
  onCopyLink,
  onDownload,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onCopyImage: () => void;
  onCopyLink: () => void;
  onDownload: () => void;
}) {
  useEffect(() => {
    function onDoc() {
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const items = [
    { label: "Copy image", action: onCopyImage },
    { label: "Copy link to file", action: onCopyLink },
    { label: "Download", action: onDownload },
  ];

  // Keep the menu on-screen near the click.
  const width = 208;
  const left = Math.min(x, window.innerWidth - width - 8);
  const top = Math.min(y, window.innerHeight - items.length * 36 - 16);

  return createPortal(
    <div
      style={{ position: "fixed", top, left, width, zIndex: 110 }}
      className="animate-scale-in rounded-xl border border-border bg-surface p-1.5 shadow-xl shadow-black/30"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={item.action}
          className="block w-full cursor-pointer rounded-lg px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-surface-2"
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

// ── Full-screen viewer (Slack-style lightbox: zoom, download, close) ────────

function ImageViewer({
  url,
  fileName,
  onClose,
  onCopyImage,
  onDownload,
}: {
  url: string;
  fileName: string;
  onClose: () => void;
  onCopyImage: () => void;
  onDownload: () => void;
}) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(z + 0.25, 4));
      if (e.key === "-") setZoom((z) => Math.max(z - 0.25, 0.25));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const btn =
    "grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white";

  return createPortal(
    <div className="fixed inset-0 z-100 flex flex-col bg-black/90 backdrop-blur-sm">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <p className="min-w-0 truncate text-sm font-medium text-white/90">
          {fileName}
        </p>
        <button onClick={onClose} aria-label="Close" className={btn}>
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Image area - click outside the image closes */}
      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4"
        onClick={onClose}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={fileName}
          onClick={(e) => e.stopPropagation()}
          style={{ transform: `scale(${zoom})` }}
          className="max-h-full max-w-full rounded-lg object-contain transition-transform duration-150"
        />
      </div>

      {/* Bottom toolbar */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1">
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))}
            aria-label="Zoom out"
            className={btn}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 12h14" />
            </svg>
          </button>
          <span className="min-w-12 text-center text-xs font-medium text-white/80">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}
            aria-label="Zoom in"
            className={btn}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button
            onClick={() => setZoom(1)}
            aria-label="Reset zoom"
            className={btn}
            title="Reset"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1">
          <button
            onClick={onCopyImage}
            aria-label="Copy image"
            title="Copy image"
            className={btn}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          <button
            onClick={onDownload}
            aria-label="Download"
            title="Download"
            className={btn}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open in new tab"
            title="Open in new tab"
            className={btn}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
            </svg>
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Voice message player (theme-matched, Slack-style pill) ──────────────────

function fmtClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Deterministic pseudo-waveform bar heights (no audio decoding needed) - the
// same clip always renders the same shape.
const WAVE_BARS = Array.from({ length: 28 }, (_, i) => {
  const v =
    0.5 +
    0.32 * Math.sin(i * 1.7 + 1.3) +
    0.18 * Math.sin(i * 3.1 + 0.4);
  return Math.max(0.2, Math.min(1, v));
});

function VoicePlayer({
  url,
  durationMs,
  onDownload,
}: {
  url: string;
  durationMs: number | null;
  onDownload: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(
    durationMs ? durationMs / 1000 : 0,
  );

  const progress = duration > 0 ? Math.min(1, current / duration) : 0;

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const el = audioRef.current;
    if (!el || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    el.currentTime = ratio * duration;
    setCurrent(ratio * duration);
  }

  return (
    <div className="group/att flex w-fit max-w-full items-center gap-2.5 rounded-2xl border border-border bg-surface py-2 pl-2 pr-3 shadow-sm">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
      />

      {/* Play / pause */}
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground shadow-sm shadow-primary/30 transition-all hover:opacity-90 active:scale-95"
      >
        {playing ? (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg className="ml-0.5 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z" />
          </svg>
        )}
      </button>

      {/* Waveform seek bar */}
      <div
        onClick={seek}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(current)}
        className="flex h-8 w-36 cursor-pointer items-center gap-0.5 sm:w-44"
      >
        {WAVE_BARS.map((h, i) => {
          const filled = (i + 0.5) / WAVE_BARS.length <= progress;
          return (
            <span
              key={i}
              className={`w-1 flex-1 rounded-full transition-colors duration-100 ${
                filled ? "bg-primary" : "bg-muted/30"
              }`}
              style={{ height: `${Math.round(h * 26)}px` }}
            />
          );
        })}
      </div>

      {/* Time */}
      <span className="shrink-0 text-xs font-medium tabular-nums text-muted">
        {playing || current > 0 ? fmtClock(current) : fmtClock(duration)}
      </span>

      {/* Download (hover) */}
      <button
        type="button"
        onClick={onDownload}
        aria-label="Download voice message"
        title="Download"
        className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg text-muted opacity-0 transition-all hover:bg-surface-2 hover:text-foreground focus-visible:opacity-100 group-hover/att:opacity-100"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
      </button>
    </div>
  );
}
