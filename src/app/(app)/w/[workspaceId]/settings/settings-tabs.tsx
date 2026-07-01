"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-navigation for the Settings area. "General" is the base /settings route;
// "Members" lives at /settings/members. Active state is derived from the path
// so an exact match highlights General without also matching the sub-route.
export function SettingsTabs({ base }: { base: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: base, label: "General", exact: true },
    { href: `${base}/members`, label: "Members", exact: false },
  ];

  return (
    <nav className="mb-6 flex gap-1 border-b border-border">
      {tabs.map((t) => {
        const active = t.exact
          ? pathname === t.href
          : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted hover:border-border hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
