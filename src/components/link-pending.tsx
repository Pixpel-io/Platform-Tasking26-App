"use client";

import { useLinkStatus } from "next/link";

// Spinner shown inline on a <Link> while its navigation is pending. Must be
// rendered as a descendant of the <Link> it reports on.
export function LinkSpinner({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      className={`inline-block h-3.5 w-3.5 shrink-0 animate-spin-fast rounded-full border-[1.5px] border-current border-t-transparent opacity-70 ${className}`}
    />
  );
}

// Fixed top progress bar shown while a <Link>'s navigation is pending. Must be
// rendered as a descendant of that <Link>.
export function LinkProgressBar() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span className="nav-progress" />;
}
