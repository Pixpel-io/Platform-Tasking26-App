"use client";

import { useEffect, useState, useTransition } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  disconnectTelegram,
  generateTelegramLinkCode,
  getTelegramStatus,
  setTelegramPreference,
} from "./notifications-actions";

// The subset of the row this component actually renders. Kept narrow so the
// server page doesn't over-fetch.
export type TelegramConnection = {
  external_id: string | null;
  link_code: string | null;
  link_code_expires_at: string | null;
  verified_at: string | null;
  mentions_enabled: boolean;
  dms_enabled: boolean;
  group_messages_enabled: boolean;
  task_events_enabled: boolean;
  last_sent_at: string | null;
};

export function TelegramConnectionCard({
  workspaceId,
  botUsername,
  connection: initialConnection,
}: {
  workspaceId: string;
  botUsername: string;
  connection: TelegramConnection | null;
}) {
  // The card owns the full connection state so it can transition
  // "code shown -> Connected" the moment the bot receives /start CODE,
  // without waiting for a manual page refresh.
  const [connection, setConnection] = useState<TelegramConnection | null>(
    initialConnection,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const code = connection && !connection.verified_at ? connection.link_code : null;
  const expiresAt = connection?.link_code_expires_at ?? null;
  const verified = Boolean(connection?.verified_at);
  const botMissing = !botUsername;

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  // Auto-poll while a code is pending. The moment the bot receives /start
  // CODE (or a bare code), verified_at is set server-side and this loop
  // pulls the fresh row - the render then flips to the Connected view.
  useEffect(() => {
    if (verified) return;
    if (!connection?.link_code) return;
    let cancelled = false;
    const tick = async () => {
      if (document.hidden) return;
      if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
        setConnection((prev) => prev ? { ...prev, link_code: null, link_code_expires_at: null } : prev);
        setError("That link code expired. Generate a new one to continue.");
        return;
      }
      try {
        const next = await getTelegramStatus();
        if (cancelled) return;
        if (next) setConnection({
          external_id: next.externalId,
          link_code: next.linkCode,
          link_code_expires_at: next.linkCodeExpiresAt,
          verified_at: next.verifiedAt,
          mentions_enabled: next.mentionsEnabled,
          dms_enabled: next.dmsEnabled,
          group_messages_enabled: next.groupMessagesEnabled,
          task_events_enabled: next.taskEventsEnabled,
          last_sent_at: next.lastSentAt,
        });
      } catch {
        if (!cancelled) setError("Could not check Telegram status. We’ll retry automatically.");
      }
    };
    void tick();
    const id = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [verified, connection?.link_code, expiresAt]);

  function generate() {
    setError(null);
    start(async () => {
      const res = await generateTelegramLinkCode(Boolean(code));
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      if ("code" in res) {
        setConnection((prev) => ({
          external_id: prev?.external_id ?? null,
          link_code: res.code,
          link_code_expires_at: res.expiresAt,
          verified_at: null,
          mentions_enabled: prev?.mentions_enabled ?? true,
          dms_enabled: prev?.dms_enabled ?? true,
          group_messages_enabled: prev?.group_messages_enabled ?? true,
          task_events_enabled: prev?.task_events_enabled ?? false,
          last_sent_at: prev?.last_sent_at ?? null,
        }));
      }
    });
  }

  function disconnect() {
    setError(null);
    start(async () => {
      const res = await disconnectTelegram(workspaceId);
      if (res.error) setError(res.error);
      else setConnection(null);
    });
  }

  function togglePref(
    key:
      | "mentions_enabled"
      | "dms_enabled"
      | "group_messages_enabled"
      | "task_events_enabled",
    value: boolean,
  ) {
    setError(null);
    // Optimistic update - the toggle flips immediately, no waiting for
    // the round-trip.
    setConnection((prev) => (prev ? { ...prev, [key]: value } : prev));
    start(async () => {
      const res = await setTelegramPreference(workspaceId, key, value);
      if (res.error) {
        setError(res.error);
        // Roll back on failure.
        setConnection((prev) => (prev ? { ...prev, [key]: !value } : prev));
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-sky-500 to-cyan-400 text-white shadow-md shadow-sky-500/30">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="currentColor"
          >
            <path d="M9.03 15.5 8.9 19.1c.44 0 .63-.2.86-.43l2.06-1.97 4.27 3.13c.78.43 1.34.2 1.55-.72l2.82-13.2h.01c.25-1.15-.42-1.6-1.18-1.31L2.9 10.05c-1.13.44-1.11 1.08-.19 1.36l4.28 1.34 9.94-6.26c.47-.31.9-.14.55.17z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-foreground">Telegram</h2>
          <p className="text-sm text-muted">
            {verified
              ? "Notifications are forwarding to your Telegram."
              : "Connect your Telegram to receive Tasking notifications there."}
          </p>
        </div>
        {verified && (
          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">
            Connected
          </span>
        )}
      </div>

      {botMissing && (
        <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
          Set <code className="font-mono">NEXT_PUBLIC_TELEGRAM_BOT_USERNAME</code>{" "}
          in the environment so the connect button opens the right bot.
        </div>
      )}

      {!verified && (
        <div className="space-y-3">
          {code ? (
            <div className="space-y-4 rounded-xl border border-border bg-surface-2 p-5">
              {/* Big code display - front and centre so users see it without */}
              {/* hunting through collapsibles. Copy button lives beside it.  */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Your link code
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-center font-mono text-lg font-bold tracking-widest text-foreground">
                    {code}
                  </code>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(code);
                      setCopied(true);
                    }}
                    className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/30 transition-colors hover:opacity-90"
                  >
                    {copied ? "Copied!" : "Copy code"}
                  </button>
                </div>
              </div>

              {/* Two clear paths side by side - pick whichever you have handy */}
              <div className="grid gap-3 sm:grid-cols-2">
                {/* Path A: this device - one-click into desktop Telegram */}
                <a
                  href={
                    botUsername
                      ? `https://t.me/${botUsername}?start=${encodeURIComponent(code)}`
                      : "#"
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={botMissing}
                  className={`flex items-center gap-3 rounded-lg border border-border bg-background/50 p-3 transition-all hover:border-primary/30 hover:bg-primary/5 ${
                    botMissing ? "pointer-events-none opacity-50" : ""
                  }`}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-linear-to-br from-sky-500 to-cyan-400 text-white shadow-md">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                      <path d="M9.03 15.5 8.9 19.1c.44 0 .63-.2.86-.43l2.06-1.97 4.27 3.13c.78.43 1.34.2 1.55-.72l2.82-13.2h.01c.25-1.15-.42-1.6-1.18-1.31L2.9 10.05c-1.13.44-1.11 1.08-.19 1.36l4.28 1.34 9.94-6.26c.47-.31.9-.14.55.17z" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-semibold text-foreground">
                      Open Telegram here
                    </p>
                    <p className="text-xs text-muted">
                      Desktop / web — one click, code auto-fills.
                    </p>
                  </div>
                </a>

                {/* Path B: on your phone - QR */}
                <div className="flex items-center gap-3 rounded-lg border border-border bg-background/50 p-3">
                  <div className="rounded-md bg-white p-1.5">
                    <QRCodeSVG
                      value={
                        botUsername
                          ? `https://t.me/${botUsername}?start=${encodeURIComponent(code)}`
                          : `tg://start?token=${encodeURIComponent(code)}`
                      }
                      size={72}
                      level="M"
                      marginSize={0}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      Scan on phone
                    </p>
                    <p className="text-xs text-muted">
                      Point your phone camera at the QR.
                    </p>
                  </div>
                </div>
              </div>

              {/* Explicit "if all else fails" note - covers users who ended */}
              {/* up in the bot chat without the code getting through.       */}
              <div className="rounded-lg border border-border bg-background/40 p-3 text-xs text-muted">
                <b className="text-foreground">Stuck?</b> Open{" "}
                <a
                  href={botUsername ? `https://t.me/${botUsername}` : "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                >
                  @{botUsername}
                </a>{" "}
                in Telegram and send the code above as a plain message. That
                works too.
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/6 px-3 py-2 text-xs">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
                  <span className="relative h-2 w-2 rounded-full bg-primary" />
                </span>
                <span className="text-foreground">
                  Waiting for you to send the code in Telegram...
                </span>
                {expiresAt && (
                  <span className="ml-auto text-muted">
                    Expires{" "}
                    {new Date(expiresAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
            </div>
          ) : null}

          <div className="flex gap-2">
            <button
              onClick={generate}
              disabled={pending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/30 transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {code ? "Regenerate code" : "Generate link code"}
            </button>
          </div>
        </div>
      )}

      {verified && connection && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Connected account: <span className="font-mono">••••{connection.external_id?.slice(-4)}</span>
            {connection.last_sent_at && (
              <>
                {" "}
                · Last delivery{" "}
                {new Date(connection.last_sent_at).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </>
            )}
          </p>

          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Forward these categories
            </p>
            <div className="space-y-2">
              <Toggle
                label="Mentions"
                hint="When someone @-mentions you in any channel or thread."
                enabled={connection.mentions_enabled}
                onChange={(v) => togglePref("mentions_enabled", v)}
                disabled={pending}
              />
              <Toggle
                label="Direct messages"
                hint="One-to-one messages, from any workspace."
                enabled={connection.dms_enabled}
                onChange={(v) => togglePref("dms_enabled", v)}
                disabled={pending}
              />
              <Toggle
                label="Group messages"
                hint="Every message posted in channels you belong to. Turn this off if your channels are busy."
                enabled={connection.group_messages_enabled}
                onChange={(v) => togglePref("group_messages_enabled", v)}
                disabled={pending}
              />
              <Toggle
                label="Task events"
                hint="Assignments, status changes, comments on your tasks."
                enabled={connection.task_events_enabled}
                onChange={(v) => togglePref("task_events_enabled", v)}
                disabled={pending}
              />
            </div>
          </div>

          <button
            onClick={() => setConfirmDisconnect(true)}
            disabled={pending}
            className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
          >
            Disconnect Telegram
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-danger">{error}</p>
      )}
      {confirmDisconnect && (
        <ConfirmDialog
          title="Disconnect Telegram?"
          description="Tasking will stop forwarding notifications and remove this Telegram connection. You can reconnect later with a new code."
          confirmLabel="Disconnect Telegram"
          pending={pending}
          onConfirm={() => {
            setConfirmDisconnect(false);
            disconnect();
          }}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}
    </div>
  );
}

function Toggle({
  label,
  hint,
  enabled,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg px-2 py-2 hover:bg-surface-2/50">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="mt-0.5 block text-xs text-muted">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        disabled={disabled}
        className={`relative mt-1 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          enabled ? "bg-primary" : "bg-border"
        } disabled:opacity-50`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            enabled ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
