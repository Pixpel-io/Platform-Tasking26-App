"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { getRealtimeClient } from "@/lib/supabase/client";

type Account = { id: string; email: string; displayName: string | null; imapHost: string; imapPort: number; imapSecure: boolean; smtpHost: string; smtpPort: number; smtpSecure: boolean; username: string; notificationsEnabled: boolean };
type MailRow = { uid: number; subject: string; from: { name?: string; address?: string } | null; date: string; unread: boolean; flagged?: boolean; size?: number };
type MailDetail = { uid: number; subject: string; from: string; to: string; cc: string; date: string; text: string; attachments: { filename: string; contentType: string; size: number }[] };

const MAIL_CACHE_TTL = 30_000;
const DETAIL_CACHE_TTL = 5 * 60_000;
const inboxCache = new Map<string, { messages: MailRow[]; at: number }>();
const detailCache = new Map<string, { message: MailDetail; at: number }>();

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Mail request failed.");
  return body;
}
function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}><path d={d} /></svg>; }
function initials(value: string) { return value.split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "M"; }
function mailDate(value: string) { if (!value) return ""; const date = new Date(value); return date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : date.toLocaleDateString([], { month: "short", day: "numeric" }); }
function fullMailDate(value: string) { if (!value) return ""; return new Date(value).toLocaleString([], { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
function fileSize(value: number) { if (!value) return ""; if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`; return `${(value / 1024 / 1024).toFixed(1)} MB`; }

export function MailClient() {
  const [accounts, setAccounts] = useState<Account[]>();
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<MailRow[]>([]);
  const [selected, setSelected] = useState<MailDetail | null>(null);
  const [compose, setCompose] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [mailNotice, setMailNotice] = useState<{ title: string; body: string } | null>(null);
  const requestSequence = useRef(0);
  const account = accounts?.find((item) => item.id === activeId) ?? accounts?.[0] ?? null;
  const filtered = useMemo(() => { const query = search.trim().toLowerCase(); return query ? messages.filter((message) => [message.subject, message.from?.name, message.from?.address].some((value) => value?.toLowerCase().includes(query))) : messages; }, [messages, search]);
  const unread = messages.filter((message) => message.unread).length;

  const loadMessages = useCallback(async (accountId: string, force = false) => {
    const requestId = ++requestSequence.current;
    const cached = inboxCache.get(accountId);
    if (cached) setMessages(cached.messages);
    else setMessages([]);
    if (!force && cached && Date.now() - cached.at < MAIL_CACHE_TTL) return;
    setLoading(true); setError("");
    try {
      const next = (await api<{ messages: MailRow[] }>(`/api/mail/messages?accountId=${encodeURIComponent(accountId)}`)).messages;
      inboxCache.set(accountId, { messages: next, at: Date.now() });
      if (requestId === requestSequence.current) setMessages(next);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load inbox."); }
    finally { if (requestId === requestSequence.current) setLoading(false); }
  }, []);

  useEffect(() => { api<{ accounts: Account[] }>("/api/mail/account").then(({ accounts: values }) => { setAccounts(values); if (values.length) { const saved = window.localStorage.getItem("tasking-active-mail-account"); const next = values.find((item) => item.id === saved)?.id ?? values[0].id; setActiveId(next); void loadMessages(next); } }).catch((cause) => { setAccounts([]); setError(cause instanceof Error ? cause.message : "Could not load mail settings."); }); }, [loadMessages]);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    let client: Awaited<ReturnType<typeof getRealtimeClient>> | null = null;
    let channel: RealtimeChannel | null = null;
    const accountId = account.id;
    void getRealtimeClient().then((supabase) => {
      if (cancelled) return;
      client = supabase;
      channel = supabase
        .channel(`mail-notifications:${accountId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "mail_notifications", filter: `account_id=eq.${accountId}` }, (payload) => {
          const row = payload.new as { account_id?: string; title?: string; body?: string };
          if (row.account_id !== accountId) return;
          setMailNotice({ title: row.title || "New email", body: row.body || "A new message arrived." });
          void loadMessages(accountId, true);
        })
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (client && channel) void client.removeChannel(channel);
    };
  }, [account, loadMessages]);

  useEffect(() => {
    if (!mailNotice) return;
    const timer = window.setTimeout(() => setMailNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [mailNotice]);

  function activate(accountId: string) {
    if (accountId === account?.id) return;
    setActiveId(accountId); window.localStorage.setItem("tasking-active-mail-account", accountId);
    setSelected(null); setSearch(""); void loadMessages(accountId);
  }
  function markMessageRead(accountId: string, uid: number) {
    const mark = (rows: MailRow[]) => rows.map((row) => row.uid === uid ? { ...row, unread: false } : row);
    setMessages(mark);
    const cached = inboxCache.get(accountId);
    if (cached) inboxCache.set(accountId, { ...cached, messages: mark(cached.messages) });
  }
  async function openMessage(uid: number) {
    if (!account) return;
    const accountId = account.id;
    const cacheKey = `${accountId}:${uid}`;
    const cached = detailCache.get(cacheKey);
    if (cached && Date.now() - cached.at < DETAIL_CACHE_TTL) {
      setSelected(cached.message);
      markMessageRead(accountId, uid);
      return;
    }
    const requestId = ++requestSequence.current; setLoading(true); setError("");
    try { const result = await api<{ message: MailDetail }>(`/api/mail/messages/${uid}?accountId=${encodeURIComponent(accountId)}`); detailCache.set(cacheKey, { message: result.message, at: Date.now() }); if (requestId === requestSequence.current) { setSelected(result.message); markMessageRead(accountId, uid); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read email."); }
    finally { if (requestId === requestSequence.current) setLoading(false); }
  }
  async function disconnect() {
    if (!account) return;
    try {
      await api(`/api/mail/account?accountId=${encodeURIComponent(account.id)}`, { method: "DELETE" });
      inboxCache.delete(account.id); for (const key of detailCache.keys()) if (key.startsWith(`${account.id}:`)) detailCache.delete(key);
      const remaining = (accounts ?? []).filter((item) => item.id !== account.id); setAccounts(remaining); setMessages([]); setSelected(null);
      const next = remaining[0]; setActiveId(next?.id ?? "");
      if (next) { window.localStorage.setItem("tasking-active-mail-account", next.id); void loadMessages(next.id); } else window.localStorage.removeItem("tasking-active-mail-account");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not disconnect mailbox."); }
  }
  async function toggleMailNotifications() {
    if (!account) return;
    const enabled = !account.notificationsEnabled;
    setAccounts((current) => current?.map((item) => item.id === account.id ? { ...item, notificationsEnabled: enabled } : item));
    setError("");
    try {
      await api("/api/mail/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: account.id, enabled }),
      });
    } catch (cause) {
      setAccounts((current) => current?.map((item) => item.id === account.id ? { ...item, notificationsEnabled: !enabled } : item));
      setError(cause instanceof Error ? cause.message : "Could not update mail notifications.");
    }
  }

  if (accounts === undefined) return <div className="grid h-full place-items-center"><div className="flex flex-col items-center gap-3 text-muted"><span className="h-9 w-9 animate-spin rounded-full border-2 border-primary/20 border-t-primary" /><span className="text-sm">Opening your mailbox...</span></div></div>;
  if (!account) return <AccountSetup initialError={error} onConnected={(value) => { setAccounts([value]); setActiveId(value.id); window.localStorage.setItem("tasking-active-mail-account", value.id); void loadMessages(value.id); }} />;

  return <div className="relative flex h-full min-h-0 flex-col bg-background">
    <header className="flex min-h-22 items-center border-b border-border/60 bg-surface/75 px-4 py-3 backdrop-blur-xl sm:px-5 md:px-7 lg:pr-32">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-primary via-primary to-primary/65 text-primary-foreground shadow-lg shadow-primary/20 ring-1 ring-white/10"><Icon d="M4 6h16v12H4zM4 7l8 6 8-6" className="h-5.5 w-5.5" /></span>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5"><h1 className="text-xl font-bold tracking-tight sm:text-2xl">Mail</h1>{unread > 0 && <span className="rounded-full border border-primary/15 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">{unread} unread</span>}</div>
          <label className="mt-0.5 flex min-w-0 items-center gap-1 text-xs font-medium text-muted"><span className="hidden sm:inline">Inbox</span><span className="hidden sm:inline">·</span><select aria-label="Active mailbox" value={account.id} onChange={(event) => activate(event.target.value)} className="min-w-0 max-w-48 truncate bg-transparent font-medium text-muted outline-none transition hover:text-foreground sm:max-w-72">{accounts.map((item) => <option key={item.id} value={item.id}>{item.displayName ? `${item.displayName} - ` : ""}{item.email}</option>)}</select></label>
        </div>
      </div>
    </header>
    <nav aria-label="Mailbox actions" className="flex min-h-15 items-center justify-between gap-3 border-b border-border/60 bg-surface/45 px-3 py-2.5 shadow-sm shadow-black/3 backdrop-blur-lg sm:px-5 md:hidden">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={() => setCompose(true)} className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-linear-to-r from-primary to-primary/80 px-4 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/25"><Icon d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4z" /><span>Compose</span></button>
        <span className="hidden h-7 w-px bg-border/80 sm:block" />
        <div className="hidden min-w-0 sm:block">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-foreground">Inbox</p>
          <p className="mt-0.5 truncate text-[11px] text-muted">{account.email}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button role="switch" aria-checked={account.notificationsEnabled} aria-label={`${account.notificationsEnabled ? "Disable" : "Enable"} new mail notifications`} title={`${account.notificationsEnabled ? "Disable" : "Enable"} new mail notifications`} onClick={() => void toggleMailNotifications()} className={`relative grid h-10 w-10 place-items-center rounded-xl border shadow-sm transition ${account.notificationsEnabled ? "border-primary/35 bg-primary/12 text-primary" : "border-border/80 bg-background/70 text-muted hover:border-primary/30 hover:bg-primary/8 hover:text-primary"}`}><Icon d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M14 21h-4" />{unread > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-sm shadow-primary/30">{unread > 99 ? "99+" : unread}</span>}</button>
        <button aria-label="Add mailbox" title="Add another mailbox" onClick={() => setAdding(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-border/80 bg-background/70 text-muted shadow-sm transition hover:border-primary/30 hover:bg-primary/8 hover:text-primary"><Icon d="M12 5v14M5 12h14" /></button>
        <button aria-label="Refresh inbox" title="Refresh inbox" disabled={loading} onClick={() => void loadMessages(account.id, true)} className="grid h-10 w-10 place-items-center rounded-xl border border-border/80 bg-background/70 text-muted shadow-sm transition hover:border-primary/30 hover:bg-primary/8 hover:text-primary disabled:opacity-50"><span className={loading ? "animate-spin" : ""}><Icon d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7" /></span></button>
        <button aria-label="Disconnect mailbox" title="Disconnect active mailbox" onClick={() => setConfirmDisconnect(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-border/80 bg-background/70 text-muted shadow-sm transition hover:border-danger/30 hover:bg-danger/8 hover:text-danger"><Icon d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /></button>
      </div>
    </nav>
    {error && <div className="flex items-center gap-2 border-b border-danger/20 bg-danger/8 px-4 py-2.5 text-sm text-danger sm:px-6"><Icon d="M12 9v4M12 17h.01M10.3 3.7L2.5 17.2A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.8L13.7 3.7a2 2 0 0 0-3.4 0z" />{error}</div>}
    {mailNotice && <div className="absolute right-4 top-39 z-40 flex w-[min(22rem,calc(100%-2rem))] items-start gap-3 rounded-2xl border border-primary/25 bg-surface/95 p-4 shadow-xl shadow-black/15 backdrop-blur-xl"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary"><Icon d="M4 6h16v12H4zM4 7l8 6 8-6" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-foreground">{mailNotice.title}</p><p className="mt-0.5 truncate text-xs text-muted">{mailNotice.body}</p></div><button aria-label="Dismiss mail notification" onClick={() => setMailNotice(null)} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"><Icon d="M18 6L6 18M6 6l12 12" /></button></div>}
    <div className="grid min-h-0 flex-1 md:grid-cols-[72px_340px_minmax(0,1fr)] xl:grid-cols-[76px_390px_minmax(0,1fr)]">
      <nav aria-label="Mailbox actions" className="relative hidden min-h-0 flex-col items-center overflow-hidden border-r border-border/60 bg-linear-to-b from-surface via-surface/85 to-surface-2/45 px-1.5 py-3 shadow-[6px_0_22px_rgba(0,0,0,0.03)] backdrop-blur-2xl md:flex">
        <span aria-hidden="true" className="pointer-events-none absolute -left-10 -top-16 h-32 w-32 rounded-full bg-primary/12 blur-3xl" />
        <p className="relative mb-2 text-[8px] font-bold uppercase tracking-[0.16em] text-muted/70">Mail</p>
        <button onClick={() => setCompose(true)} className="group relative flex w-full flex-col items-center gap-1 overflow-hidden rounded-[14px] border border-primary/30 bg-linear-to-br from-primary via-primary to-primary/75 px-1 py-2.5 text-primary-foreground shadow-md shadow-primary/20 transition duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg hover:shadow-primary/25 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/25"><span aria-hidden="true" className="absolute inset-x-2 top-0 h-px bg-linear-to-r from-transparent via-white/60 to-transparent" /><span className="grid h-7 w-7 place-items-center rounded-lg bg-white/12 ring-1 ring-white/15 transition-transform duration-200 group-hover:rotate-[-4deg] group-hover:scale-105"><Icon d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4z" className="h-4 w-4" /></span><span className="text-[9px] font-bold tracking-tight">Compose</span></button>
        <div className="my-2.5 h-px w-9 bg-linear-to-r from-transparent via-border to-transparent" />
        <div className="flex w-full flex-col items-center gap-0.5">
          <MailRailButton label="Notifications" active={account.notificationsEnabled} badge={unread} onClick={() => void toggleMailNotifications()}><Icon d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M14 21h-4" /></MailRailButton>
          <MailRailButton label="Add inbox" onClick={() => setAdding(true)}><Icon d="M12 5v14M5 12h14" /></MailRailButton>
          <MailRailButton label="Refresh" disabled={loading} onClick={() => void loadMessages(account.id, true)}><span className={loading ? "animate-spin" : ""}><Icon d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7" /></span></MailRailButton>
        </div>
        <div className="mt-auto w-full border-t border-border/60 pt-2">
          <MailRailButton label="Disconnect" danger onClick={() => setConfirmDisconnect(true)}><Icon d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /></MailRailButton>
        </div>
      </nav>
      <aside className={`${selected ? "hidden md:flex" : "flex"} min-h-0 flex-col border-r border-border/60 bg-surface/25`}>
        <div className="border-b border-border/60 bg-surface/45 p-3.5 backdrop-blur-lg">
          <div className="mb-2.5 flex items-center justify-between px-0.5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Inbox</p><span className="text-[11px] font-medium text-muted">{filtered.length} messages</span></div>
          <label className="flex h-11 items-center gap-2.5 rounded-xl border border-border/80 bg-background/65 px-3.5 text-muted shadow-sm transition focus-within:border-primary/45 focus-within:ring-3 focus-within:ring-primary/8"><Icon d="M21 21l-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sender or subject" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted/70" />{search && <button aria-label="Clear search" onClick={() => setSearch("")} className="grid h-6 w-6 place-items-center rounded-md hover:bg-surface-2"><Icon d="M18 6L6 18M6 6l12 12" className="h-3.5 w-3.5" /></button>}</label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">{loading && messages.length === 0 && <div className="space-y-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-25 animate-pulse rounded-2xl border border-border/40 bg-surface-2/70" />)}</div>}{!loading && messages.length === 0 && <EmptyInbox />}{!loading && messages.length > 0 && filtered.length === 0 && <p className="p-8 text-center text-sm text-muted">No messages match your search.</p>}{filtered.map((message) => <MessageRow key={message.uid} message={message} active={selected?.uid === message.uid} onOpen={() => void openMessage(message.uid)} />)}</div>
      </aside>
      <main className={`${selected ? "block" : "hidden md:block"} overflow-y-auto bg-[radial-gradient(circle_at_top,var(--color-primary)/0.035,transparent_32%)] p-3 sm:p-5 lg:p-8 xl:p-10`}>{selected ? <MessageDetail message={selected} onBack={() => setSelected(null)} /> : <NoSelection />}</main>
    </div>
    {compose && <ComposeDialog account={account} onClose={() => setCompose(false)} />}
    {confirmDisconnect && <ConfirmDialog title={`Disconnect ${account.email}?`} description="Tasking will remove this mailbox connection and its encrypted credentials. Your email account and messages will not be deleted from your provider." confirmLabel="Disconnect mailbox" onConfirm={() => { setConfirmDisconnect(false); void disconnect(); }} onCancel={() => setConfirmDisconnect(false)} />}
    {adding && <div className="fixed inset-0 z-50 overflow-y-auto bg-background"><AccountSetup onCancel={() => setAdding(false)} onConnected={(value) => { setAccounts([value, ...accounts.filter((item) => item.id !== value.id)]); setAdding(false); activate(value.id); }} /></div>}
  </div>;
}

function MailRailButton({ label, children, onClick, active = false, danger = false, disabled = false, badge = 0 }: { label: string; children: ReactNode; onClick: () => void; active?: boolean; danger?: boolean; disabled?: boolean; badge?: number }) {
  return <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={`group relative flex w-full flex-col items-center gap-1 rounded-xl border px-0.5 py-1.5 text-[9px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-45 ${danger ? "border-transparent text-muted hover:border-danger/20 hover:bg-danger/8 hover:text-danger focus-visible:ring-danger/20" : active ? "border-primary/20 bg-primary/10 text-primary shadow-sm shadow-primary/8" : "border-transparent text-muted hover:-translate-y-px hover:border-border/70 hover:bg-background/75 hover:text-foreground hover:shadow-sm focus-visible:ring-primary/20"}`}><span className={`relative grid h-7 w-7 place-items-center rounded-lg border transition-all duration-200 ${danger ? "border-border/60 bg-background/60 group-hover:border-danger/20 group-hover:bg-danger/8" : active ? "border-primary/25 bg-primary/12 shadow-inner" : "border-border/60 bg-background/65 shadow-sm group-hover:border-primary/20 group-hover:bg-primary/8 group-hover:text-primary"}`}>{children}{badge > 0 && <span className="absolute -right-2.5 -top-2 grid h-4 min-w-4 place-items-center rounded-full border-2 border-surface bg-primary px-0.5 text-[8px] font-bold leading-none text-primary-foreground shadow-sm shadow-primary/30">{badge > 99 ? "99+" : badge}</span>}</span><span className="max-w-full truncate leading-tight tracking-tight">{label}</span>{active && <span aria-hidden="true" className="absolute bottom-0.5 h-0.5 w-3 rounded-full bg-primary" />}</button>;
}

function MessageRow({ message, active, onOpen }: { message: MailRow; active: boolean; onOpen: () => void }) {
  const sender = message.from?.name || message.from?.address || "Unknown sender";
  return <button onClick={onOpen} className={`group relative mb-1.5 block w-full overflow-hidden rounded-2xl border p-3.5 text-left transition-all duration-200 ${active ? "border-primary/30 bg-primary/9 shadow-sm shadow-primary/5" : "border-transparent hover:border-border/70 hover:bg-surface-2/75"}`}>
    {message.unread && <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-primary" />}
    <div className="flex items-start gap-3">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-bold shadow-sm transition-transform group-hover:scale-[1.03] ${message.unread ? "bg-linear-to-br from-primary to-primary/70 text-primary-foreground" : "border border-border/60 bg-surface-2 text-muted"}`}>{initials(sender)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2"><p className={`truncate text-sm ${message.unread ? "font-bold text-foreground" : "font-semibold text-foreground/85"}`}>{sender}</p><time className={`shrink-0 text-[10px] font-medium ${message.unread ? "text-primary" : "text-muted"}`}>{mailDate(message.date)}</time></div>
        <p className={`mt-1 truncate text-sm ${message.unread ? "font-semibold text-foreground" : "text-muted"}`}>{message.subject}</p>
        <div className="mt-1.5 flex items-center gap-2"><p className="min-w-0 flex-1 truncate text-[11px] text-muted/70">{message.from?.address || "Email message"}</p>{message.flagged && <span className="text-amber-400" title="Flagged">★</span>}{message.size ? <span className="shrink-0 text-[10px] text-muted/60">{fileSize(message.size)}</span> : null}</div>
      </div>
    </div>
  </button>;
}
function EmptyInbox() { return <div className="grid min-h-64 place-items-center px-8 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon d="M4 6h16v12H4zM4 7l8 6 8-6" /></span><p className="mt-4 text-sm font-semibold">Your inbox is clear</p><p className="mt-1 text-xs text-muted">New messages will appear here.</p></div></div>; }
function NoSelection() { return <div className="grid h-full min-h-80 place-items-center text-center"><div className="max-w-xs"><span className="mx-auto grid h-18 w-18 place-items-center rounded-3xl border border-primary/15 bg-linear-to-br from-primary/12 to-primary/4 text-primary shadow-xl shadow-primary/5"><Icon d="M4 6h16v12H4zM4 7l8 6 8-6" className="h-7 w-7" /></span><p className="mt-5 text-lg font-bold tracking-tight">Your inbox, at a glance</p><p className="mt-1.5 text-sm leading-6 text-muted">Choose a message from the inbox to read its full conversation here.</p></div></div>; }
function MessageDetail({ message, onBack }: { message: MailDetail; onBack: () => void }) {
  return <article className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-border/70 bg-surface/90 shadow-xl shadow-black/5 backdrop-blur-sm">
    <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5 sm:px-5">
      <button onClick={onBack} className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-muted transition hover:bg-surface-2 hover:text-foreground md:hidden"><Icon d="M15 18l-6-6 6-6" />Inbox</button>
      <span className="hidden text-[11px] font-bold uppercase tracking-[0.14em] text-muted md:inline">Message</span>
      <time className="text-[11px] font-medium text-muted">{fullMailDate(message.date)}</time>
    </div>
    <div className="border-b border-border/60 p-5 sm:p-7 lg:p-9">
      <h2 className="max-w-3xl text-balance text-xl font-bold leading-tight tracking-[-0.025em] sm:text-2xl lg:text-3xl">{message.subject}</h2>
      <div className="mt-6 flex items-start gap-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-primary to-primary/65 text-sm font-bold text-primary-foreground shadow-md shadow-primary/15">{initials(message.from)}</span>
        <div className="min-w-0 flex-1 text-sm"><p className="wrap-break-word font-bold text-foreground">{message.from}</p><p className="mt-0.5 wrap-break-word text-xs leading-5 text-muted"><span className="font-medium text-muted/75">To:</span> {message.to || "Undisclosed recipients"}</p>{message.cc && <p className="wrap-break-word text-xs leading-5 text-muted"><span className="font-medium text-muted/75">Cc:</span> {message.cc}</p>}</div>
      </div>
    </div>
    {message.attachments.length > 0 && <div className="flex flex-wrap gap-2 border-b border-border/60 bg-surface-2/25 px-5 py-3.5 sm:px-7 lg:px-9">{message.attachments.map((item, index) => <span key={`${item.filename}-${index}`} title={item.filename} className="flex max-w-full items-center gap-2 rounded-xl border border-border/80 bg-background/60 px-3 py-2 text-xs shadow-sm"><Icon d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19" /><span className="max-w-52 truncate font-medium">{item.filename}</span><span className="text-muted">{fileSize(item.size)}</span></span>)}</div>}
    <div className="min-h-80 p-5 sm:p-7 lg:p-9"><pre className="whitespace-pre-wrap wrap-break-word font-sans text-[15px] leading-7 text-foreground/90">{message.text || "This email has no plain-text body."}</pre></div>
  </article>;
}

const PROVIDERS = { Gmail: { imapHost: "imap.gmail.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.gmail.com", smtpPort: 465, smtpSecure: true }, Outlook: { imapHost: "outlook.office365.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.office365.com", smtpPort: 587, smtpSecure: false }, Zoho: { imapHost: "imap.zoho.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.zoho.com", smtpPort: 465, smtpSecure: true } };
function AccountSetup({ initialError, onConnected, onCancel }: { initialError?: string; onConnected: (account: Account) => void; onCancel?: () => void }) {
  const [form, setForm] = useState({ email: "", displayName: "", imapHost: "imap.gmail.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.gmail.com", smtpPort: 465, smtpSecure: true, username: "", password: "" });
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(initialError || ""); const [success, setSuccess] = useState(false);
  async function submit(testOnly: boolean) { setBusy(true); setMessage(""); setSuccess(false); try { const result = await api<{ account?: Account }>(`/api/mail/account${testOnly ? "?test=1" : ""}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) }); if (testOnly) { setMessage("Both IMAP and SMTP connections are working."); setSuccess(true); } else if (result.account) onConnected(result.account); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Connection failed."); } finally { setBusy(false); } }
  const fieldHelp: Partial<Record<keyof typeof form, string>> = {
    email: "The email address you want to read and send from.",
    displayName: "The name recipients will see, for example Saad or Tasking Support.",
    username: "Usually your complete email address. Change it only if your provider gave you a different login name.",
    password: "Use an app password when 2-step verification is enabled. Do not enter a recovery code or API key.",
    imapHost: "Incoming-mail server. Provider presets fill this automatically.",
    imapPort: "Usually 993 with SSL/TLS. Keep the preset unless your provider documents another value.",
    smtpHost: "Outgoing-mail server used when you send email from Tasking.",
    smtpPort: "Usually 465 for direct SSL or 587 for STARTTLS. Keep the selected provider's preset.",
  };
  const field = (key: keyof typeof form, label: string, type = "text", placeholder = "") => <label className="space-y-1.5 text-sm"><span className="font-semibold text-foreground">{label}</span><input type={type} placeholder={placeholder} value={String(form[key])} onChange={(event) => setForm((old) => ({ ...old, [key]: type === "number" ? Number(event.target.value) : event.target.value }))} className="h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none transition focus:border-primary/50 focus:ring-3 focus:ring-primary/8" />{fieldHelp[key] && <span className="block text-[11px] leading-4 text-muted">{fieldHelp[key]}</span>}</label>;
  const selectedProvider = Object.entries(PROVIDERS).find(([, preset]) => preset.imapHost === form.imapHost)?.[0];
  // eslint-disable-next-line react/no-unescaped-entities
  return <div className="min-h-full bg-[radial-gradient(circle_at_top_left,var(--color-primary)/0.08,transparent_35%)] p-5 md:p-10"><div className="mx-auto max-w-3xl"><div className="mb-7 flex items-center justify-between gap-4"><div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground"><Icon d="M4 6h16v12H4zM4 7l8 6 8-6" className="h-6 w-6" /></span><div><h1 className="text-2xl font-bold">{onCancel ? "Add another mailbox" : "Connect your mailbox"}</h1><p className="mt-1 text-sm text-muted">Follow the steps below. You can test everything before saving.</p></div></div>{onCancel && <button onClick={onCancel} aria-label="Close mailbox setup" className="grid h-10 w-10 place-items-center rounded-xl border border-border"><Icon d="M18 6L6 18M6 6l12 12" /></button>}</div><div className="rounded-2xl border border-border/70 bg-surface p-5 shadow-sm md:p-7"><div className="rounded-xl border border-primary/15 bg-primary/6 p-4"><p className="text-sm font-bold text-foreground">Step 1: Choose your email provider</p><p className="mt-1 text-xs leading-5 text-muted">For Gmail, Outlook or Zoho, select a preset and leave the host and port values unchanged. Only use custom values when your company or email provider specifically gave them to you.</p><div className="mt-3 grid grid-cols-3 gap-2">{Object.entries(PROVIDERS).map(([name, preset]) => <button key={name} onClick={() => setForm((old) => ({ ...old, ...preset, smtpSecure: preset.smtpPort === 465 }))} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${form.imapHost === preset.imapHost ? "border-primary/40 bg-primary/12 text-primary shadow-sm" : "border-border bg-background hover:border-primary/25"}`}>{name}</button>)}</div></div><div className="my-6 flex items-center gap-3"><span className="h-px flex-1 bg-border" /><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Step 2: Account details</span><span className="h-px flex-1 bg-border" /></div><div className="grid gap-x-4 gap-y-5 md:grid-cols-2">{field("email", "Email address", "email", "you@company.com")}{field("displayName", "Sender name", "text", "Your name")}{field("username", "Mail username", "text", "Usually your full email")}{field("password", "Password / app password", "password", "App password recommended")}{field("imapHost", "IMAP host", "text", "imap.provider.com")}{field("imapPort", "IMAP port", "number")}{field("smtpHost", "SMTP host", "text", "smtp.provider.com")}{field("smtpPort", "SMTP port", "number")}</div><div className="mt-6 rounded-xl border border-border bg-background/45 p-4"><p className="text-sm font-bold text-foreground">Step 3: Security settings</p><div className="mt-3 flex flex-wrap gap-5 text-sm text-muted"><label className="flex items-center gap-2"><input type="checkbox" checked={form.imapSecure} onChange={(event) => setForm((old) => ({ ...old, imapSecure: event.target.checked }))} />IMAP SSL/TLS</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.smtpSecure} onChange={(event) => setForm((old) => ({ ...old, smtpSecure: event.target.checked }))} />SMTP direct SSL/TLS</label></div><p className="mt-2 text-[11px] leading-4 text-muted">{selectedProvider ? `${selectedProvider} preset selected. These security settings already match its recommended ports.` : "For custom providers, enable direct SMTP SSL with port 465. Port 587 normally uses STARTTLS, so direct SMTP SSL should be off."}</p></div><div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-500/7 p-3.5 text-xs leading-5 text-muted"><span className="font-semibold text-foreground">Password help:</span> Many providers block your normal password when two-factor authentication is enabled. Create an app password in your email account's security settings and paste that value here.</div><div className="mt-3 rounded-xl border border-primary/15 bg-primary/6 p-3.5 text-xs leading-5 text-muted"><span className="font-semibold text-foreground">Privacy first.</span> Credentials are encrypted before storage and never returned to the browser.</div>{message && <p className={`mt-4 rounded-xl px-3 py-2.5 text-sm ${success ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{message}</p>}<div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end"><span className="mr-auto hidden text-xs text-muted sm:block">Test first if you are unsure about any value.</span><button disabled={busy} onClick={() => void submit(true)} className="h-11 rounded-xl border border-border px-5 text-sm font-semibold disabled:opacity-50">Test connection</button><button disabled={busy} onClick={() => void submit(false)} className="h-11 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Checking servers..." : "Connect mailbox"}</button></div></div></div></div>;
}

function ComposeDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const [form, setForm] = useState({ to: "", cc: "", subject: "", text: "" }); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function send() { setBusy(true); setError(""); try { await api("/api/mail/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, accountId: account.id }) }); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send email."); } finally { setBusy(false); } }
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
    <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-border/80 bg-surface shadow-2xl shadow-black/25 sm:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}>
      <header className="flex items-center justify-between border-b border-border/60 bg-surface-2/25 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4z" /></span><div><h2 className="font-bold tracking-tight">New email</h2><p className="mt-0.5 max-w-64 truncate text-xs text-muted">From {account.email}</p></div></div>
        <button onClick={onClose} aria-label="Close composer" className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-foreground"><Icon d="M18 6L6 18M6 6l12 12" /></button>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-3 sm:px-6">
        {(["to", "cc", "subject"] as const).map((key) => <label key={key} className="flex items-center border-b border-border/60"><span className="w-16 text-[11px] font-bold uppercase tracking-wider text-muted">{key}</span><input type={key === "to" || key === "cc" ? "email" : "text"} placeholder={key === "to" ? "recipient@company.com" : key === "subject" ? "Add a subject" : "Optional"} value={form[key]} onChange={(event) => setForm((old) => ({ ...old, [key]: event.target.value }))} className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/55" /></label>)}
        <textarea autoFocus rows={12} placeholder="Write your message..." value={form.text} onChange={(event) => setForm((old) => ({ ...old, text: event.target.value }))} className="mt-5 min-h-64 w-full resize-none bg-transparent text-[15px] leading-7 outline-none placeholder:text-muted/55" />
        {error && <p className="mt-3 rounded-xl border border-danger/20 bg-danger/8 px-3.5 py-2.5 text-sm text-danger">{error}</p>}
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-border/60 bg-surface-2/20 px-5 py-3.5 sm:px-6"><p className="hidden text-xs text-muted sm:block">Sent securely through {account.smtpHost}</p><div className="ml-auto flex gap-2"><button onClick={onClose} className="h-10 rounded-xl px-4 text-sm font-semibold text-muted transition hover:bg-surface-2 hover:text-foreground">Discard</button><button disabled={busy || !form.to.trim() || !form.subject.trim() || !form.text.trim()} onClick={() => void send()} className="flex h-10 items-center gap-2 rounded-xl bg-linear-to-r from-primary to-primary/80 px-5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50">{busy ? "Sending..." : "Send email"}<Icon d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></button></div></footer>
    </div>
  </div>;
}
