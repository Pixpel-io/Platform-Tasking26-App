"use client";

import { useEffect, useState } from "react";

// Graceful fallback for any app route whose render (usually a Supabase data
// fetch) fails - most often after the tab was idle and the first request hit
// a cold connection, or a background router.refresh() raced a stale JWT.
// Without this boundary the failure bubbles to the browser as its native
// "This page couldn't load" dead page; here the user gets an in-app retry.
//
// Most of these are transient: a single silent auto-retry recovers ~99% of
// the time, and we only fall through to the visible error UI when it doesn't.

// Shared across error remounts within a short window so a systemic (not
// transient) failure can't spin forever. Resets after a quiet period.
let autoRetryBudget = 3;
let lastErrorAt = 0;
const AUTO_RETRY_BUDGET = 3;
const AUTO_RETRY_QUIET_MS = 30_000;
const AUTO_RETRY_DELAY_MS = 300;

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    console.error(error);

    const now = Date.now();
    if (now - lastErrorAt > AUTO_RETRY_QUIET_MS) {
      autoRetryBudget = AUTO_RETRY_BUDGET;
    }
    lastErrorAt = now;

    if (autoRetryBudget <= 0) {
      setShowManual(true);
      return;
    }

    autoRetryBudget -= 1;
    const t = setTimeout(() => unstable_retry(), AUTO_RETRY_DELAY_MS);
    // If the retry doesn't unmount us fast (e.g. it fails again immediately),
    // reveal the manual UI so the user isn't staring at a blank screen forever.
    const reveal = setTimeout(() => setShowManual(true), 1500);
    return () => {
      clearTimeout(t);
      clearTimeout(reveal);
    };
  }, [error, unstable_retry]);

  if (!showManual) {
    return (
      <div className="grid h-full min-h-[60vh] place-items-center p-6">
        <span
          aria-label="Reconnecting"
          className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
        />
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-[60vh] place-items-center p-6">
      <div className="flex max-w-sm flex-col items-center text-center">
        <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-danger/10 text-danger">
          <svg
            className="h-6 w-6"
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
        <h2 className="text-base font-semibold text-foreground">
          Something went wrong
        </h2>
        <p className="mt-1 text-sm text-muted">
          This can happen after the app has been idle. Try again - your session
          is still active.
        </p>
        <button
          onClick={() => {
            setShowManual(false);
            unstable_retry();
          }}
          className="mt-5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
        {(error.message || error.digest) && (
          <details className="mt-5 max-w-full text-left text-xs">
            <summary className="cursor-pointer text-muted/70 hover:text-muted">
              Details
            </summary>
            <div className="mt-2 space-y-1 rounded-lg bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-muted">
              {error.message && (
                <p className="wrap-anywhere">{error.message}</p>
              )}
              {error.digest && (
                <p className="text-muted/70">ref: {error.digest}</p>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
