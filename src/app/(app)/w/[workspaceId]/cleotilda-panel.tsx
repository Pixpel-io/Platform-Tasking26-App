"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { askCleotilda } from "./cleotilda-actions";

type PanelMessage = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What can you do?",
  "List our projects",
  "Create a task for me",
];

const LOGO = "/image/taskcycle-ios-appicon-1024.png";
const BTN = 52; // launcher size in px
const MARGIN = 8; // minimum gap from viewport edges
const PANEL_W = 400;
const PANEL_H = 560;

function CleotildaLogo({ size, className = "" }: { size: number; className?: string }) {
  return (
    <Image
      src={LOGO}
      alt="Cleotilda"
      width={size}
      height={size}
      draggable={false}
      className={`rounded-full ${className}`.trim()}
    />
  );
}

// Floating Cleotilda assistant: the app-logo launcher can be dragged anywhere
// on screen (position persists per browser); a short press opens the chatbot
// panel, which anchors itself to whichever corner the button lives in.
export function CleotildaPanel({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const storageKey = `cleotilda:${workspaceId}`;

  // ── Draggable launcher ──────────────────────────────────────────────
  // Position is the button's top-left corner. Null until mounted (default
  // bottom-right), so SSR renders nothing position-dependent.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;
  const dragState = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const clamp = useCallback((x: number, y: number) => {
    const maxX = window.innerWidth - BTN - MARGIN;
    const maxY = window.innerHeight - BTN - MARGIN;
    return {
      x: Math.min(Math.max(x, MARGIN), maxX),
      y: Math.min(Math.max(y, MARGIN), maxY),
    };
  }, []);

  // Initial position: saved spot or bottom-right corner.
  useEffect(() => {
    let initial = {
      x: window.innerWidth - BTN - 20,
      y: window.innerHeight - BTN - 20,
    };
    try {
      const raw = localStorage.getItem("cleotilda:pos");
      if (raw) {
        const saved = JSON.parse(raw) as { x: number; y: number };
        if (typeof saved.x === "number" && typeof saved.y === "number") {
          initial = saved;
        }
      }
    } catch {
      // ignore
    }
    setPos(clamp(initial.x, initial.y));

    const onResize = () => {
      const cur = posRef.current;
      if (cur) setPos(clamp(cur.x, cur.y));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!pos) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
      moved: false,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragState.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 5) return; // dead zone: still a click
    d.moved = true;
    setPos(clamp(d.originX + dx, d.originY + dy));
  }

  function onPointerUp() {
    const d = dragState.current;
    dragState.current = null;
    if (!d) return;
    if (d.moved) {
      // Drag: persist, don't toggle the panel.
      try {
        const cur = posRef.current;
        if (cur) localStorage.setItem("cleotilda:pos", JSON.stringify(cur));
      } catch {
        // ignore
      }
    } else {
      setOpen((o) => !o);
    }
  }

  // Panel anchors to the button, flipping to whichever side has room.
  function panelStyle(): React.CSSProperties {
    if (!pos) return { bottom: 84, right: 20 };
    const w = Math.min(PANEL_W, window.innerWidth - 2 * MARGIN);
    const h = Math.min(PANEL_H, window.innerHeight - 2 * MARGIN);
    const openLeft = pos.x + BTN / 2 > window.innerWidth / 2;
    const openUp = pos.y + BTN / 2 > window.innerHeight / 2;
    const x = openLeft ? pos.x + BTN - w : pos.x;
    const y = openUp ? pos.y - h - 10 : pos.y + BTN + 10;
    return {
      left: Math.min(Math.max(x, MARGIN), window.innerWidth - w - MARGIN),
      top: Math.min(Math.max(y, MARGIN), window.innerHeight - h - MARGIN),
      width: w,
      height: h,
    };
  }

  // ── Conversation persistence ────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setMessages(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages.slice(-40)));
    } catch {
      // ignore
    }
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, storageKey]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [open]);

  async function send(text?: string) {
    const content = (text ?? draft).trim();
    if (!content || thinking) return;
    setDraft("");
    setError(null);
    const next: PanelMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setThinking(true);
    try {
      const res = await askCleotilda(workspaceId, next);
      if (res.error) setError(res.error);
      else if (res.reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: res.reply! }]);
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  }

  if (!pos) return null;

  return (
    <>
      {/* Draggable launcher */}
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label={open ? "Close Cleotilda" : "Ask Cleotilda"}
        title="Ask Cleotilda (drag to move)"
        style={{ left: pos.x, top: pos.y, width: BTN, height: BTN, touchAction: "none" }}
        className={`fixed z-40 grid cursor-grab place-items-center rounded-full shadow-lg ring-2 transition-shadow active:cursor-grabbing ${
          open
            ? "ring-primary/60 shadow-primary/30"
            : "ring-primary/30 shadow-black/30 hover:ring-primary/60 hover:shadow-primary/30"
        }`}
      >
        <CleotildaLogo size={BTN} className="pointer-events-none select-none" />
        {/* online dot */}
        <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-success" />
      </button>

      {/* Panel */}
      {open && (
        <div
          style={panelStyle()}
          className="fixed z-40 flex animate-scale-in flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/30"
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-border bg-linear-to-r from-primary/10 to-transparent px-4 py-3">
            <CleotildaLogo size={36} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Cleotilda</p>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                AI assistant
              </p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => {
                  setMessages([]);
                  setError(null);
                  try {
                    sessionStorage.removeItem(storageKey);
                  } catch {
                    // ignore
                  }
                }}
                title="Clear conversation"
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              title="Close"
              className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <CleotildaLogo size={48} className="mb-3" />
                <p className="text-sm font-semibold text-foreground">
                  Hi, I&apos;m Cleotilda
                </p>
                <p className="mt-1 max-w-60 text-xs text-muted">
                  I can create tasks, send DMs, look up projects and members,
                  and answer questions about your workspace.
                </p>
                <div className="mt-4 flex flex-col gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => void send(s)}
                      className="cursor-pointer rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md border border-border bg-background text-foreground"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {thinking && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-background px-3.5 py-2.5">
                  {[0, 150, 300].map((d) => (
                    <span
                      key={d}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted"
                      style={{ animationDelay: `${d}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-border p-3">
            <div className="flex items-center gap-2">
              <div className="flex min-h-10 flex-1 items-center rounded-xl border border-border bg-background px-3">
                <textarea
                  ref={inputRef}
                  value={draft}
                  rows={1}
                  placeholder="Ask Cleotilda..."
                  onChange={(e) => {
                    setDraft(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  className="no-focus-ring max-h-24 w-full resize-none bg-transparent py-2.5 text-sm leading-5 text-foreground outline-none placeholder:text-muted"
                />
              </div>
              <button
                onClick={() => void send()}
                disabled={!draft.trim() || thinking}
                aria-label="Send"
                className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl bg-primary text-primary-foreground transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
