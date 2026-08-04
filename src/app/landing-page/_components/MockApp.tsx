"use client";

import { motion } from "motion/react";
import Image from "next/image";

const CHANNELS = [
  { name: "general", unread: 0 },
  { name: "design", unread: 3, active: true },
  { name: "engineering", unread: 12 },
  { name: "marketing", unread: 0 },
  { name: "product", unread: 2 },
];

const DMS = [
  { name: "Sana Rehman", online: true, color: "from-pink-400 to-rose-500" },
  { name: "Omar Sheikh", online: true, color: "from-cyan-400 to-blue-500" },
  { name: "Zoya Malik", online: false, color: "from-amber-400 to-orange-500" },
];

const MESSAGES = [
  {
    name: "Sana Rehman",
    time: "10:24",
    color: "from-pink-400 to-rose-500",
    text: "Kicked off the v2 landing draft. Sharing here first before the review.",
  },
  {
    name: "Omar Sheikh",
    time: "10:26",
    color: "from-cyan-400 to-blue-500",
    text: "Looks tight. Can we make the hero copy a bit punchier?",
    reaction: { emoji: "🔥", count: 3 },
  },
  {
    name: "Cleotilda",
    time: "10:27",
    color: "from-indigo-400 to-violet-500",
    isBot: true,
    text: "I&apos;ve drafted three headline variants and dropped them in the doc. Want me to A/B test them?",
  },
];

const KANBAN = [
  {
    title: "In progress",
    color: "from-amber-400 to-orange-500",
    cards: [
      { title: "Hero copy polish", tag: "Design", by: "S" },
      { title: "Mobile menu behaviour", tag: "Eng", by: "O" },
    ],
  },
  {
    title: "Review",
    color: "from-indigo-400 to-violet-500",
    cards: [
      { title: "Auth flow rewrite", tag: "Eng", by: "Z" },
    ],
  },
  {
    title: "Done",
    color: "from-emerald-400 to-teal-500",
    cards: [
      { title: "Ship v2 landing", tag: "Design", by: "S" },
      { title: "Cleotilda tools", tag: "AI", by: "AI" },
    ],
  },
];

export function MockApp() {
  return (
    <div className="landing-mock-window">
      {/* Traffic lights bar */}
      <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.02] px-4 py-3">
        <span className="landing-dot-r" />
        <span className="landing-dot-y" />
        <span className="landing-dot-g" />
        <span className="ml-3 text-xs text-[#6d6d82]">
          taskinglife.io / acme workspace
        </span>
      </div>

      <div className="grid grid-cols-12 min-h-[560px]">
        {/* Sidebar */}
        <aside className="col-span-3 hidden border-r border-white/5 bg-white/[0.015] p-3 md:block">
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] p-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white">
              A
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">Acme</p>
              <p className="truncate text-[10px] text-[#6d6d82]">12 members</p>
            </div>
          </div>

          <SidebarSection title="Channels">
            {CHANNELS.map((c) => (
              <SidebarItem
                key={c.name}
                icon="#"
                label={c.name}
                active={c.active}
                badge={c.unread || undefined}
              />
            ))}
          </SidebarSection>

          <SidebarSection title="Direct messages">
            {DMS.map((d) => (
              <SidebarItem
                key={d.name}
                avatar={{ initial: d.name[0], color: d.color, online: d.online }}
                label={d.name.split(" ")[0]}
              />
            ))}
          </SidebarSection>
        </aside>

        {/* Main pane */}
        <main className="col-span-12 flex min-h-[560px] flex-col md:col-span-9">
          {/* Channel header */}
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
            <div className="flex items-center gap-2 text-white">
              <span className="text-lg text-[#818cf8]">#</span>
              <span className="font-semibold">design</span>
              <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-[#9494a8]">
                8 members
              </span>
            </div>
            <div className="flex items-center gap-1.5">
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

          {/* Messages */}
          <div className="flex-1 space-y-4 overflow-hidden px-5 py-4">
            {MESSAGES.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.4 + i * 0.15, duration: 0.5 }}
                className="flex gap-3"
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${m.color} text-xs font-bold text-white shadow-md`}
                >
                  {m.isBot ? (
                    <Image src="/image/taskcycle-ios-appicon-1024.png" alt="Cleotilda" width={32} height={32} className="h-8 w-8 rounded-full" />
                  ) : (
                    m.name[0]
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-white">
                      {m.name}
                    </span>
                    {m.isBot && (
                      <span className="rounded-md bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-300">
                        AI
                      </span>
                    )}
                    <span className="text-[11px] text-[#6d6d82]">{m.time}</span>
                  </div>
                  <p
                    className="mt-0.5 text-sm text-[#cfcff0]"
                    dangerouslySetInnerHTML={{ __html: m.text }}
                  />
                  {m.reaction && (
                    <button className="mt-2 inline-flex items-center gap-1 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2 py-0.5 text-xs">
                      <span>{m.reaction.emoji}</span>
                      <span className="font-semibold text-indigo-200">
                        {m.reaction.count}
                      </span>
                    </button>
                  )}
                </div>
              </motion.div>
            ))}

            {/* Kanban embed */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2, duration: 0.6 }}
              className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-3"
            >
              <div className="mb-3 flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-indigo-300" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 3v18M15 3v18" />
                </svg>
                <p className="text-sm font-semibold text-white">
                  Board · v2 landing
                </p>
                <span className="ml-auto text-[11px] text-[#6d6d82]">
                  5 tasks
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {KANBAN.map((col) => (
                  <div key={col.title} className="min-w-0">
                    <div className="mb-2 flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 rounded-full bg-gradient-to-br ${col.color}`}
                      />
                      <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-[#9494a8]">
                        {col.title}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      {col.cards.map((c) => (
                        <div
                          key={c.title}
                          className="rounded-md border border-white/5 bg-white/[0.04] p-2"
                        >
                          <p className="truncate text-[11px] font-medium text-white">
                            {c.title}
                          </p>
                          <div className="mt-1 flex items-center justify-between gap-1">
                            <span className="rounded-sm bg-white/5 px-1 py-0.5 text-[9px] text-[#9494a8]">
                              {c.tag}
                            </span>
                            <span className="grid h-4 w-4 place-items-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 text-[8px] font-bold text-white">
                              {c.by}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Composer */}
          <div className="border-t border-white/5 p-3">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#6d6d82]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span className="flex-1 text-sm text-[#6d6d82]">
                Message #design
              </span>
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#9494a8]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4l3 3 3-3h4a2 2 0 0 0 2-2z" />
              </svg>
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-[#6d6d82]">
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarItem({
  icon,
  avatar,
  label,
  active,
  badge,
}: {
  icon?: string;
  avatar?: { initial: string; color: string; online: boolean };
  label: string;
  active?: boolean;
  badge?: number;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
        active
          ? "bg-indigo-500/15 text-white"
          : "text-[#9494a8] hover:bg-white/[0.03]"
      }`}
    >
      {icon && (
        <span
          className={`w-4 text-center text-[13px] ${
            active ? "text-indigo-300" : "text-[#6d6d82]"
          }`}
        >
          {icon}
        </span>
      )}
      {avatar && (
        <span className="relative">
          <span
            className={`grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br text-[10px] font-bold text-white ${avatar.color}`}
          >
            {avatar.initial}
          </span>
          {avatar.online && (
            <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-1 ring-[#10101c]" />
          )}
        </span>
      )}
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && (
        <span className="rounded-full bg-white/10 px-1.5 py-0 text-[10px] font-semibold text-white">
          {badge}
        </span>
      )}
    </div>
  );
}
