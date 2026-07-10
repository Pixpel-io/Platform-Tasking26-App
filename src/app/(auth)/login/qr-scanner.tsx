"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import jsQR from "jsqr";
import { createClient } from "@/lib/supabase/client";

// In-browser QR sign-in scanner for the login page: opens the phone's camera
// right here (no external scanner app), decodes the QR shown on the signed-in
// desktop, and spends the one-time token immediately - the user is already
// mid sign-in gesture, so no extra confirmation tap is needed.
export function QrScanButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M14 14h3v3h-3zM21 14v.01M14 21v.01M17 17h.01M21 17v4h-4" />
        </svg>
        Scan QR from another device
      </button>

      {open && <ScannerDialog onClose={() => setOpen(false)} />}
    </>
  );
}

// Pulls the one-time token out of a scanned TasKing QR URL (/qr?t=... or a
// raw callback URL). Returns null for foreign QR codes.
function tokenFromQr(text: string): string | null {
  try {
    const url = new URL(text);
    const t = url.searchParams.get("t") ?? url.searchParams.get("token_hash");
    return t && t.length >= 10 ? t : null;
  } catch {
    return null;
  }
}

function ScannerDialog({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"scanning" | "verifying">("scanning");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
      } catch {
        setError(
          "Camera access was blocked. Allow it in your browser, or scan the QR with your camera app instead.",
        );
        return;
      }
      const video = videoRef.current;
      if (!video || stopped) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});
      tick();
    }

    function tick() {
      if (stopped) return;
      const video = videoRef.current;
      if (video && ctx && video.readyState >= 2) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, {
          inversionAttempts: "dontInvert",
        });
        const token = code && tokenFromQr(code.data);
        if (token) {
          stopped = true;
          stream?.getTracks().forEach((t) => t.stop());
          void verify(token);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    }

    async function verify(token: string) {
      setStatus("verifying");
      const supabase = createClient();
      const { error: otpError } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: token,
      });
      if (otpError) {
        setError(
          otpError.message.toLowerCase().includes("expired") ||
            otpError.message.toLowerCase().includes("invalid")
            ? "That code was already used or has expired. Generate a fresh one on your other device and scan again."
            : otpError.message,
        );
        setStatus("scanning");
        return;
      }
      window.location.href = "/";
    }

    void start();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-100 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground">Scan QR code</h2>
        <p className="mt-1 text-sm text-muted">
          On your signed-in device open Profile → Show QR code, then point
          this camera at it.
        </p>

        <div className="relative mx-auto mt-5 aspect-square w-full max-w-64 overflow-hidden rounded-2xl border border-border bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
          />
          {/* Scan frame */}
          <span className="pointer-events-none absolute inset-6 rounded-xl border-2 border-white/60" />
          {status === "verifying" && (
            <span className="absolute inset-0 grid place-items-center bg-black/60 text-sm font-medium text-white">
              Signing in…
            </span>
          )}
        </div>

        {error && (
          <p className="mt-3 text-sm text-danger">{error}</p>
        )}

        <button
          onClick={onClose}
          className="mt-5 w-full cursor-pointer rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}
