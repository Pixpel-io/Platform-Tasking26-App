"use client";

import { WORKSPACE_COLORS } from "@/lib/workspace-theme";

export function ColorPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (color: string) => void;
}) {
  const selected =
    WORKSPACE_COLORS.find((c) => c.value === value) ?? WORKSPACE_COLORS[0];

  return (
    <div
      className="space-y-4"
      style={{ "--accent": value } as React.CSSProperties}
    >
      <input type="hidden" name={name} value={value} />

      {/* Live preview - shows the accent applied to real UI so the choice
          feels tangible instead of abstract. */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{
            backgroundImage:
              "linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, transparent), transparent)",
          }}
        >
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base font-bold text-white shadow-sm"
            style={{
              backgroundImage:
                "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #000))",
              boxShadow: "0 4px 14px color-mix(in srgb, var(--accent) 45%, transparent)",
            }}
          >
            {selected.name[0]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {selected.name}
            </p>
            <p className="font-mono text-xs uppercase text-muted">
              {selected.value}
            </p>
          </div>
          <span
            className="hidden shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white sm:inline-block"
            style={{ backgroundColor: "var(--accent)" }}
          >
            Preview
          </span>
        </div>
      </div>

      {/* Spectrum strip - swatches sit flush like a rainbow bar; the active
          one lifts out with a check, so the palette reads as one continuous
          gradient rather than a scattered grid. Each swatch rises in with a
          staggered delay, and a soft shimmer keeps sweeping across the bar. */}
      <div className="relative flex h-14 items-end gap-0.5 overflow-hidden rounded-xl border border-border bg-surface p-2">
        {WORKSPACE_COLORS.map((c, i) => {
          const active = c.value === value;
          const first = i === 0;
          const last = i === WORKSPACE_COLORS.length - 1;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onChange(c.value)}
              aria-label={c.name}
              aria-pressed={active}
              title={c.name}
              className={`group/sw relative grid flex-1 origin-bottom animate-swatch-rise cursor-pointer place-items-center transition-[height,transform,box-shadow] duration-200 ease-out ${
                active ? "h-full -translate-y-1" : "h-8 hover:h-full"
              } ${first ? "rounded-l-lg" : ""} ${last ? "rounded-r-lg" : ""} ${
                active ? "rounded-lg" : ""
              }`}
              style={{
                backgroundColor: c.value,
                animationDelay: `${i * 45}ms`,
                boxShadow: active
                  ? `0 0 0 2px var(--surface), 0 0 0 3px ${c.value}, 0 6px 16px color-mix(in srgb, ${c.value} 55%, transparent)`
                  : undefined,
                zIndex: active ? 10 : undefined,
              }}
            >
              <svg
                viewBox="0 0 24 24"
                className={`h-4 w-4 text-white drop-shadow transition-all duration-200 ${
                  active ? "scale-100 opacity-100" : "scale-50 opacity-0"
                }`}
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </button>
          );
        })}
        {/* Continuous shimmer sweep - a soft light band gliding across the bar */}
        <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-spectrum-sweep bg-linear-to-r from-transparent via-white/25 to-transparent" />
      </div>
    </div>
  );
}
