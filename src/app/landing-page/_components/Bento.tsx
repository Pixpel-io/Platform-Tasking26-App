"use client";

import { motion } from "motion/react";
import Image from "next/image";

// ─── Section wrapper ──────────────────────────────────────────────────
export function Bento() {
  return (
    <section id="features" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHead
          eyebrow="One tool. Everything inside."
          title={
            <>
              Stop paying for six apps that{" "}
              <span className="landing-text-gradient-hot">don&apos;t talk</span>{" "}
              to each other.
            </>
          }
          lead="Tasking bundles every collaboration surface your team touches into one workspace, with an AI that actually knows what&apos;s going on."
        />

        <div className="mt-14 grid gap-4 md:grid-cols-6 md:grid-rows-[repeat(4,_minmax(0,_1fr))]">
          {/* Big: Realtime chat */}
          <Tile className="md:col-span-4 md:row-span-2">
            <TileHeader
              icon="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
              chip="Chat"
              chipHue="from-indigo-500 to-violet-500"
              title="Realtime chat that stays in context."
              body="Channels, DMs, threads, mentions, reactions. Everything is instant. No refresh, no lag."
            />
            <ChatPreview />
          </Tile>

          {/* Tall: Kanban */}
          <Tile className="md:col-span-2 md:row-span-3">
            <TileHeader
              icon="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"
              chip="Boards"
              chipHue="from-emerald-500 to-teal-500"
              title="Kanban that mirrors how your team ships."
              body="Drag, drop, assign, priorities, checklists. Or view as list / calendar. All synced live."
            />
            <BoardPreview />
          </Tile>

          {/* Small: AI */}
          <Tile className="md:col-span-2 md:row-span-2">
            <TileHeader
              icon="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
              chip="AI"
              chipHue="from-cyan-400 to-blue-500"
              title="Cleotilda handles the busywork."
              body="Assigns tasks, dedupes duplicates, summarizes threads, drafts replies."
            />
            <AIPreview />
          </Tile>

          {/* Small: DMs */}
          <Tile className="md:col-span-2 md:row-span-2">
            <TileHeader
              icon="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
              chip="DMs"
              chipHue="from-pink-400 to-rose-500"
              title="One inbox across every workspace."
              body="DMs travel with you. Presence, typing and read receipts are all live."
            />
            <DMPreview />
          </Tile>

          {/* Small: Notifications */}
          <Tile className="md:col-span-2 md:row-span-1">
            <TileHeader
              compact
              icon="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"
              chip="Alerts"
              chipHue="from-amber-400 to-orange-500"
              title="Notifications that never lie."
              body="One bell, one truth. Cross-workspace + DM aware."
            />
          </Tile>

          {/* Small: Security */}
          <Tile className="md:col-span-2 md:row-span-1">
            <TileHeader
              compact
              icon="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4"
              chip="Security"
              chipHue="from-violet-500 to-fuchsia-500"
              title="Enterprise-grade by default."
              body="RLS everywhere. SOC-2 aligned. Content moderation on uploads."
            />
          </Tile>
        </div>
      </div>
    </section>
  );
}

// ─── Section head ─────────────────────────────────────────────────────
function SectionHead({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <motion.p
        initial={{ y: 12, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
        className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300"
      >
        {eyebrow}
      </motion.p>
      <motion.h2
        initial={{ y: 20, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ delay: 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="text-balance text-4xl font-extrabold leading-[1.1] tracking-tight text-white md:text-5xl"
      >
        {title}
      </motion.h2>
      <motion.p
        initial={{ y: 20, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ delay: 0.2, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="mt-5 text-lg text-[#b0b0c8]"
      >
        {lead}
      </motion.p>
    </div>
  );
}

// ─── Tile shell ───────────────────────────────────────────────────────
function Tile({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className={`landing-bento group flex flex-col p-6 md:p-7 ${className}`}
    >
      <div className="landing-bento-aurora" aria-hidden />
      <div className="relative z-10 flex h-full flex-col">{children}</div>
    </motion.div>
  );
}

function TileHeader({
  icon,
  chip,
  chipHue,
  title,
  body,
  compact = false,
}: {
  icon: string;
  chip: string;
  chipHue: string;
  title: string;
  body: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "" : "mb-5"}>
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br ${chipHue} shadow-lg`}
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
        <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#9494a8]">
          {chip}
        </span>
      </div>
      <h3
        className={`font-bold leading-tight tracking-tight text-white ${
          compact ? "text-base" : "text-xl md:text-2xl"
        }`}
      >
        {title}
      </h3>
      <p className={`mt-2 text-[#9494a8] ${compact ? "text-xs" : "text-sm"}`}>
        {body}
      </p>
    </div>
  );
}

// ─── Chat preview inside Bento ────────────────────────────────────────
function ChatPreview() {
  const msgs = [
    { from: "Sana", color: "from-pink-400 to-rose-500", text: "Landing draft is ready" },
    { from: "Omar", color: "from-cyan-400 to-blue-500", text: "🔥 shipping tonight" },
    { from: "Zoya", color: "from-amber-400 to-orange-500", text: "Copy checked ✓" },
  ];
  return (
    <div className="mt-auto rounded-2xl border border-white/5 bg-black/30 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="text-[#818cf8]">#</span>
        <span className="font-semibold text-white">design</span>
        <span className="ml-auto flex items-center gap-1 text-[#6d6d82]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          live
        </span>
      </div>
      <div className="space-y-2">
        {msgs.map((m, i) => (
          <motion.div
            key={m.from}
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ delay: 0.1 + i * 0.12, duration: 0.5 }}
            className="flex items-center gap-2"
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-md bg-gradient-to-br text-[10px] font-bold text-white ${m.color}`}
            >
              {m.from[0]}
            </span>
            <span className="text-sm font-semibold text-white">{m.from}</span>
            <span className="truncate text-sm text-[#9494a8]">{m.text}</span>
          </motion.div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-indigo-400 to-violet-500 text-[10px] font-bold text-white">
          T
        </span>
        <span className="typing-dots flex items-center gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6d6d82]" style={{ animationDelay: "0ms" }} />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6d6d82]" style={{ animationDelay: "120ms" }} />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6d6d82]" style={{ animationDelay: "240ms" }} />
        </span>
        <span className="text-xs text-[#6d6d82]">Tanvir is typing…</span>
      </div>
    </div>
  );
}

// ─── Board preview inside Bento ───────────────────────────────────────
function BoardPreview() {
  const cols = [
    { title: "To do", cards: ["Hero copy", "Landing polish"], color: "bg-indigo-500/60" },
    { title: "Doing", cards: ["Auth rewrite"], color: "bg-amber-400/60" },
    { title: "Done", cards: ["Ship v2", "AI tools"], color: "bg-emerald-400/60" },
  ];
  return (
    <div className="mt-auto space-y-2 rounded-2xl border border-white/5 bg-black/30 p-3">
      {cols.map((c, i) => (
        <motion.div
          key={c.title}
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ delay: 0.1 + i * 0.1, duration: 0.5 }}
        >
          <div className="mb-1 flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${c.color}`} />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9494a8]">
              {c.title}
            </span>
            <span className="ml-auto text-[10px] text-[#6d6d82]">
              {c.cards.length}
            </span>
          </div>
          <div className="space-y-1">
            {c.cards.map((card) => (
              <div
                key={card}
                className="flex items-center gap-1.5 rounded-md border border-white/5 bg-white/[0.03] p-1.5"
              >
                <span className="h-1 w-1 rounded-full bg-white/40" />
                <span className="truncate text-[11px] text-white">{card}</span>
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── AI preview ───────────────────────────────────────────────────────
function AIPreview() {
  return (
    <div className="mt-auto rounded-2xl border border-white/5 bg-black/30 p-4">
      <div className="flex items-start gap-2">
        <Image src="/image/taskcycle-ios-appicon-1024.png" alt="Cleotilda" width={32} height={32} className="h-8 w-8 shrink-0 rounded-full shadow-lg shadow-indigo-500/25 ring-1 ring-cyan-300/30" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white">Cleotilda</p>
          <p className="mt-0.5 text-xs text-[#9494a8]">
            Found 3 duplicate tasks in your board. Merge them?
          </p>
          <div className="mt-2 flex gap-1.5">
            <button className="rounded-md bg-white text-[10px] font-semibold text-black px-2 py-1">
              Merge
            </button>
            <button className="rounded-md border border-white/10 bg-white/5 text-[10px] font-semibold text-white px-2 py-1">
              Show me
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DM preview ───────────────────────────────────────────────────────
function DMPreview() {
  const dms = [
    { name: "Sana", color: "from-pink-400 to-rose-500", unread: 2, msg: "Ready for review", online: true },
    { name: "Omar", color: "from-cyan-400 to-blue-500", unread: 0, msg: "You: sent the file", online: true },
    { name: "Zoya", color: "from-amber-400 to-orange-500", unread: 1, msg: "Let me know", online: false },
  ];
  return (
    <div className="mt-auto space-y-1 rounded-2xl border border-white/5 bg-black/30 p-2">
      {dms.map((d, i) => (
        <motion.div
          key={d.name}
          initial={{ opacity: 0, x: -8 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ delay: 0.1 + i * 0.1, duration: 0.5 }}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.04]"
        >
          <span className="relative">
            <span
              className={`grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br text-[10px] font-bold text-white ${d.color}`}
            >
              {d.name[0]}
            </span>
            {d.online && (
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-[#0a0a15]" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">
              {d.name}
            </p>
            <p className="truncate text-[10px] text-[#9494a8]">{d.msg}</p>
          </div>
          {d.unread > 0 && (
            <span className="rounded-full bg-indigo-500 px-1.5 py-0 text-[9px] font-bold text-white">
              {d.unread}
            </span>
          )}
        </motion.div>
      ))}
    </div>
  );
}
