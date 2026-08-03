import {
  deleteMailAccount,
  enforceMailRateLimit,
  listMailAccounts,
  requestUser,
  saveMailAccount,
  verifyMailConnection,
  type MailAccountInput,
} from "@/lib/mail-server";

export const runtime = "nodejs";

function errorResponse(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Mail operation failed.";
  return Response.json({ error: message }, { status });
}

function publicAccount(account: Awaited<ReturnType<typeof listMailAccounts>>[number]) {
  return {
    id: account.id,
    email: account.email,
    displayName: account.display_name,
    imapHost: account.imap_host,
    imapPort: account.imap_port,
    imapSecure: account.imap_secure,
    smtpHost: account.smtp_host,
    smtpPort: account.smtp_port,
    smtpSecure: account.smtp_secure,
    username: account.username,
  };
}

async function parseInput(request: Request): Promise<MailAccountInput> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 32 * 1024) throw new Error("Mail settings request is too large.");
  const value = (await request.json()) as Partial<MailAccountInput>;
  const input: MailAccountInput = {
    email: String(value.email ?? "").trim().toLowerCase(),
    displayName: String(value.displayName ?? "").trim(),
    imapHost: String(value.imapHost ?? "").trim(),
    imapPort: Number(value.imapPort),
    imapSecure: value.imapSecure !== false,
    smtpHost: String(value.smtpHost ?? "").trim(),
    smtpPort: Number(value.smtpPort),
    smtpSecure: value.smtpSecure !== false,
    username: String(value.username ?? "").trim(),
    password: String(value.password ?? ""),
  };
  if (!/^\S+@\S+\.\S+$/.test(input.email)) throw new Error("Enter a valid email address.");
  if (!input.imapHost || !input.smtpHost || !input.username || !input.password) {
    throw new Error("IMAP, SMTP, username and password are required.");
  }
  if (
    input.email.length > 320 ||
    input.displayName!.length > 200 ||
    input.imapHost.length > 253 ||
    input.smtpHost.length > 253 ||
    input.username.length > 320 ||
    input.password.length > 2048
  ) {
    throw new Error("One or more mail settings are too long.");
  }
  if (![input.imapPort, input.smtpPort].every((port) => Number.isInteger(port) && port > 0 && port <= 65535)) {
    throw new Error("Enter valid IMAP and SMTP ports.");
  }
  if (![143, 993].includes(input.imapPort)) {
    throw new Error("IMAP port must be 143 or 993.");
  }
  if (![465, 587, 2525].includes(input.smtpPort)) {
    throw new Error("SMTP port must be 465, 587 or 2525.");
  }
  return input;
}

export async function GET(request: Request) {
  const user = await requestUser(request);
  if (!user) return errorResponse(new Error("Unauthorized"), 401);
  try {
    const accounts = await listMailAccounts(user.id);
    return Response.json({ accounts: accounts.map(publicAccount) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const user = await requestUser(request);
  if (!user) return errorResponse(new Error("Unauthorized"), 401);
  try {
    await enforceMailRateLimit(user.id, "account");
    const input = await parseInput(request);
    const testOnly = new URL(request.url).searchParams.get("test") === "1";
    if (testOnly) {
      await verifyMailConnection(input);
      return Response.json({ ok: true });
    }
    const account = await saveMailAccount(user.id, input);
    return Response.json({ ok: true, account: publicAccount(account) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const user = await requestUser(request);
  if (!user) return errorResponse(new Error("Unauthorized"), 401);
  try {
    await enforceMailRateLimit(user.id, "account");
    const accountId = new URL(request.url).searchParams.get("accountId")?.trim();
    if (!accountId) throw new Error("Choose a mailbox to disconnect.");
    await deleteMailAccount(user.id, accountId);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
