"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUnreadNotifications } from "@/lib/use-unread-notifications";

// Global notification entry point. Lives pinned to the top-right of the content
// area (the per-page headers only use the left side), replacing the old sidebar
// nav item. Shows a live unread badge and links to the notifications page.
export function NotificationBell({
  workspaceId,
  userId,
  initialCount,
}: {
  workspaceId: string;
  userId: string;
  initialCount: number;
}) {
  const pathname = usePathname();
  const href = `/w/${workspaceId}/notifications`;
  const active = pathname.startsWith(href);
  const count = useUnreadNotifications(workspaceId, userId, initialCount);

  return (
    <Link
      href={href}
      aria-label={
        count > 0 ? `Notifications, ${count} unread` : "Notifications"
      }
      className={`absolute right-3 top-2.5 z-30 grid h-9 w-9 place-items-center rounded-lg border transition-colors ${
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-surface text-muted hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      <svg
        className="h-[18px] w-[18px]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-1 -top-1 grid h-5 min-w-5 animate-scale-in place-items-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground shadow-sm shadow-primary/30">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
