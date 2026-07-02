"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const WAIT_SECONDS = 5;

// Global 404. Shown for any unmatched route (and notFound() calls that no
// nested boundary catches). Counts down, then sends the visitor to /login —
// the auth middleware bounces already-signed-in users on to their workspace.
export default function NotFound() {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(WAIT_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) {
      router.replace("/login");
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, router]);

  // SVG countdown ring: radius 26 → circumference ≈ 163.36.
  const CIRC = 2 * Math.PI * 26;

  return (
    <div className="aurora-bg grid min-h-screen place-items-center overflow-hidden bg-background px-6">
      <div className="flex max-w-md animate-fade-in-up flex-col items-center text-center">
        {/* 404 with a floating ghost tile */}
        <div className="relative">
          <span className="animate-float-slow grid h-20 w-20 place-items-center rounded-3xl bg-linear-to-br from-primary/20 to-primary/5 text-primary shadow-lg shadow-primary/10 ring-1 ring-inset ring-primary/15">
            <svg
              className="h-9 w-9"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>
        </div>

        <h1 className="mt-8 text-7xl font-bold tracking-tight">
          <span className="gradient-text">404</span>
        </h1>
        <p className="mt-3 text-lg font-semibold text-foreground">
          This page doesn&apos;t exist
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          The link may be broken, or the page may have been moved or deleted.
        </p>

        {/* Countdown ring + redirect notice */}
        <div className="mt-8 flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
          <span className="relative grid h-10 w-10 shrink-0 place-items-center">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 60 60">
              <circle
                cx="30"
                cy="30"
                r="26"
                fill="none"
                stroke="var(--border)"
                strokeWidth="4"
              />
              <circle
                cx="30"
                cy="30"
                r="26"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC * (1 - secondsLeft / WAIT_SECONDS)}
                className="transition-[stroke-dashoffset] duration-1000 ease-linear"
              />
            </svg>
            <span className="text-sm font-semibold tabular-nums text-primary">
              {secondsLeft}
            </span>
          </span>
          <p className="text-left text-sm text-muted">
            Taking you to the{" "}
            <span className="font-medium text-foreground">login page</span> in{" "}
            {secondsLeft} second{secondsLeft === 1 ? "" : "s"}…
          </p>
        </div>

        <Link
          href="/login"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/30 transition-all duration-150 hover:-translate-y-px hover:opacity-95 hover:shadow-md hover:shadow-primary/25 active:scale-[0.98]"
        >
          Go now
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
