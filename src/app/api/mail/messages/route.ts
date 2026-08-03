import { listMail, requestUser, sendMail } from "@/lib/mail-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requestUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const messages = await listMail(
      user.id,
      url.searchParams.get("folder") || "INBOX",
      Number(url.searchParams.get("limit") || 30),
    );
    return Response.json({ messages });
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
    const body = (await request.json()) as { to?: string; cc?: string; subject?: string; text?: string };
    if (!body.to?.trim() || !body.subject?.trim() || !body.text?.trim()) {
      throw new Error("Recipient, subject and message are required.");
    }
    const result = await sendMail(user.id, {
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

