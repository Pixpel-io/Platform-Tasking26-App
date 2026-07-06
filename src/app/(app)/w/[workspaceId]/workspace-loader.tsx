"use client";

import { useEffect, useState } from "react";

// The single, shared workspace loading animation. Used both on a hard page
// load (WorkspaceLoader below) and while switching workspaces (from the
// sidebar) so the two never collide with different visuals.
export function WorkspaceSplash({
  name,
  accent,
  fading = false,
}: {
  name: string;
  accent: string;
  fading?: boolean;
}) {
  const initial = name?.[0]?.toUpperCase() ?? "?";

  return (
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
}

// Branded splash shown on a hard page load inside a workspace. The workspace
// layout persists across client-side navigation, so this only mounts on a real
// browser refresh - then it fades itself out once the page is ready.
export function WorkspaceLoader({
  name,
  accent,
}: {
  name: string;
  accent: string;
}) {
  const [phase, setPhase] = useState<"in" | "out" | "gone">("in");

  useEffect(() => {
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
