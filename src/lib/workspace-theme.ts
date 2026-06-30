// Per-workspace accent colors. The active workspace's color overrides the
// app-wide `--primary` CSS variable (see globals.css), so every bg-primary /
// text-primary / focus-ring recolors to match the workspace.

export const WORKSPACE_COLORS = [
  { name: "Indigo", value: "#4f46e5" },
  { name: "Violet", value: "#7c3aed" },
  { name: "Purple", value: "#9333ea" },
  { name: "Fuchsia", value: "#c026d3" },
  { name: "Pink", value: "#db2777" },
  { name: "Rose", value: "#e11d48" },
  { name: "Red", value: "#dc2626" },
  { name: "Orange", value: "#ea580c" },
  { name: "Amber", value: "#d97706" },
  { name: "Lime", value: "#65a30d" },
  { name: "Green", value: "#16a34a" },
  { name: "Emerald", value: "#059669" },
  { name: "Teal", value: "#0d9488" },
  { name: "Cyan", value: "#0891b2" },
  { name: "Sky", value: "#0284c7" },
  { name: "Blue", value: "#2563eb" },
  { name: "Slate", value: "#475569" },
] as const;

export const DEFAULT_WORKSPACE_COLOR = WORKSPACE_COLORS[0].value;

const HEX = /^#[0-9a-fA-F]{6}$/;

export function normalizeColor(input: string | null | undefined): string {
  const value = (input ?? "").trim();
  return HEX.test(value) ? value.toLowerCase() : DEFAULT_WORKSPACE_COLOR;
}
