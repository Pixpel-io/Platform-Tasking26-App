"use client";

// Slack-style favicon badge: draws a red dot on the app icon and swaps the
// tab's favicon while anything is unread; restores the original when read.

let badged = false;
let badgedUrl: string | null = null;
let originalHrefs: Map<HTMLLinkElement, string> | null = null;

function faviconLinks(): HTMLLinkElement[] {
  return Array.from(
    document.querySelectorAll<HTMLLinkElement>("link[rel*='icon']"),
  );
}

async function buildBadgedIcon(): Promise<string | null> {
  try {
    const img = new Image();
    img.src = "/icon-192.png";
    await img.decode();

    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, size, size);

    // Red dot, top-right, with a dark ring so it pops on any tab strip.
    const r = size * 0.22;
    const cx = size - r - 2;
    const cy = r + 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1d21";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#e01e5a";
    ctx.fill();

    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export async function setFaviconBadge(show: boolean) {
  if (typeof document === "undefined" || show === badged) return;
  badged = show;

  const links = faviconLinks();
  if (links.length === 0) return;

  if (show) {
    badgedUrl ??= await buildBadgedIcon();
    if (!badgedUrl || !badged) return; // build failed or cleared meanwhile
    originalHrefs ??= new Map(links.map((l) => [l, l.href]));
    links.forEach((l) => (l.href = badgedUrl!));
  } else {
    links.forEach((l) => {
      const original = originalHrefs?.get(l);
      if (original) l.href = original;
    });
  }
}
