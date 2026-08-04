"use client";

import Image from "next/image";

const COLS = [
  {
    title: "Product",
    links: [
      { label: "Chat", href: "/landing-page#features" },
      { label: "Boards", href: "/landing-page#product" },
      { label: "Cleotilda AI", href: "/landing-page#product" },
      { label: "Pricing", href: "/landing-page#pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/landing-page" },
      { label: "Loved by teams", href: "/landing-page#loved" },
      { label: "Contact", href: "/landing-page#cta" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Get started", href: "/landing-page#cta" },
      { label: "Features", href: "/landing-page#features" },
      { label: "Home", href: "/landing-page" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/landing-page/privacy" },
      { label: "Terms & Conditions", href: "/landing-page/terms" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative pb-10 pt-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="landing-divider mb-16" />

        <div className="grid gap-10 md:grid-cols-6">
          <div className="md:col-span-2">
            <a href="/landing-page" className="mb-4 inline-flex items-center gap-2.5">
              <Image src="/image/taskcycle-ios-appicon-1024.png" alt="Tasking" width={32} height={32} className="h-8 w-8 rounded-[10px] shadow-lg shadow-indigo-500/30 ring-1 ring-white/10" />
              <span className="text-lg font-bold text-white">Tasking</span>
            </a>
            <p className="max-w-xs text-sm leading-relaxed text-[#9494a8]">
              Everything your team needs, in one place. Built for focused,
              modern collaboration.
            </p>
          </div>

          {COLS.map((col) => (
            <div key={col.title}>
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-white">
                {col.title}
              </p>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="text-sm text-[#9494a8] transition-colors hover:text-white"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 text-xs text-[#6d6d82] md:flex-row">
          <p>© {new Date().getFullYear()} Pixpel SL · All rights reserved.</p>
          <p className="flex items-center gap-2">
            Secure by design · taskinglife.io
          </p>
        </div>
      </div>
    </footer>
  );
}
