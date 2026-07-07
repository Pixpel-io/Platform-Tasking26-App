"use client";

import { useEffect, useRef, useState } from "react";
import {
  SOUND_OPTIONS,
  getSelectedSound,
  playSound,
  setSelectedSound,
} from "@/lib/notify-sound";

// Compact notification-tone picker: one row with a dropdown + preview button.
// The choice is stored per browser (localStorage) so each user hears their
// own pick. Picking an option previews it immediately.
export function NotificationSoundPicker() {
  const [selected, setSelected] = useState<string | null>(() =>
    typeof window === "undefined" ? null : getSelectedSound(),
  );
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = SOUND_OPTIONS.find((o) => o.id === selected);

  function pick(id: string) {
    setSelected(id);
    setSelectedSound(id);
    playSound(id);
    setOpen(false);
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">
            Notification sound
          </h2>
          <p className="mt-1 text-sm text-muted">
            The tone you hear for new messages and notifications. Saved just
            for you.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Dropdown */}
          <div ref={wrapRef} className="relative">
            <button
              onClick={() => setOpen((o) => !o)}
              className="flex w-52 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:border-primary/40"
            >
              <svg className="h-4 w-4 shrink-0 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5 6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
              <span className="min-w-0 flex-1 truncate text-left">
                {current?.label ?? "Choose a sound"}
              </span>
              <svg
                className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {open && (
              <div className="absolute right-0 top-full z-30 mt-1 max-h-64 w-52 animate-scale-in overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-xl">
                {SOUND_OPTIONS.map((opt) => {
                  const active = selected === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => pick(opt.id)}
                      className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                        active
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-foreground hover:bg-surface-2"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                      {active && (
                        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Preview current */}
          <button
            onClick={() => selected && playSound(selected)}
            aria-label="Preview sound"
            title="Preview"
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-border text-muted transition-colors hover:border-primary/40 hover:text-primary"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="6 3 20 12 6 21 6 3" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
