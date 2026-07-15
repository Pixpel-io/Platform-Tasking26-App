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
      {/* Ambient accent glow behind the mark */}
      <span
        className="absolute h-80 w-80 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%)",
        }}
      />

      <div className="relative flex flex-col items-center gap-10">
        {/* Logo tile with a thin sweeping progress ring */}
        <div className="relative grid h-28 w-28 place-items-center">
          {/* Circular spinner (SVG stroke) - draws + rotates for a smooth,
              indeterminate progress feel. */}
          <svg
            className="absolute inset-0 h-full w-full -rotate-90 animate-spin"
            style={{ animationDuration: "1.4s" }}
            viewBox="0 0 100 100"
            fill="none"
          >
            <circle
              cx="50"
              cy="50"
              r="46"
              stroke="color-mix(in srgb, var(--accent) 12%, transparent)"
              strokeWidth="2"
            />
            <circle
              cx="50"
              cy="50"
              r="46"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="70 220"
            />
          </svg>

          {/* Logo tile with a soft float + inner sheen */}
          <span
            className="relative grid h-[4.5rem] w-[4.5rem] animate-float-slow place-items-center overflow-hidden rounded-[1.25rem] text-2xl font-bold text-white"
            style={{
              backgroundImage:
                "linear-gradient(140deg, color-mix(in srgb, var(--accent) 92%, #fff), color-mix(in srgb, var(--accent) 55%, #000))",
              boxShadow:
                "0 12px 36px color-mix(in srgb, var(--accent) 42%, transparent), inset 0 1px 1px rgba(255,255,255,0.35)",
            }}
          >
            <span
              className="pointer-events-none absolute inset-0 animate-splash-sheen"
              style={{
                background:
                  "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.45) 50%, transparent 70%)",
              }}
            />
            <span className="relative">{initial}</span>
          </span>
        </div>

        {/* Name + slim indeterminate progress bar */}
        <div className="flex w-44 flex-col items-center gap-4">
          <p className="animate-fade-in-up text-sm font-semibold tracking-[0.02em] text-foreground">
            {name}
          </p>
          <span className="relative h-[3px] w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]">
            <span
              className="absolute inset-y-0 w-2/5 animate-splash-progress rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, transparent, var(--accent), transparent)",
              }}
            />
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
