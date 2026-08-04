"use client";

import { motion } from "motion/react";
import Image from "next/image";

// Three alternating deep-dives showing "how it feels" for each pillar.
export function Showcase() {
  return (
    <section id="product" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Product
          </p>
          <motion.h2
            initial={{ y: 20, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="text-balance text-4xl font-extrabold leading-[1.1] tracking-tight text-white md:text-5xl"
          >
            Built the way{" "}
            <span className="landing-text-gradient-hot">modern teams</span> work.
          </motion.h2>
        </div>

        <div className="mt-20 space-y-28">
          <Row
            eyebrow="Chat"
            title="Threads that don't get lost."
            body="Every message lives in the channel it belongs to. Threads keep replies out of the main flow. Mentions bubble up as notifications, everywhere else stays quiet."
            bullets={[
              "Realtime channels & DMs",
              "Reactions, threads, mentions",
              "Cross-workspace inbox",
            ]}
            visual={<ChatDeepDive />}
          />
          <Row
            reverse
            eyebrow="Boards"
            title="Kanban that keeps its promises."
            body="Drag cards across columns, assign teammates, set priorities, attach files. Every change syncs instantly for everyone on the board."
            bullets={[
              "Drag & drop with live cursors",
              "Priorities, labels, checklists",
              "List, calendar, or board view",
            ]}
            visual={<BoardDeepDive />}
          />
          <Row
            eyebrow="Cleotilda AI"
            title="An AI that actually knows your project."
            body="Not a chatbot bolted on. Cleotilda has real tools. It can create, assign, dedupe or close tasks, watches your board and speaks up when something's off."
            bullets={[
              "Function-calling tools built in",
              "Understands your team's history",
              "Draft replies · summarize · dedupe",
            ]}
            visual={<AIDeepDive />}
          />
        </div>
      </div>
    </section>
  );
}

function Row({
  eyebrow,
  title,
  body,
  bullets,
  visual,
  reverse = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
      <motion.div
        initial={{ x: reverse ? 24 : -24, opacity: 0 }}
        whileInView={{ x: 0, opacity: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className={reverse ? "md:order-2" : ""}
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">
          {eyebrow}
        </p>
        <h3 className="text-3xl font-extrabold leading-tight tracking-tight text-white md:text-4xl">
          {title}
        </h3>
        <p className="mt-4 text-lg leading-relaxed text-[#b0b0c8]">{body}</p>
        <ul className="mt-6 space-y-2.5">
          {bullets.map((b) => (
            <li key={b} className="flex items-center gap-2.5 text-[#e0e0f0]">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-md shadow-indigo-500/40">
                <svg viewBox="0 0 24 24" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <span className="text-[15px]">{b}</span>
            </li>
          ))}
        </ul>
      </motion.div>

      <motion.div
        initial={{ y: 30, opacity: 0, scale: 0.96 }}
        whileInView={{ y: 0, opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className={`relative ${reverse ? "md:order-1" : ""}`}
      >
        <div
          aria-hidden
          className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-indigo-500/20 to-cyan-400/20 blur-2xl"
        />
        {visual}
      </motion.div>
    </div>
  );
}

// ─── Chat deep-dive visual ────────────────────────────────────────────
function ChatDeepDive() {
  return (
    <div className="landing-mock-window">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
        <span className="landing-dot-r" />
        <span className="landing-dot-y" />
        <span className="landing-dot-g" />
        <span className="ml-3 text-xs text-[#6d6d82]">#design</span>
      </div>
      <div className="space-y-4 p-5">
        {[
          {
            n: "Sana",
            c: "from-pink-400 to-rose-500",
            m: "New hero copy is in the doc. Please review.",
            t: "10:24",
            reactions: ["👀 4"],
          },
          {
            n: "Omar",
            c: "from-cyan-400 to-blue-500",
            m: "Love the second variant. Ship it.",
            t: "10:26",
            reactions: ["🔥 3", "✨ 2"],
          },
        ].map((m, i) => (
          <motion.div
            key={m.n}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ delay: 0.2 + i * 0.15, duration: 0.5 }}
            className="flex gap-3"
          >
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-sm font-bold text-white shadow-lg ${m.c}`}
            >
              {m.n[0]}
            </span>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-white">{m.n}</span>
                <span className="text-[11px] text-[#6d6d82]">{m.t}</span>
              </div>
              <p className="mt-0.5 text-sm text-[#cfcff0]">{m.m}</p>
              <div className="mt-2 flex gap-1.5">
                {m.reactions.map((r) => (
                  <span
                    key={r}
                    className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2 py-0.5 text-xs font-semibold text-indigo-200"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        ))}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ delay: 0.55, duration: 0.5 }}
          className="ml-12 flex gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-bold text-white">
            Z
          </span>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-white">Zoya</span>
              <span className="text-[10px] text-[#6d6d82]">10:28</span>
            </div>
            <p className="mt-0.5 text-xs text-[#9494a8]">
              Thread · 4 replies · Last from Ali
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Board deep-dive visual ───────────────────────────────────────────
type BoardCard = {
  t: string;
  pri: "High" | "Med" | "Low";
  by: string[];
  done?: number;
  total?: number;
};
type BoardColumn = { title: string; color: string; cards: BoardCard[] };

function BoardDeepDive() {
  const cols: BoardColumn[] = [
    {
      title: "To do",
      color: "from-slate-500 to-slate-600",
      cards: [
        { t: "Onboarding rewrite", pri: "Med", by: ["S"] },
        { t: "SEO audit v2", pri: "Low", by: ["O", "Z"] },
      ],
    },
    {
      title: "In progress",
      color: "from-amber-400 to-orange-500",
      cards: [
        { t: "Landing page redesign", pri: "High", by: ["S", "O"], done: 3, total: 5 },
      ],
    },
    {
      title: "Done",
      color: "from-emerald-400 to-teal-500",
      cards: [{ t: "Auth flow rewrite", pri: "Med", by: ["Z"] }],
    },
  ];

  return (
    <div className="landing-mock-window p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">
            Sprint · v2 launch
          </span>
          <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-[#9494a8]">
            8 tasks
          </span>
        </div>
        <div className="flex gap-1.5">
          {["S", "O", "Z"].map((i, idx) => (
            <span
              key={i}
              className={`grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white ring-2 ring-[#10101c] ${
                idx === 0
                  ? "from-pink-400 to-rose-500"
                  : idx === 1
                    ? "from-cyan-400 to-blue-500"
                    : "from-amber-400 to-orange-500"
              }`}
            >
              {i}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {cols.map((c, ci) => (
          <div key={c.title} className="min-w-0">
            <div className="mb-2 flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full bg-gradient-to-br ${c.color}`}
              />
              <span className="truncate text-[10px] font-bold uppercase tracking-wider text-[#9494a8]">
                {c.title}
              </span>
              <span className="ml-auto text-[10px] text-[#6d6d82]">
                {c.cards.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {c.cards.map((card, i) => (
                <motion.div
                  key={card.t}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ delay: 0.15 + (ci * 3 + i) * 0.08, duration: 0.4 }}
                  className="rounded-lg border border-white/5 bg-white/[0.04] p-2"
                >
                  <p className="mb-1.5 truncate text-[11px] font-semibold text-white">
                    {card.t}
                  </p>
                  {card.done !== undefined && card.total !== undefined && (
                    <div className="mb-1.5 h-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-400 to-cyan-400"
                        style={{ width: `${(card.done / card.total) * 100}%` }}
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`rounded-sm px-1 py-0.5 text-[8px] font-semibold ${
                        card.pri === "High"
                          ? "bg-rose-500/20 text-rose-300"
                          : card.pri === "Med"
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-slate-500/20 text-slate-300"
                      }`}
                    >
                      {card.pri}
                    </span>
                    <div className="flex -space-x-1">
                      {card.by.map((b) => (
                        <span
                          key={b}
                          className="grid h-4 w-4 place-items-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 text-[8px] font-bold text-white ring-1 ring-[#10101c]"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AI deep-dive visual ──────────────────────────────────────────────
function AIDeepDive() {
  return (
    <div className="landing-mock-window">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
        <Image src="/image/taskcycle-ios-appicon-1024.png" alt="Cleotilda" width={24} height={24} className="h-6 w-6 rounded-full ring-1 ring-cyan-300/30" />
        <span className="text-sm font-semibold text-white">Cleotilda</span>
        <span className="rounded-md bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-300">
          AI
        </span>
        <span className="ml-auto flex items-center gap-1 text-xs text-[#6d6d82]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          working
        </span>
      </div>

      <div className="space-y-3 p-5">
        <div className="flex gap-3 justify-end">
          <div className="max-w-xs rounded-2xl rounded-tr-sm bg-gradient-to-br from-indigo-500 to-violet-500 px-3.5 py-2 text-sm text-white shadow-lg">
            Any duplicate tasks in the v2 board?
          </div>
        </div>

        <div className="flex gap-3">
          <Image src="/image/taskcycle-ios-appicon-1024.png" alt="Cleotilda" width={32} height={32} className="h-8 w-8 shrink-0 rounded-full shadow-lg shadow-indigo-500/25 ring-1 ring-cyan-300/30" />
          <div className="max-w-md rounded-2xl rounded-tl-sm bg-white/[0.04] px-3.5 py-2.5 text-sm text-[#e0e0f0]">
            Found 3 pairs. &quot;Update hero copy&quot;, &quot;Hero refresh&quot;, and &quot;Landing hero copy&quot; all say the same thing.
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs">
                📋 list_tasks
              </span>
              <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs">
                🧬 dedupe
              </span>
              <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs">
                ✔ close_task
              </span>
            </div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="ml-11 flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-emerald-300" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <p className="text-xs text-emerald-200">
            2 duplicates merged. Kept &quot;Update hero copy&quot;.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
