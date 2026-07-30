"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ConversationWithParticipants } from "@/lib/chat-shared";
import { dmCounterpart } from "@/lib/chat-shared";
import type { Channel, Profile } from "@/lib/supabase/types";
import type { ProjectWithMembers } from "@/lib/projects-shared";
import {
  searchWorkspaceText,
  type SearchHit,
  type SearchChannelHit,
  type SearchDmHit,
  type SearchPersonHit,
  type SearchProjectHit,
} from "./search-actions";

// Order results appear in: navigational entities first, content last. The flat
// index used for keyboard nav follows this same order.
function flattenResults(r: {
  channels: SearchHit[];
  dms: SearchHit[];
  people: SearchHit[];
  projects: SearchHit[];
  tasks: SearchHit[];
  messages: SearchHit[];
}): SearchHit[] {
  return [
    ...r.channels,
    ...r.dms,
    ...r.people,
    ...r.projects,
    ...r.tasks,
    ...r.messages,
  ];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Global search living in the top bar. A trigger button opens a Cmd+K command
// palette with debounced live results across messages and tasks.
//
// The client already has channels / conversations / members / projects loaded
// (they drive the sidebar), so those categories filter INSTANTLY in-memory as
// the user types - no server round-trip. Only messages + tasks (the DB text
// searches) hit the server, and each keystroke now does two indexed queries
// instead of five discovery queries plus the text queries.
export function HeaderSearch({
  workspaceId,
  userId,
  channels,
  conversations,
  members,
  projects,
  dmContacts,
}: {
  workspaceId: string;
  userId: string;
  channels: Channel[];
  conversations: ConversationWithParticipants[];
  members: Profile[];
  projects: ProjectWithMembers[];
  dmContacts: Profile[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against out-of-order responses: only the latest query may commit.
  const reqIdRef = useRef(0);

  // Local filter data - fixed for the session (same as sidebar), so filtering
  // is a one-pass array walk in JS. Cheap even with hundreds of items.
  const contactIds = useMemo(
    () => new Set(dmContacts.map((p) => p.id)),
    [dmContacts],
  );
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);
  const channelNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of channels) m[c.id] = c.name;
    return m;
  }, [channels]);

  // Cmd/Ctrl+K opens the palette from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset + focus on open.
  useEffect(() => {
    if (open) {
      setQuery("");
      setHits([]);
      setActiveIdx(0);
      // Focus after paint so the input is mounted.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced live search. Local matches (channels / DMs / people / projects)
  // paint IMMEDIATELY on every keystroke - no round-trip - and the server
  // action only runs the two DB text searches (messages, tasks) in
  // parallel. Result: the palette feels instant for navigation, and content
  // hits stream in a few tens of ms later.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      return;
    }
    const lowerQ = q.toLowerCase();

    const channelHits: SearchChannelHit[] = channels
      .filter(
        (c) =>
          c.name.toLowerCase().includes(lowerQ) ||
          (c.description?.toLowerCase().includes(lowerQ) ?? false),
      )
      .slice(0, 8)
      .map((c) => ({
        kind: "channel",
        id: c.id,
        name: c.name,
        subtitle: c.description || "Group",
        href: `/w/${workspaceId}/c/${c.id}`,
      }));

    const dmHits: SearchDmHit[] = conversations
      .map((conv) => {
        if (conv.is_group) {
          const names = conv.conversation_participants
            .map(
              (p) => p.profiles?.full_name ?? p.profiles?.email ?? "",
            )
            .filter(Boolean);
          return { conv, label: names.join(", "), subtitle: "Group message" };
        }
        const other = dmCounterpart(conv, userId);
        if (other && other.id !== userId && !contactIds.has(other.id)) {
          return null;
        }
        const label = other?.full_name ?? other?.email ?? "Direct message";
        return { conv, label, subtitle: "Direct message" };
      })
      .filter((hit): hit is NonNullable<typeof hit> => hit !== null)
      .filter(({ label }) => label.toLowerCase().includes(lowerQ))
      .slice(0, 8)
      .map(({ conv, label, subtitle }) => ({
        kind: "dm",
        id: conv.id,
        name: label,
        subtitle,
        href: `/w/${workspaceId}/dm/${conv.id}`,
      }));

    const peopleHits: SearchPersonHit[] = members
      .filter(
        (p) =>
          (p.full_name?.toLowerCase().includes(lowerQ) ?? false) ||
          p.email.toLowerCase().includes(lowerQ) ||
          (p.title?.toLowerCase().includes(lowerQ) ?? false),
      )
      .slice(0, 8)
      .map((p) => ({
        kind: "person",
        id: p.id,
        name: p.full_name ?? p.email,
        subtitle: p.title || p.email,
        href: `/w/${workspaceId}/settings/members`,
      }));

    const projectHits: SearchProjectHit[] = projects
      .filter(
        (p) =>
          p.name.toLowerCase().includes(lowerQ) ||
          (p.description?.toLowerCase().includes(lowerQ) ?? false),
      )
      .slice(0, 8)
      .map((p) => ({
        kind: "project",
        id: p.id,
        name: p.name,
        subtitle: p.description || "Project",
        href: `/w/${workspaceId}/projects/${p.id}`,
      }));

    const localHits: SearchHit[] = [
      ...channelHits,
      ...dmHits,
      ...peopleHits,
      ...projectHits,
    ];

    // Paint local matches right away.
    setHits(localHits);
    setActiveIdx(0);

    // Anything below the trigram threshold has no DB path to run.
    if (q.length < 2) return;

    const reqId = ++reqIdRef.current;
    const t = setTimeout(() => {
      startTransition(async () => {
        const results = await searchWorkspaceText(
          workspaceId,
          q,
          projectIds,
          channelNameById,
        );
        if (reqId !== reqIdRef.current) return;
        setHits(flattenResults({ ...results,
          channels: channelHits,
          dms: dmHits,
          people: peopleHits,
          projects: projectHits,
        }));
      });
    }, 140);
    return () => clearTimeout(t);
  }, [
    query,
    open,
    workspaceId,
    userId,
    channels,
    conversations,
    members,
    projects,
    contactIds,
    projectIds,
    channelNameById,
  ]);

  const go = useMemo(
    () => (hit: SearchHit) => {
      setOpen(false);
      router.push(hit.href);
    },
    [router],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[activeIdx];
      if (hit) go(hit);
      else if (query.trim().length >= 1) {
        setOpen(false);
        router.push(
          `/w/${workspaceId}/search?q=${encodeURIComponent(query.trim())}`,
        );
      }
    }
  }

  const q = query.trim();
  const showEmpty = q.length >= 1 && !pending && hits.length === 0;

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Search"
        title="Search (⌘K)"
        className="group grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface text-muted transition-all duration-150 hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
      >
        <svg
          className="h-4.5 w-4.5 transition-transform duration-150 group-hover:scale-110"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-80 flex animate-fade-in justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="h-fit w-full max-w-xl origin-top animate-scale-in overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-2xl shadow-black/50 ring-1 ring-black/5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Input row */}
            <div className="flex items-center gap-3 px-4 pt-4">
              <div
                className="flex flex-1 items-center gap-2.5 rounded-xl border border-border bg-surface-2/60 px-3.5 transition-colors focus-within:border-primary/60 focus-within:bg-surface"
                style={{
                  boxShadow:
                    "0 0 0 3px color-mix(in srgb, var(--primary) 0%, transparent)",
                }}
              >
                <svg
                  className={`h-4.5 w-4.5 shrink-0 ${
                    pending ? "animate-spin-fast text-primary" : "text-muted"
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {pending ? (
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  ) : (
                    <>
                      <circle cx="11" cy="11" r="7" />
                      <path d="M21 21l-4.35-4.35" />
                    </>
                  )}
                </svg>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search groups, people, boards, tasks, messages…"
                  style={{ outline: "none", boxShadow: "none" }}
                  className="w-full border-0 bg-transparent py-3 text-sm text-foreground placeholder:text-muted"
                />
                {query && (
                  <button
                    onClick={() => {
                      setQuery("");
                      inputRef.current?.focus();
                    }}
                    aria-label="Clear"
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <kbd className="hidden shrink-0 rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-[10px] font-medium text-muted sm:block">
                Esc
              </kbd>
            </div>

            {/* Results */}
            <div className="mt-2 max-h-[52vh] overflow-y-auto px-2 pb-2">
              {q.length < 1 && (
                <div className="flex flex-col items-center gap-3 px-3 py-10 text-center">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-muted">
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="M21 21l-4.35-4.35" />
                    </svg>
                  </span>
                  <p className="text-sm text-muted">
                    Search groups, people, boards, tasks, and messages
                  </p>
                </div>
              )}
              {showEmpty && (
                <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
                  <p className="text-sm font-medium text-foreground">
                    No results
                  </p>
                  <p className="text-xs text-muted">
                    Nothing matched &ldquo;{q}&rdquo;.
                  </p>
                </div>
              )}
              {hits.length > 0 && (
                <SectionedResults
                  hits={hits}
                  activeIdx={activeIdx}
                  onHover={setActiveIdx}
                  onSelect={go}
                />
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center justify-between border-t border-border bg-surface-2/40 px-4 py-2 text-[11px] text-muted">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono">
                    ↑↓
                  </kbd>
                  navigate
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono">
                    ↵
                  </kbd>
                  open
                </span>
              </div>
              {hits.length > 0 && (
                <span className="tabular-nums">
                  {hits.length} result{hits.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Renders hits grouped under Tasks / Messages headers while preserving the flat
// index used by keyboard navigation (hits arrive as [...tasks, ...messages]).
function SectionedResults({
  hits,
  activeIdx,
  onHover,
  onSelect,
}: {
  hits: SearchHit[];
  activeIdx: number;
  onHover: (i: number) => void;
  onSelect: (hit: SearchHit) => void;
}) {
  const groups: { label: string; kind: SearchHit["kind"] }[] = [
    { label: "Groups", kind: "channel" },
    { label: "Direct messages", kind: "dm" },
    { label: "People", kind: "person" },
    { label: "Boards", kind: "project" },
    { label: "Tasks", kind: "task" },
    { label: "Messages", kind: "message" },
  ];

  return (
    <>
      {groups.map(({ label, kind }) => {
        const rows = hits
          .map((hit, i) => ({ hit, i }))
          .filter(({ hit }) => hit.kind === kind);
        if (rows.length === 0) return null;
        return (
          <div key={kind} className="mb-1">
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted/70">
              {label}
            </p>
            {rows.map(({ hit, i }) => {
              const active = i === activeIdx;
              return (
                <button
                  key={`${hit.kind}-${hit.id}`}
                  onClick={() => onSelect(hit)}
                  onMouseEnter={() => onHover(i)}
                  className={`group/row flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    active ? "bg-primary/10" : "hover:bg-surface-2"
                  }`}
                >
                  <RowContent hit={hit} />
                  <svg
                    className={`h-4 w-4 shrink-0 text-primary transition-opacity ${
                      active ? "opacity-100" : "opacity-0"
                    }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

// SVG path data per hit kind - a distinct glyph so each result type reads at a
// glance (group, chat bubble, person, folder, checkbox, message).
const ICONS: Record<SearchHit["kind"], string> = {
  channel:
    "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  dm: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
  person:
    "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  project:
    "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
  task: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  message: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
};

function RowContent({ hit }: { hit: SearchHit }) {
  const accent = hit.kind === "task" || hit.kind === "channel";
  let title: string;
  let subtitle: string;
  if (hit.kind === "task") {
    title = hit.title;
    subtitle = `Task in ${hit.projectName}`;
  } else if (hit.kind === "message") {
    title = hit.body;
    subtitle = `${hit.authorName} in ${hit.where} · ${timeAgo(hit.createdAt)}`;
  } else {
    title = hit.name;
    subtitle = hit.subtitle;
  }

  return (
    <>
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
          accent ? "bg-primary/10 text-primary" : "bg-surface-2 text-muted"
        }`}
      >
        <svg
          className="h-4.5 w-4.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={ICONS[hit.kind]} />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {title}
        </span>
        <span className="block truncate text-xs text-muted">{subtitle}</span>
      </span>
    </>
  );
}
