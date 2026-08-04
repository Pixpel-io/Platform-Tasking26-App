"use client";

import { motion } from "motion/react";
import Image from "next/image";
import { MockApp } from "./MockApp";

const AVATARS = [
  { name: "Ava", color: "from-indigo-400 to-violet-500" },
  { name: "Ben", color: "from-cyan-400 to-blue-500" },
  { name: "Cai", color: "from-pink-400 to-rose-500" },
  { name: "Dee", color: "from-amber-400 to-orange-500" },
  { name: "Eli", color: "from-emerald-400 to-teal-500" },
];

export function Hero() {
  return (
    <section id="top" className="relative pb-24 pt-32 md:pt-40 lg:pt-44">
      <div className="mx-auto max-w-6xl px-6">
        {/* Announcement pill */}
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8 flex justify-center"
        >
          <a href="#features" className="landing-chip group">
            <Image src="/image/taskcycle-ios-appicon-1024.png" alt="Cleotilda" width={20} height={20} className="h-5 w-5 rounded-full ring-1 ring-indigo-300/30" />
            <span className="landing-shimmer-text">
              Cleotilda AI is live. Meet your team&apos;s new co-worker
            </span>
            <svg
              viewBox="0 0 24 24"
              className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </a>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto max-w-4xl text-center text-[clamp(2.55rem,11vw,4.5rem)] font-extrabold leading-[1.04] tracking-[-0.045em] text-[var(--foreground)]"
        >
          The workspace where{" "}
          <span className="landing-text-gradient-hot">everything</span>{" "}
          your team needs finally lives together.
        </motion.h1>

        <motion.p
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto mt-6 max-w-2xl text-center text-lg leading-relaxed text-[#b0b0c8] md:text-xl"
        >
          Realtime chat, kanban boards, DMs, calendars, and{" "}
          <span className="text-white">Cleotilda AI</span>. One workspace, zero
          tab-switching. Ship faster with less noise.
        </motion.p>

        {/* CTA row */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mt-10 flex flex-col items-stretch justify-center gap-3 px-2 sm:flex-row sm:items-center sm:px-0"
        >
          <a href="#cta" className="landing-btn-primary w-full sm:w-auto">
            Get started free
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </a>
          <a href="#product" className="landing-btn-ghost w-full sm:w-auto">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 text-indigo-300"
              fill="currentColor"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
            Watch demo · 2 min
          </a>
        </motion.div>

        {/* Social proof: avatars + rating */}
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mt-8 flex flex-col items-center justify-center gap-3 text-sm text-[#9494a8] sm:flex-row sm:gap-6"
        >
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {AVATARS.map((a) => (
                <span
                  key={a.name}
                  className={`grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br ${a.color} text-[11px] font-bold text-white ring-2 ring-[#0a0a15]`}
                >
                  {a.name[0]}
                </span>
              ))}
            </div>
            <span>
              <span className="font-semibold text-white">2,400+</span> teams
              onboarded this month
            </span>
          </div>
          <span className="hidden h-4 w-px bg-white/10 sm:block" />
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5 text-amber-400">
              {Array.from({ length: 5 }).map((_, i) => (
                <svg
                  key={i}
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="currentColor"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ))}
            </div>
            <span>
              <span className="font-semibold text-white">4.9/5</span> · G2 &
              Product Hunt
            </span>
          </div>
        </motion.div>

        {/* Mock app preview */}
        <motion.div
          initial={{ y: 60, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ delay: 0.85, duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto mt-16 max-w-5xl"
        >
          {/* Glow behind */}
          <div
            aria-hidden
            className="absolute -inset-x-10 -top-10 -bottom-10 -z-10 rounded-[3rem] bg-gradient-to-tr from-indigo-500/25 via-violet-500/15 to-cyan-400/20 blur-3xl"
          />
          <MockApp />
          {/* Floating chips */}
          <FloatingChip
            style={{ top: "10%", left: "-6%" }}
            icon="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"
            label="Message sent"
            sub="#design · just now"
            hue="from-indigo-500 to-violet-500"
          />
          <FloatingChip
            style={{ top: "55%", right: "-8%" }}
            icon="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"
            label="Task done"
            sub="Ship v2 landing"
            hue="from-emerald-500 to-teal-500"
          />
          <FloatingChip
            style={{ bottom: "-5%", left: "8%" }}
            icon="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
            label="Cleotilda"
            sub='"I&apos;ll draft the update"'
            hue="from-cyan-400 to-blue-500"
          />
        </motion.div>
      </div>
    </section>
  );
}

function FloatingChip({
  style,
  icon,
  label,
  sub,
  hue,
}: {
  style: React.CSSProperties;
  icon: string;
  label: string;
  sub: string;
  hue: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 1.3, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      style={style}
      className="landing-glass landing-float absolute z-20 hidden items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl md:flex"
    >
      <span
        className={`grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br ${hue} shadow-lg`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 text-white"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={icon} />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-xs text-[#9494a8]">{sub}</p>
      </div>
    </motion.div>
  );
}
