"use client";

// Slack-style tab alerts: a red dot drawn onto the favicon plus an unread
// count in the tab title ("(3) TasKing - ...") while anything is unread;
// both restore when everything is read.

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

// -- Tab title unread prefix --------------------------------------------------

const PREFIX_RE = /^\(\d+\+?\)\s/;

let unreadCount = 0;
let titleObserver: MutationObserver | null = null;

function applyTitlePrefix() {
  const bare = document.title.replace(PREFIX_RE, "");
  const next =
    unreadCount > 0
      ? `(${unreadCount > 99 ? "99+" : unreadCount}) ${bare}`
      : bare;
  // Guard: only touch the DOM when it actually changes, or the observer loops.
  if (document.title !== next) document.title = next;
}

// Keeps the "(N) " prefix on the tab title while there are unreads. Next.js
// rewrites document.title on navigation, so a MutationObserver re-applies the
// prefix whenever the title changes.
export function setTitleUnread(count: number) {
  if (typeof document === "undefined") return;
  unreadCount = count;

  if (!titleObserver) {
    const el = document.querySelector("title");
    if (el) {
      titleObserver = new MutationObserver(applyTitlePrefix);
      titleObserver.observe(el, { childList: true, characterData: true, subtree: true });
    }
  }
  applyTitlePrefix();
}
