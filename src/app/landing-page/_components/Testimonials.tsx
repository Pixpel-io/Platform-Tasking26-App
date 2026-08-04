"use client";

import { motion } from "motion/react";

const QUOTES = [
  {
    quote:
      "We ripped out Slack, Trello, and Notion in the same week. Six months later nobody misses them.",
    name: "Amelia Ross",
    role: "Head of Product, Nova Labs",
    color: "from-pink-400 to-rose-500",
  },
  {
    quote:
      "Cleotilda drafts my standups. That alone paid for the entire year in the first sprint.",
    name: "Kai Nakamura",
    role: "Eng Manager, Tangram",
    color: "from-cyan-400 to-blue-500",
  },
  {
    quote:
      "The kanban is faster than Linear. The chat is smoother than Slack. I don't understand how they built this.",
    name: "Priya Shah",
    role: "Founder, Bloom",
    color: "from-amber-400 to-orange-500",
  },
  {
    quote:
      "Onboarding used to take a week. New hires now ship a task on day one. It's just… one workspace.",
    name: "Marcus Klein",
    role: "COO, Fieldpath",
    color: "from-emerald-400 to-teal-500",
  },
  {
    quote:
      "We stopped losing decisions in DMs. Everything is where it should be, and the AI reminds us.",
    name: "Yuna Park",
    role: "Design Lead, Studio Hexa",
    color: "from-violet-400 to-fuchsia-500",
  },
  {
    quote:
      "It feels like the founders sat with our team for a month, then built exactly what we needed.",
    name: "Diego Alvarez",
    role: "CTO, Portside",
    color: "from-indigo-400 to-violet-500",
  },
];

export function Testimonials() {
  return (
    <section id="loved" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Loved by teams
          </p>
          <motion.h2
            initial={{ y: 20, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="text-balance text-4xl font-extrabold leading-[1.1] tracking-tight text-white md:text-5xl"
          >
            The teams that switched aren&apos;t going back.
          </motion.h2>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {QUOTES.map((q, i) => (
            <motion.figure
              key={q.name}
              initial={{ y: 24, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{
                delay: (i % 3) * 0.1,
                duration: 0.7,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="landing-glass group relative overflow-hidden rounded-2xl p-6 transition-all hover:-translate-y-1 hover:border-white/15"
            >
              <span
                aria-hidden
                className={`pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-gradient-to-br ${q.color} opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-30`}
              />
              <div className="mb-4 flex gap-0.5 text-amber-400">
                {Array.from({ length: 5 }).map((_, si) => (
                  <svg
                    key={si}
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="currentColor"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>
              <blockquote className="text-[15px] leading-relaxed text-white">
                &ldquo;{q.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-lg ${q.color}`}
                >
                  {q.name[0]}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {q.name}
                  </p>
                  <p className="truncate text-xs text-[#9494a8]">{q.role}</p>
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  );
}
