import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { createClient as createSupabaseClient, type User } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { enforceRateLimit } from "@/lib/rate-limit-server";

export type MailAccountInput = {
  email: string;
  displayName?: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  password: string;
};

type StoredMailAccount = {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  username: string;
  encrypted_password: string;
  notifications_enabled: boolean;
  last_notified_uid: number | null;
};

function encryptionKey(): Buffer {
  const secret = process.env.MAIL_CREDENTIALS_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("MAIL_CREDENTIALS_ENCRYPTION_KEY must be at least 32 characters");
  }
  return createHash("sha256").update(secret).digest();
}

function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decrypt(value: string): string {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid encrypted credential");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function requestUser(request: Request): Promise<User | null> {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) {
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${bearer}` } }, auth: { persistSession: false } },
    );
    return (await supabase.auth.getUser()).data.user;
  }
  return (await (await createClient()).auth.getUser()).data.user;
}

function adminMailTable() {
  return createServiceClient().from("user_mail_accounts");
}

export async function enforceMailRateLimit(userId: string, action: "account" | "inbox" | "read" | "send") {
  await enforceRateLimit(userId, `mail_${action}`);
}

export async function listMailAccounts(userId: string): Promise<StoredMailAccount[]> {
  const { data, error } = await adminMailTable()
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as StoredMailAccount[]) ?? [];
}

export async function getMailAccount(userId: string, accountId: string): Promise<StoredMailAccount | null> {
  const { data, error } = await adminMailTable()
    .select("*")
    .eq("user_id", userId)
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as StoredMailAccount | null) ?? null;
}

type MailEndpoint = { address: string; servername: string };
const MAIL_ENDPOINT_TTL = 5 * 60_000;
const mailEndpointCache = new Map<string, { endpoint: MailEndpoint; expiresAt: number }>();

function imapClient(
  account: StoredMailAccount | MailAccountInput,
  password: string,
  endpoint: MailEndpoint,
) {
  const stored = "imap_host" in account;
  return new ImapFlow({
    host: endpoint.address,
    servername: endpoint.servername,
    port: stored ? account.imap_port : account.imapPort,
    secure: stored ? account.imap_secure : account.imapSecure,
    auth: { user: stored ? account.username : account.username, pass: password },
    logger: false,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    maxLiteralSize: 20 * 1024 * 1024,
    maxLineLength: 1024 * 1024,
  });
}

function smtpTransport(
  account: StoredMailAccount | MailAccountInput,
  password: string,
  endpoint: MailEndpoint,
) {
  const stored = "smtp_host" in account;
  const secure = stored ? account.smtp_secure : account.smtpSecure;
  return nodemailer.createTransport({
    host: endpoint.address,
    port: stored ? account.smtp_port : account.smtpPort,
    secure,
    requireTLS: !secure,
    tls: { servername: endpoint.servername, minVersion: "TLSv1.2" },
    auth: { user: account.username, pass: password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")) return true;
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

async function resolvePublicMailHost(host: string): Promise<MailEndpoint> {
  const normalized = host.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized || normalized === "localhost" || normalized.endsWith(".local")) {
    throw new Error("Private or local mail servers are not allowed.");
  }
  const cached = mailEndpointCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) return cached.endpoint;
  const addresses = isIP(normalized)
    ? [{ address: normalized }]
    : await lookup(normalized, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Mail server must resolve only to public IP addresses.");
  }
  // Connect to the already-validated address instead of resolving the host a
  // second time inside the mail library (which would permit DNS rebinding).
  const endpoint = { address: addresses[0].address, servername: normalized };
  mailEndpointCache.set(normalized, { endpoint, expiresAt: Date.now() + MAIL_ENDPOINT_TTL });
  return endpoint;
}

export async function verifyMailConnection(input: MailAccountInput) {
  const [imapEndpoint, smtpEndpoint] = await Promise.all([
    resolvePublicMailHost(input.imapHost),
    resolvePublicMailHost(input.smtpHost),
  ]);
  const imap = imapClient(input, input.password, imapEndpoint);
  const smtp = smtpTransport(input, input.password, smtpEndpoint);
  try {
    const results = await Promise.allSettled([imap.connect(), smtp.verify()]);
    const failed = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failed) throw failed.reason;
  } finally {
    if (imap.usable) await imap.logout().catch(() => undefined);
    smtp.close();
  }
}

export async function saveMailAccount(userId: string, input: MailAccountInput) {
  await verifyMailConnection(input);
  const { data, error } = await adminMailTable().upsert(
    {
      user_id: userId,
      email: input.email.trim().toLowerCase(),
      display_name: input.displayName?.trim() || null,
      imap_host: input.imapHost.trim(),
      imap_port: input.imapPort,
      imap_secure: input.imapSecure,
      smtp_host: input.smtpHost.trim(),
      smtp_port: input.smtpPort,
      smtp_secure: input.smtpSecure,
      username: input.username.trim(),
      encrypted_password: encrypt(input.password),
    },
    { onConflict: "user_id,email" },
  ).select("*").single();
  if (error) throw error;
  return data as unknown as StoredMailAccount;
}

export async function deleteMailAccount(userId: string, accountId: string) {
  const { error } = await adminMailTable().delete().eq("user_id", userId).eq("id", accountId);
  if (error) throw error;
}

export async function setMailNotifications(userId: string, accountId: string, enabled: boolean) {
  const { data, error } = await adminMailTable()
    .update({
      notifications_enabled: enabled,
      ...(enabled ? { last_notified_uid: null } : {}),
    })
    .eq("user_id", userId)
    .eq("id", accountId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Mailbox not found.");
}

export async function syncMailNotifications(userId: string) {
  const service = createServiceClient();
  const accounts = (await listMailAccounts(userId)).filter((item) => item.notifications_enabled);
  const results = await Promise.allSettled(accounts.map(async (account) => {
    const messages = await listMail(userId, account.id, "INBOX", 30);
    const newestUid = messages.reduce((max, item) => Math.max(max, item.uid), 0);
    if (!newestUid || account.last_notified_uid === null) {
      if (newestUid) await adminMailTable().update({ last_notified_uid: newestUid }).eq("id", account.id).is("last_notified_uid", null);
      return;
    }
    if (newestUid <= account.last_notified_uid) return;

    const fresh = messages.filter((item) => item.uid > account.last_notified_uid!);
    const { data: claimed } = await adminMailTable()
      .update({ last_notified_uid: newestUid })
      .eq("id", account.id)
      .eq("last_notified_uid", account.last_notified_uid)
      .select("id")
      .maybeSingle();
    if (!claimed || fresh.length === 0) return;

    // Persist one row per unread email. A bundled row ("3 new emails") makes
    // a numeric badge impossible to decrement correctly one message at a time.
    const unreadFresh = fresh.filter((message) => message.unread);
    if (unreadFresh.length === 0) return;
    const { error } = await service.from("mail_notifications").insert(
      unreadFresh.map((message) => {
        const sender = message.from?.name || message.from?.address || "New sender";
        return {
          user_id: userId,
          account_id: account.id,
          uid: message.uid,
          title: `New email from ${sender}`,
          body: message.subject,
        };
      }),
    );
    if (error) throw error;
  }));
  if (accounts.length > 0 && results.every((result) => result.status === "rejected")) {
    throw new Error("Could not check the connected mailboxes.");
  }
}

export async function listMail(userId: string, accountId: string, folder = "INBOX", limit = 30) {
  return (await listMailPage(userId, accountId, folder, limit)).messages;
}

export async function listMailPage(
  userId: string,
  accountId: string,
  folder = "INBOX",
  limit = 30,
  beforeUid?: number,
) {
  const account = await getMailAccount(userId, accountId);
  if (!account) throw new Error("Connect an email account first.");
  const endpoint = await resolvePublicMailHost(account.imap_host);
  const client = imapClient(account, decrypt(account.encrypted_password), endpoint);
  try {
    await client.connect();
    await client.mailboxOpen(folder, { readOnly: true });
    const uids = await client.search({ all: true }, { uid: true });
    if (!uids) return { messages: [], hasMore: false, nextBeforeUid: null };
    const safeLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Math.trunc(limit), 1), 100)
      : 30;
    const eligibleUids = beforeUid
      ? uids.filter((uid) => uid < beforeUid)
      : uids;
    const selected = eligibleUids.slice(-safeLimit);
    if (selected.length === 0) {
      return { messages: [], hasMore: false, nextBeforeUid: null };
    }
    const rows = await client.fetchAll(selected, {
      uid: true,
      envelope: true,
      flags: true,
      internalDate: true,
      size: true,
    }, { uid: true });
    const messages = rows.reverse().map((message) => ({
      uid: message.uid,
      subject: message.envelope?.subject || "(No subject)",
      from: message.envelope?.from?.[0] ?? null,
      to: message.envelope?.to ?? [],
      date: message.envelope?.date?.toISOString() ?? String(message.internalDate ?? ""),
      unread: !message.flags?.has("\\Seen"),
      flagged: message.flags?.has("\\Flagged") ?? false,
      size: message.size ?? 0,
    }));
    return {
      messages,
      hasMore: eligibleUids.length > selected.length,
      nextBeforeUid: selected[0] ?? null,
    };
  } finally {
    if (client.usable) await client.logout().catch(() => undefined);
  }
}

export async function readMail(userId: string, accountId: string, uid: number, folder = "INBOX") {
  const account = await getMailAccount(userId, accountId);
  if (!account) throw new Error("Connect an email account first.");
  const endpoint = await resolvePublicMailHost(account.imap_host);
  const client = imapClient(account, decrypt(account.encrypted_password), endpoint);
  try {
    await client.connect();
    await client.mailboxOpen(folder);
    const metadata = await client.fetchOne(uid, { size: true }, { uid: true });
    if (!metadata) throw new Error("Email not found.");
    if ((metadata.size ?? 0) > 20 * 1024 * 1024) {
      throw new Error("This email is larger than the 20 MB safe viewing limit.");
    }
    const row = await client.fetchOne(uid, { source: true }, { uid: true });
    if (!row || !row.source) throw new Error("Email not found.");
    await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
    const parsed = await simpleParser(row.source);
    // Keep the database-backed navbar badge aligned with the authoritative
    // IMAP read state. Service role is scoped by both owner and mailbox UID.
    if (folder === "INBOX") {
      const { error: readStateError } = await createServiceClient()
        .from("mail_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("account_id", accountId)
        .eq("uid", uid)
        .is("read_at", null);
      if (readStateError) console.error("[mail] could not sync read state", readStateError.message);
    }
    return {
      uid,
      subject: parsed.subject || "(No subject)",
      from: parsed.from?.text ?? "",
      to: parsed.to
        ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to])
            .map((address) => address.text)
            .join(", ")
        : "",
      cc: parsed.cc
        ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc])
            .map((address) => address.text)
            .join(", ")
        : "",
      date: parsed.date?.toISOString() ?? "",
      text: parsed.text ?? "",
      html: typeof parsed.html === "string" ? parsed.html : null,
      attachments: parsed.attachments.map((item) => ({
        filename: item.filename ?? "attachment",
        contentType: item.contentType,
        size: item.size,
      })),
    };
  } finally {
    if (client.usable) await client.logout().catch(() => undefined);
  }
}

export async function sendMail(userId: string, accountId: string, input: { to: string; cc?: string; subject: string; text: string }) {
  const account = await getMailAccount(userId, accountId);
  if (!account) throw new Error("Connect an email account first.");
  const endpoint = await resolvePublicMailHost(account.smtp_host);
  const transport = smtpTransport(
    account,
    decrypt(account.encrypted_password),
    endpoint,
  );
  try {
    const info = await transport.sendMail({
      from: account.display_name ? `"${account.display_name.replace(/"/g, "")}" <${account.email}>` : account.email,
      to: input.to,
      cc: input.cc || undefined,
      subject: input.subject,
      text: input.text,
    });
    return { messageId: info.messageId };
  } finally {
    transport.close();
  }
}
