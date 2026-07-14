"use client";

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

// The single, shared workspace loading animation. Used both on a hard page
// load (WorkspaceLoader below) and while switching workspaces (from the
// sidebar) so the two never collide with different visuals.
export function WorkspaceSplash({
  name,
  accent,
  fading = false,
  portal = false,
}: {
  name: string;
  accent: string;
  fading?: boolean;
  // Portal to <body> when a transformed ancestor (the sidebar drawer's
  // translate-x wrapper) would otherwise trap this fixed overlay inside it
  // instead of covering the whole page. Off by default so the hard-load
  // splash still server-renders.
  portal?: boolean;
}) {
  const initial = name?.[0]?.toUpperCase() ?? "?";

  const splash = (
    <div
      aria-hidden
      className={`fixed inset-0 z-100 grid place-items-center bg-background/95 backdrop-blur-sm transition-opacity duration-500 ease-out ${
        fading ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      style={{ "--accent": accent } as React.CSSProperties}
    >
      {/* Soft accent glow behind the mark */}
      <span
        className="absolute h-72 w-72 rounded-full blur-3xl"
        style={{
          backgroundColor: "color-mix(in srgb, var(--accent) 20%, transparent)",
        }}
      />

      <div className="relative flex flex-col items-center gap-8">
        {/* Logo tile inside a spinning conic accent arc */}
        <div className="relative grid h-24 w-24 place-items-center">
          {/* Static faint track ring */}
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: "color-mix(in srgb, var(--accent) 12%, transparent)",
              WebkitMask:
                "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
              mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
            }}
          />
          {/* Rotating conic ring (masked to a thin arc) */}
          <span
            className="absolute inset-0 animate-conic-spin rounded-full"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0deg, transparent 250deg, var(--accent) 340deg, transparent 360deg)",
              WebkitMask:
                "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
              mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
            }}
          />
          {/* Breathing logo tile */}
          <span
            className="relative grid h-16 w-16 animate-breathe place-items-center rounded-2xl text-2xl font-bold text-white"
            style={{
              backgroundImage:
                "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #000))",
              boxShadow:
                "0 10px 30px color-mix(in srgb, var(--accent) 45%, transparent)",
            }}
          >
            {initial}
          </span>
        </div>

        {/* Name + rising wave dots */}
        <div className="flex flex-col items-center gap-3.5">
          <p className="animate-fade-in-up text-sm font-semibold tracking-wide text-foreground">
            {name}
          </p>
          <span className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 animate-dot-wave rounded-full"
                style={{
                  backgroundColor: "var(--accent)",
                  animationDelay: `${i * 0.16}s`,
                }}
              />
            ))}
          </span>
        </div>
      </div>
    </div>
  );

  return portal ? createPortal(splash, document.body) : splash;
}

// Branded splash shown when the app is first opened in a tab. Once per
// browser session only (sessionStorage-gated): in-app navigation, reloads,
// and layout remounts while the tab stays open must never replay it - a
// full-screen animation on every move around the app is hostile, not
// polished. Workspace switching keeps its own splash (sidebar).
const SPLASH_SEEN_KEY = "tasking:splash-seen";

export function WorkspaceLoader({
  name,
  accent,
}: {
  name: string;
  accent: string;
}) {
  const [phase, setPhase] = useState<"in" | "out" | "gone">("in");

  // Layout effect so a replayed mount hides the splash BEFORE the browser
  // paints - useEffect would flash it for a frame on every navigation.
  useLayoutEffect(() => {
    // Already played this session → drop the splash immediately.
    try {
      if (sessionStorage.getItem(SPLASH_SEEN_KEY)) {
        setPhase("gone");
        return;
      }
      sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
    } catch {
      // Storage unavailable (private mode etc.) - play it like before.
    }
    // Hold briefly for the reveal animation, then fade out and unmount.
    const fade = setTimeout(() => setPhase("out"), 900);
    const done = setTimeout(() => setPhase("gone"), 1400);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <WorkspaceSplash name={name} accent={accent} fading={phase === "out"} />
  );
}
