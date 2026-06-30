"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EMOJI_CATEGORIES } from "@/lib/emoji";

export function EmojiPicker({
  onSelect,
  onClose,
  className = "",
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  className?: string;
}) {
  const [activeCat, setActiveCat] = useState(EMOJI_CATEGORIES[0].id);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const searching = query.trim().length > 0;
  const results = useMemo(() => {
    if (!searching) return [];
    const q = query.trim().toLowerCase();
    return EMOJI_CATEGORIES.flatMap((c) =>
      c.label.toLowerCase().includes(q) ? c.emojis : [],
    );
  }, [query, searching]);

  const current =
    EMOJI_CATEGORIES.find((c) => c.id === activeCat) ?? EMOJI_CATEGORIES[0];

  return (
    <div
      ref={rootRef}
      className={`flex h-80 w-[21rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl ${className}`}
    >
      {/* Category tabs */}
      <div className="flex items-center gap-0.5 border-b border-border px-2 py-1.5">
        {EMOJI_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setActiveCat(c.id);
              setQuery("");
            }}
            aria-label={c.label}
            title={c.label}
            className={`grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-lg transition-colors ${
              !searching && activeCat === c.id
                ? "bg-primary/10"
                : "hover:bg-surface-2"
            }`}
          >
            {c.icon}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-2 py-1.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search category…"
          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
        />
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!searching && (
          <p className="sticky top-0 bg-surface px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
            {current.label}
          </p>
        )}
        <div className="grid grid-cols-8 gap-0.5">
          {(searching ? results : current.emojis).map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              type="button"
              onClick={() => onSelect(emoji)}
              className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-xl transition-transform hover:scale-110 hover:bg-surface-2 active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>
        {searching && results.length === 0 && (
          <p className="px-1 py-4 text-center text-sm text-muted">
            No category matches “{query}”.
          </p>
        )}
      </div>
    </div>
  );
}
