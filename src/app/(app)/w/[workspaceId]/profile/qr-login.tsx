"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { createQrLoginUrl } from "@/app/(app)/qr-login-actions";

// "Sign in on your phone" - renders a QR of a one-time magic-link URL. The
// token is single-use and short-lived, so the dialog warns and lets the user
// regenerate. Works for any sign-in provider (Google, Microsoft, email).
export function QrLoginCard() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="mt-6 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">
              Use Tasking on your phone
            </h2>
            <p className="mt-1 text-sm text-muted">
              Scan a QR code with your phone&apos;s camera to open Tasking
              already signed in - no password needed.
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
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
            Show QR code
          </button>
        </div>
      </section>

      {open && <QrDialog onClose={() => setOpen(false)} />}
    </>
  );
}

const EXPIRY_SECONDS = 120;

function QrDialog({ onClose }: { onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(EXPIRY_SECONDS);
  const [generation, setGeneration] = useState(0);
  // Reset during render when a new code is requested (avoids a
  // setState-in-effect cascade).
  const [lastGeneration, setLastGeneration] = useState(generation);
  if (generation !== lastGeneration) {
    setLastGeneration(generation);
    setDataUrl(null);
    setError(null);
    setSecondsLeft(EXPIRY_SECONDS);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Mint a fresh one-time link and draw it. Re-runs on "generate again".
  useEffect(() => {
    let active = true;

    void createQrLoginUrl().then(async (res) => {
      if (!active) return;
      if ("error" in res) {
        setError(res.error);
        return;
      }
      const png = await QRCode.toDataURL(res.url, {
        width: 480,
        margin: 1,
        errorCorrectionLevel: "M",
      });
      if (active) setDataUrl(png);
    });

    const tick = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);

    return () => {
      active = false;
      clearInterval(tick);
    };
  }, [generation]);

  const expired = secondsLeft === 0;
  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return createPortal(
    <div
      className="fixed inset-0 z-100 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground">
          Sign in on your phone
        </h2>
        <p className="mt-1 text-sm text-muted">
          Open your phone&apos;s camera and scan. The link signs you in once,
          then expires.
        </p>

        <div className="mx-auto mt-5 grid aspect-square w-full max-w-64 place-items-center overflow-hidden rounded-2xl border border-border bg-white p-3">
          {error ? (
            <p className="px-4 text-sm text-danger">{error}</p>
          ) : !dataUrl ? (
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dataUrl}
              alt="QR code to sign in on your phone"
              className={`h-full w-full transition-all duration-300 ${
                expired ? "opacity-20 blur-sm" : ""
              }`}
            />
          )}
        </div>

        {!error && dataUrl && (
          <p
            className={`mt-3 text-xs font-medium tabular-nums ${
              expired ? "text-danger" : "text-muted"
            }`}
          >
            {expired ? "This code has expired." : `Expires in ${mm}:${ss}`}
          </p>
        )}

        <div className="mt-5 flex justify-center gap-2">
          <button
            onClick={() => setGeneration((g) => g + 1)}
            className="cursor-pointer rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            Generate new code
          </button>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Done
          </button>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-muted/70">
          The code is tied to your account and works once. Only scan it
          yourself - anyone who scans it gets signed in as you.
        </p>
      </div>
    </div>,
    document.body,
  );
}
