"use client";

import Image from "next/image";
import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

// Shared loading indicator for workspace navigation - a full-screen overlay
// with the Tasking app icon and a slim, sweeping accent ring. No progress
// bar, no glow, no name text; the ring is the whole animation.

const LOGO_SRC = "/image/taskcycle-ios-appicon-1024.png";

export function TaskingSpinner({
  fading = false,
  portal = false,
}: {
  fading?: boolean;
  // Portal to <body> when a transformed ancestor (the sidebar drawer's
  // translate-x wrapper) would otherwise trap this fixed overlay inside it.
  portal?: boolean;
}) {
  const overlay = (
    <div
      aria-hidden
      className={`fixed inset-0 z-100 grid place-items-center bg-background/95 backdrop-blur-sm transition-opacity duration-300 ease-out ${
        fading ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="relative grid h-24 w-24 place-items-center">
        {/* Thin accent ring that sweeps around the logo. */}
        <svg
          className="absolute inset-0 h-full w-full -rotate-90 animate-spin"
          style={{ animationDuration: "1.1s" }}
          viewBox="0 0 100 100"
          fill="none"
        >
          <circle
            cx="50"
            cy="50"
            r="46"
            stroke="var(--primary)"
            strokeOpacity="0.14"
            strokeWidth="2"
          />
          <circle
            cx="50"
            cy="50"
            r="46"
            stroke="var(--primary)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="72 220"
          />
        </svg>

        {/* Tasking app icon - same asset used elsewhere for brand identity. */}
        <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl bg-surface-2 shadow-sm ring-1 ring-inset ring-border/60">
          <Image
            src={LOGO_SRC}
            alt=""
            width={56}
            height={56}
            className="h-full w-full object-cover"
            priority
          />
        </span>
      </div>
    </div>
  );

  return portal ? createPortal(overlay, document.body) : overlay;
}

// Branded loading overlay shown on a hard page load. Session-gated so it
// plays once per tab open - in-app navigation, HMR, and layout re-mounts
// while the tab stays open must never replay it (a big animation every
// route change is hostile, not polished).
const SPLASH_SEEN_KEY = "tasking:splash-seen";

export function WorkspaceLoader() {
  const [phase, setPhase] = useState<"in" | "out" | "gone">("in");

  useLayoutEffect(() => {
    try {
      if (sessionStorage.getItem(SPLASH_SEEN_KEY)) {
        setPhase("gone");
        return;
      }
      sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
    } catch {
      // Storage unavailable (private mode) - play it anyway.
    }
    const fade = setTimeout(() => setPhase("out"), 600);
    const done = setTimeout(() => setPhase("gone"), 1000);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, []);

  if (phase === "gone") return null;
  return <TaskingSpinner fading={phase === "out"} />;
}
