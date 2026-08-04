"use client";

import { motion } from "motion/react";

export function CTA() {
  return (
    <section id="cta" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="landing-cta-panel relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-indigo-500/25 via-[#12122a] to-cyan-400/15 p-7 text-center sm:p-10 md:p-16"
        >
          {/* Aurora */}
          <div
            aria-hidden
            className="absolute -top-40 left-1/2 h-96 w-[600px] -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-500/40 to-cyan-400/30 blur-3xl"
          />
          <div
            aria-hidden
            className="absolute -bottom-32 -right-16 h-72 w-72 rounded-full bg-violet-500/25 blur-3xl"
          />

          {/* Content */}
          <div className="relative">
            <span className="landing-chip mx-auto mb-6">
              <span className="landing-chip-dot" />
              Free forever · No card required
            </span>
            <h2 className="mx-auto max-w-3xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tight text-white md:text-6xl">
              Give your team{" "}
              <span className="landing-text-gradient-hot">one workspace</span>{" "}
              and let it fly.
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-[#cfcff0]">
              Onboard in 60 seconds. Import your Slack, Trello, and Notion in
              minutes. Never look back.
            </p>
            <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <a href="https://taskinglife.io/signup" className="landing-btn-primary w-full !px-7 !py-4 !text-base sm:w-auto">
                Create your workspace
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
              <a href="https://taskinglife.io/login" className="landing-btn-ghost w-full !px-7 !py-4 !text-base sm:w-auto">
                Sign in
              </a>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-[#9494a8]">
              <span className="flex items-center gap-2">
                <IconCheck /> 60-second onboarding
              </span>
              <span className="flex items-center gap-2">
                <IconCheck /> Import from Slack, Trello, Notion
              </span>
              <span className="flex items-center gap-2">
                <IconCheck /> Cancel anytime
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function IconCheck() {
  return (
    <span className="grid h-4 w-4 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400">
      <svg
        viewBox="0 0 24 24"
        className="h-2.5 w-2.5 text-white"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}
