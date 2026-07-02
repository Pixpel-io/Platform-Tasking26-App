"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Mobile navigation shell: on small screens the sidebar becomes a slide-in
// drawer behind a hamburger button; on lg+ it renders inline as before.
// The drawer closes automatically on route change.

const MobileNavContext = createContext<{ close: () => void } | null>(null);

// Sidebar items can call this to close the drawer on actions that don't
// navigate (opening a dialog etc.). No-op on desktop.
export function useMobileNav() {
  return useContext(MobileNavContext);
}

export function AppShell({
  sidebar,
  topBarTitle,
  topBarActions,
  children,
}: {
  sidebar: React.ReactNode;
  topBarTitle: string;
  topBarActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever navigation happens.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <MobileNavContext.Provider value={{ close: () => setOpen(false) }}>
      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-13 items-center gap-2 border-b border-border bg-surface/90 px-3 backdrop-blur-md lg:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {topBarTitle}
        </span>
        {topBarActions && (
          <div className="flex shrink-0 items-center gap-1.5">
            {topBarActions}
          </div>
        )}
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 animate-fade-in bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar: drawer on mobile, static on lg+ */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transition-transform duration-250 ease-out lg:static lg:z-auto lg:translate-x-0 lg:transition-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebar}
      </div>

      {children}
    </MobileNavContext.Provider>
  );
}
