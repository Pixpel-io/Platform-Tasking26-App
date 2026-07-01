"use client";

import { useEffect, useState } from "react";

// Branded splash shown on a hard page load inside a workspace. The workspace
// layout persists across client-side navigation, so this only mounts on a real
// browser refresh — then it fades itself out once the page is ready.
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
    const done = setTimeout(() => setPhase("gone"), 1350);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, []);

  if (phase === "gone") return null;

  const initial = name?.[0]?.toUpperCase() ?? "?";

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[100] grid place-items-center bg-background transition-opacity duration-[450ms] ease-out ${
        phase === "out" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      style={{ "--accent": accent } as React.CSSProperties}
    >
      {/* Soft accent glow behind the mark */}
      <span
        className="absolute h-72 w-72 rounded-full blur-3xl"
        style={{
          backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)",
        }}
      />

      <div className="relative flex flex-col items-center gap-8">
        {/* Orbiting mark */}
        <div className="relative grid h-24 w-24 place-items-center">
          {/* Expanding pulse rings */}
          <span
            className="absolute h-16 w-16 rounded-2xl animate-ping-ring"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--accent) 45%, transparent)",
            }}
          />
          {/* Rotating orbit dot */}
          <span className="absolute inset-0 animate-orbit">
            <span
              className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full"
              style={{
                backgroundColor: "var(--accent)",
                boxShadow: "0 0 12px var(--accent)",
              }}
            />
          </span>
          {/* Logo tile */}
          <span
            className="relative grid h-16 w-16 animate-scale-in place-items-center rounded-2xl text-2xl font-bold text-white"
            style={{
              backgroundImage:
                "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #000))",
              boxShadow:
                "0 10px 30px color-mix(in srgb, var(--accent) 50%, transparent)",
            }}
          >
            {initial}
          </span>
        </div>

        {/* Name + spectrum progress bar */}
        <div className="flex flex-col items-center gap-3">
          <p className="animate-fade-in-up text-sm font-semibold tracking-wide text-foreground">
            {name}
          </p>
          <span className="relative h-1 w-40 overflow-hidden rounded-full bg-surface-2">
            <span
              className="absolute inset-y-0 left-0 w-1/2 animate-loader-slide rounded-full"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, transparent, var(--accent), transparent)",
              }}
            />
          </span>
        </div>
      </div>
    </div>
  );
}
