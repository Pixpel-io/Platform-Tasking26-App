"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui";
import { buildReplySnippet, type MessageWithRelations } from "@/lib/chat-shared";
import {
  forwardMessage,
  listForwardTargets,
  type ForwardTarget,
} from "../chat-actions";

// Slack-style "forward this message" picker: search a combined list of the
// channels + DMs you can post to, pick one, and re-post the message (text +
// attachments) there. Styled to match StatusDialog / other app dialogs.
export function ForwardDialog({
  message,
  workspaceId,
  onClose,
}: {
  message: MessageWithRelations;
  // The workspace the forward was triggered from - scopes the channel list.
  // Null on the global /dm shell (DMs only).
  workspaceId: string | null;
  onClose: () => void;
}) {
  const [targets, setTargets] = useState<{
    channels: ForwardTarget[];
    conversations: ForwardTarget[];
  } | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ForwardTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void listForwardTargets(workspaceId).then((t) => {
      if (!cancelled) setTargets(t);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    if (!targets) return { channels: [], conversations: [] };
    const q = query.trim().toLowerCase();
    if (!q) return targets;
    return {
      channels: targets.channels.filter((c) => c.name.toLowerCase().includes(q)),
      conversations: targets.conversations.filter((c) =>
        c.name.toLowerCase().includes(q),
      ),
    };
  }, [targets, query]);

  function submit() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const res = await forwardMessage({
        messageId: message.id,
        toChannelId: selected.kind === "channel" ? selected.id : undefined,
        toConversationId:
          selected.kind === "conversation" ? selected.id : undefined,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setDone(true);
      setTimeout(onClose, 900);
    });
  }

  const empty =
    targets &&
    filtered.channels.length === 0 &&
    filtered.conversations.length === 0;
  const preview = buildReplySnippet(message);

  return createPortal(
    <div
      className="fixed inset-0 z-100 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-border bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Forward message
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Preview of what's being forwarded */}
        <div className="mt-3 flex items-center gap-1.5 rounded-lg border-l-2 border-l-primary bg-surface-2/50 py-1 pl-2 pr-2 text-xs text-muted">
          <span className="truncate">{preview}</span>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search channels and people…"
          autoFocus
          className="mt-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {!targets ? (
            <p className="py-6 text-center text-sm text-muted">Loading…</p>
          ) : empty ? (
            <p className="py-6 text-center text-sm text-muted">
              No matches found.
            </p>
          ) : (
            <>
              {filtered.channels.length > 0 && (
                <Section label="Channels">
                  {filtered.channels.map((t) => (
                    <TargetRow
                      key={t.id}
                      target={t}
                      selected={selected?.id === t.id}
                      onSelect={() => setSelected(t)}
                    />
                  ))}
                </Section>
              )}
              {filtered.conversations.length > 0 && (
                <Section label="Direct messages">
                  {filtered.conversations.map((t) => (
                    <TargetRow
                      key={t.id}
                      target={t}
                      selected={selected?.id === t.id}
                      onSelect={() => setSelected(t)}
                    />
                  ))}
                </Section>
              )}
            </>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!selected || pending || done}
            onClick={submit}
          >
            {done ? "Forwarded ✓" : pending ? "Forwarding…" : "Forward"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function TargetRow({
  target,
  selected,
  onSelect,
}: {
  target: ForwardTarget;
  selected: boolean;
  onSelect: () => void;
}) {
  const isChannel = target.kind === "channel";
  return (
    <button
      onClick={onSelect}
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
        selected
          ? "bg-primary/10 text-foreground ring-1 ring-inset ring-primary/30"
          : "text-foreground hover:bg-surface-2"
      }`}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
        {isChannel ? (
          <span className="text-sm font-semibold">#</span>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">{target.name}</span>
      {selected && (
        <svg className="h-4 w-4 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </button>
  );
}
