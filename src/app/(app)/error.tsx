"use client";

import { useEffect } from "react";

// Graceful fallback for any app route whose render (usually a Supabase data
// fetch) fails - most often after the tab was idle and the first request hit
// a cold connection. Without this boundary the failure bubbles to the browser
// as its native "This page couldn't load" dead page; here the user gets an
// in-app retry that re-runs the failed segment without a full reload.
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

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
          onClick={() => unstable_retry()}
          className="mt-5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
