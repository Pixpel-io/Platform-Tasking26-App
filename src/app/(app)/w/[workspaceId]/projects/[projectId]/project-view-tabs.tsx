"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { segment: "", label: "Tasks" },
  { segment: "/calendar", label: "Calendar" },
];

export function ProjectViewTabs({ base }: { base: string }) {
  const pathname = usePathname();
  return (
    <nav className="-mb-px mt-3 flex gap-1">
      {TABS.map((tab) => {
        const href = `${base}${tab.segment}`;
        const active = tab.segment === "" ? pathname === base : pathname === href;
        return (
          <Link
            key={tab.label}
            href={href}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
