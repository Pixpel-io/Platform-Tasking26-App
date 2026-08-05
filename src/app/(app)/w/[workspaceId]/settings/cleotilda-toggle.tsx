"use client";

import Image from "next/image";
import {
  setCleotildaEnabled,
  useCleotildaEnabled,
} from "@/lib/cleotilda-visibility";

// Per-browser preference: show or hide the floating Cleotilda launcher.
// Same shape as the NotificationSoundPicker section right below it so both
// personal cards line up visually.
export function CleotildaToggle() {
  const enabled = useCleotildaEnabled();

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-primary/20 to-primary/5 ring-1 ring-primary/15">
          <Image
            src="/image/taskcycle-ios-appicon-1024.png"
            alt=""
            width={28}
            height={28}
            className="rounded-full"
          />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">
            Cleotilda floating assistant
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {enabled
              ? "The launcher is showing on every workspace page."
              : "Turn it back on any time from Settings."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={enabled ? "Disable Cleotilda launcher" : "Enable Cleotilda launcher"}
          onClick={() => setCleotildaEnabled(!enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            enabled ? "bg-primary" : "bg-surface-2 ring-1 ring-inset ring-border"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </section>
  );
}
