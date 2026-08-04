"use client";

import { motion } from "motion/react";

const LOGOS = [
  "acme.co",
  "linear.app",
  "vercel",
  "notion",
  "supabase",
  "framer",
  "raycast",
  "stripe",
  "figma",
  "loom",
];

export function LogoStrip() {
  return (
    <section className="relative py-16">
      <div className="mx-auto max-w-6xl px-6">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          className="mb-8 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[#6d6d82]"
        >
          Powering teams at fast-moving startups
        </motion.p>
        <div className="relative overflow-hidden">
          {/* Fade edges */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[#050510] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[#050510] to-transparent" />

          <div className="flex w-max landing-marquee gap-14 pr-14">
            {[...LOGOS, ...LOGOS].map((l, i) => (
              <span
                key={`${l}-${i}`}
                className="flex shrink-0 items-center text-2xl font-bold tracking-tight text-white/40 transition-colors hover:text-white/70"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
