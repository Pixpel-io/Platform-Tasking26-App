"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import Image from "next/image";

const LINKS = [
  { label: "Features", href: "/landing-page#features" },
  { label: "Product", href: "/landing-page#product" },
  { label: "Loved by teams", href: "/landing-page#loved" },
  { label: "Pricing", href: "/landing-page#pricing" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const current = document.documentElement.dataset.landingTheme === "light" ? "light" : "dark";
    const frame = requestAnimationFrame(() => setTheme(current));
    return () => cancelAnimationFrame(frame);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.landingTheme = next;
    document.documentElement.style.colorScheme = next;
    localStorage.setItem("tasking-landing-theme", next);
  }

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed left-4 right-4 top-4 z-50 mx-auto flex max-w-6xl items-center justify-between gap-4"
    >
      <div
        className={`flex w-full items-center justify-between gap-4 rounded-2xl px-4 py-3 transition-all duration-300 ${
          scrolled
            ? "landing-glass"
            : "border border-transparent bg-white/[0.02] backdrop-blur-md"
        }`}
      >
        <a href="/landing-page" aria-label="Tasking home" className="group flex shrink-0 items-center gap-3">
          <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl shadow-lg shadow-indigo-500/25 ring-1 ring-indigo-400/20 transition-transform duration-200 group-hover:scale-[1.04]">
            <Image
              src="/image/taskcycle-ios-appicon-1024.png"
              alt="Tasking logo"
              width={40}
              height={40}
              priority
              sizes="40px"
              className="h-full w-full object-cover"
            />
          </span>
          <span className="text-xl font-extrabold tracking-[-0.035em] text-[var(--foreground)]">Tasking</span>
        </a>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#cfcff0] transition-colors hover:bg-white/5 hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="https://taskinglife.io/login"
            className="hidden rounded-lg px-3 py-1.5 text-sm font-medium text-[#cfcff0] transition-colors hover:bg-white/5 hover:text-white md:inline-flex"
          >
            Sign in
          </a>
          <button type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} className="landing-theme-toggle">
            {theme === "dark" ? <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg> : <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>}
          </button>
          <a href="/landing-page#cta" className="landing-btn-primary hidden !py-2 !text-sm sm:inline-flex">
            Get started
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </a>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10 md:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {open ? (
                <path d="M18 6 6 18M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div id="landing-mobile-menu" className="landing-glass absolute left-0 right-0 top-full mt-2 rounded-2xl p-2 md:hidden">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-4 py-3 text-sm font-medium text-[#cfcff0] transition-colors hover:bg-white/5 hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </div>
      )}
    </motion.header>
  );
}
