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

export async function getMailAccount(userId: string): Promise<StoredMailAccount | null> {
  const { data, error } = await adminMailTable()
    .select("*")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as StoredMailAccount | null) ?? null;
}

function imapClient(account: StoredMailAccount | MailAccountInput, password: string) {
  const stored = "imap_host" in account;
  return new ImapFlow({
    host: stored ? account.imap_host : account.imapHost,
    port: stored ? account.imap_port : account.imapPort,
    secure: stored ? account.imap_secure : account.imapSecure,
    auth: { user: stored ? account.username : account.username, pass: password },
    logger: false,
  });
}

function smtpTransport(account: StoredMailAccount | MailAccountInput, password: string) {
  const stored = "smtp_host" in account;
  return nodemailer.createTransport({
    host: stored ? account.smtp_host : account.smtpHost,
    port: stored ? account.smtp_port : account.smtpPort,
    secure: stored ? account.smtp_secure : account.smtpSecure,
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

async function assertPublicMailHost(host: string) {
  const normalized = host.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized || normalized === "localhost" || normalized.endsWith(".local")) {
    throw new Error("Private or local mail servers are not allowed.");
  }
  const addresses = isIP(normalized)
    ? [{ address: normalized }]
    : await lookup(normalized, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Mail server must resolve only to public IP addresses.");
  }
}

export async function verifyMailConnection(input: MailAccountInput) {
  await Promise.all([
    assertPublicMailHost(input.imapHost),
    assertPublicMailHost(input.smtpHost),
  ]);
  const imap = imapClient(input, input.password);
  try {
    await Promise.all([imap.connect(), smtpTransport(input, input.password).verify()]);
  } finally {
    if (imap.usable) await imap.logout().catch(() => undefined);
  }
}

export async function saveMailAccount(userId: string, input: MailAccountInput) {
  await verifyMailConnection(input);
  const { error } = await adminMailTable().upsert(
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
  );
  if (error) throw error;
}

export async function deleteMailAccount(userId: string) {
  const { error } = await adminMailTable().delete().eq("user_id", userId);
  if (error) throw error;
}

export async function listMail(userId: string, folder = "INBOX", limit = 30) {
  const account = await getMailAccount(userId);
  if (!account) throw new Error("Connect an email account first.");
  await assertPublicMailHost(account.imap_host);
  const client = imapClient(account, decrypt(account.encrypted_password));
  try {
    await client.connect();
    await client.mailboxOpen(folder, { readOnly: true });
    const uids = await client.search({ all: true }, { uid: true });
    if (!uids) return [];
    const selected = uids.slice(-Math.min(Math.max(limit, 1), 100));
    if (selected.length === 0) return [];
    const rows = await client.fetchAll(selected, {
      uid: true,
      envelope: true,
      flags: true,
      internalDate: true,
      size: true,
    }, { uid: true });
    return rows.reverse().map((message) => ({
      uid: message.uid,
      subject: message.envelope?.subject || "(No subject)",
      from: message.envelope?.from?.[0] ?? null,
      to: message.envelope?.to ?? [],
      date: message.envelope?.date?.toISOString() ?? String(message.internalDate ?? ""),
      unread: !message.flags?.has("\\Seen"),
      flagged: message.flags?.has("\\Flagged") ?? false,
      size: message.size ?? 0,
    }));
  } finally {
    if (client.usable) await client.logout().catch(() => undefined);
  }
}

export async function readMail(userId: string, uid: number, folder = "INBOX") {
  const account = await getMailAccount(userId);
  if (!account) throw new Error("Connect an email account first.");
  await assertPublicMailHost(account.imap_host);
  const client = imapClient(account, decrypt(account.encrypted_password));
  try {
    await client.connect();
    await client.mailboxOpen(folder);
    const row = await client.fetchOne(uid, { source: true }, { uid: true });
    if (!row || !row.source) throw new Error("Email not found.");
    await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
    const parsed = await simpleParser(row.source);
    return {
      uid,
      subject: parsed.subject || "(No subject)",
      from: parsed.from?.text ?? "",
      to: parsed.to ? String(parsed.to) : "",
      cc: parsed.cc ? String(parsed.cc) : "",
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

export async function sendMail(userId: string, input: { to: string; cc?: string; subject: string; text: string }) {
  const account = await getMailAccount(userId);
  if (!account) throw new Error("Connect an email account first.");
  await assertPublicMailHost(account.smtp_host);
  const info = await smtpTransport(account, decrypt(account.encrypted_password)).sendMail({
    from: account.display_name ? `"${account.display_name.replace(/"/g, "")}" <${account.email}>` : account.email,
    to: input.to,
    cc: input.cc || undefined,
    subject: input.subject,
    text: input.text,
  });
  return { messageId: info.messageId };
}
