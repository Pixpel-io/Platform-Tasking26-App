import {
  deleteMailAccount,
  getMailAccount,
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

async function parseInput(request: Request): Promise<MailAccountInput> {
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
  if (![input.imapPort, input.smtpPort].every((port) => Number.isInteger(port) && port > 0 && port <= 65535)) {
    throw new Error("Enter valid IMAP and SMTP ports.");
  }
  return input;
}

export async function GET(request: Request) {
  const user = await requestUser(request);
  if (!user) return errorResponse(new Error("Unauthorized"), 401);
  try {
    const account = await getMailAccount(user.id);
    return Response.json({
      account: account
        ? {
            email: account.email,
            displayName: account.display_name,
            imapHost: account.imap_host,
            imapPort: account.imap_port,
            imapSecure: account.imap_secure,
            smtpHost: account.smtp_host,
            smtpPort: account.smtp_port,
            smtpSecure: account.smtp_secure,
            username: account.username,
          }
        : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const user = await requestUser(request);
  if (!user) return errorResponse(new Error("Unauthorized"), 401);
  try {
    const input = await parseInput(request);
    const testOnly = new URL(request.url).searchParams.get("test") === "1";
    if (testOnly) await verifyMailConnection(input);
    else await saveMailAccount(user.id, input);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const user = await requestUser(request);
  if (!user) return errorResponse(new Error("Unauthorized"), 401);
  try {
    await deleteMailAccount(user.id);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

