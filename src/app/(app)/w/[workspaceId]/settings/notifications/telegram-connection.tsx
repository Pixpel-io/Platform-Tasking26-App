"use client";

import { useEffect, useState, useTransition } from "react";
import { QRCodeSVG } from "qrcode.react";
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
      const next = await getTelegramStatus();
      if (cancelled) return;
      if (next) {
        setConnection({
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
      }
    };
    const id = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [verified, connection?.link_code]);

  function generate() {
    setError(null);
    start(async () => {
      const res = await generateTelegramLinkCode();
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
            <div className="rounded-xl border border-border bg-surface-2 p-5">
              <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
                {/* QR - phone camera se scan karo, Telegram khul jaayega */}
                <div className="flex justify-center sm:block">
                  <div className="rounded-xl bg-white p-3">
                    <QRCodeSVG
                      value={
                        botUsername
                          ? `https://t.me/${botUsername}?start=${encodeURIComponent(code)}`
                          : `tg://start?token=${encodeURIComponent(code)}`
                      }
                      size={160}
                      level="M"
                      marginSize={0}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Scan on your phone
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Open your phone camera, point at the QR. Telegram opens
                    with the code pre-filled - just tap <b>Start</b>.
                  </p>
                  <div className="mt-4 border-t border-border pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Or open here
                    </p>
                    <a
                      href={
                        botUsername
                          ? `https://t.me/${botUsername}?start=${encodeURIComponent(code)}`
                          : "#"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-disabled={botMissing}
                      className={`mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/30 transition-colors hover:opacity-90 ${
                        botMissing ? "pointer-events-none opacity-50" : ""
                      }`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="currentColor"
                      >
                        <path d="M9.03 15.5 8.9 19.1c.44 0 .63-.2.86-.43l2.06-1.97 4.27 3.13c.78.43 1.34.2 1.55-.72l2.82-13.2h.01c.25-1.15-.42-1.6-1.18-1.31L2.9 10.05c-1.13.44-1.11 1.08-.19 1.36l4.28 1.34 9.94-6.26c.47-.31.9-.14.55.17z" />
                      </svg>
                      Open in Telegram
                    </a>
                  </div>
                </div>
              </div>

              {/* Fallback: manual code (collapsible so it doesn't dominate the card) */}
              <details className="mt-4 rounded-lg border border-border bg-background/40 p-3 text-xs">
                <summary className="cursor-pointer font-semibold text-muted">
                  Trouble scanning? Copy the code manually
                </summary>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs tracking-wider">
                    /start {code}
                  </code>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(`/start ${code}`);
                      setCopied(true);
                    }}
                    className="rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </details>

              <div className="mt-4 flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/6 px-3 py-2 text-xs">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
                  <span className="relative h-2 w-2 rounded-full bg-primary" />
                </span>
                <span className="text-foreground">
                  Waiting for you to tap Start in Telegram...
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
            Chat ID: <span className="font-mono">{connection.external_id}</span>
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
                hint="Every message posted in channels you belong to. Chatty - off by default is fine for most people."
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
            onClick={disconnect}
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
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg px-2 py-2 hover:bg-surface-2/50">
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
    </label>
  );
}
