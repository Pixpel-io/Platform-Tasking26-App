import { enforceMailRateLimit, listMailPage, requestUser, sendMail } from "@/lib/mail-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requestUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await enforceMailRateLimit(user.id, "inbox");
    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId")?.trim();
    if (!accountId) throw new Error("Choose a mailbox first.");
    const beforeUidValue = Number(url.searchParams.get("beforeUid"));
    const page = await listMailPage(
      user.id,
      accountId,
      "INBOX",
      Number(url.searchParams.get("limit") || 30),
      Number.isSafeInteger(beforeUidValue) && beforeUidValue > 0 ? beforeUidValue : undefined,
    );
    return Response.json(page);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load mail." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const user = await requestUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await enforceMailRateLimit(user.id, "send");
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 1024 * 1024) throw new Error("Email is too large to send.");
    const body = (await request.json()) as { accountId?: string; to?: string; cc?: string; subject?: string; text?: string };
    if (!body.accountId?.trim()) throw new Error("Choose a sender mailbox first.");
    if (!body.to?.trim() || !body.subject?.trim() || !body.text?.trim()) {
      throw new Error("Recipient, subject and message are required.");
    }
    if (
      body.to.length > 2000 ||
      (body.cc?.length ?? 0) > 2000 ||
      body.subject.length > 998 ||
      body.text.length > 900_000 ||
      /[\r\n]/.test(body.subject)
    ) {
      throw new Error("Email fields exceed the allowed size.");
    }
    const result = await sendMail(user.id, body.accountId.trim(), {
      to: body.to.trim(),
      cc: body.cc?.trim(),
      subject: body.subject.trim(),
      text: body.text.trim(),
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not send email." },
      { status: 400 },
    );
  }
}
