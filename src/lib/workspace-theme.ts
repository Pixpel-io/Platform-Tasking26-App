// Per-workspace accent colors. The active workspace's color overrides the
// app-wide `--primary` CSS variable (see globals.css), so every bg-primary /
// text-primary / focus-ring recolors to match the workspace.

export const WORKSPACE_COLORS = [
  { name: "Indigo", value: "#4f46e5" },
  { name: "Violet", value: "#7c3aed" },
  { name: "Blue", value: "#2563eb" },
  { name: "Cyan", value: "#0891b2" },
  { name: "Emerald", value: "#059669" },
  { name: "Amber", value: "#d97706" },
  { name: "Rose", value: "#e11d48" },
  { name: "Pink", value: "#db2777" },
] as const;

export const DEFAULT_WORKSPACE_COLOR = WORKSPACE_COLORS[0].value;

const HEX = /^#[0-9a-fA-F]{6}$/;

export function normalizeColor(input: string | null | undefined): string {
  const value = (input ?? "").trim();
  return HEX.test(value) ? value.toLowerCase() : DEFAULT_WORKSPACE_COLOR;
}
