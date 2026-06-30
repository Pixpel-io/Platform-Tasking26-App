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
  return (
    <div className="flex flex-wrap gap-2">
      <input type="hidden" name={name} value={value} />
      {WORKSPACE_COLORS.map((c) => {
        const active = c.value === value;
        return (
          <button
            key={c.value}
            type="button"
            onClick={() => onChange(c.value)}
            aria-label={c.name}
            aria-pressed={active}
            title={c.name}
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-full transition-transform duration-150 hover:scale-110"
            style={{
              backgroundColor: c.value,
              boxShadow: active
                ? `0 0 0 2px var(--surface), 0 0 0 4px ${c.value}`
                : "inset 0 0 0 1px rgba(0,0,0,0.1)",
            }}
          >
            {active && (
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 text-white"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
