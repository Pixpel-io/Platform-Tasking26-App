import { enforceMailRateLimit, readMail, requestUser } from "@/lib/mail-server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ uid: string }> },
) {
  const user = await requestUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await enforceMailRateLimit(user.id, "read");
    const { uid } = await context.params;
    const accountId = new URL(request.url).searchParams.get("accountId")?.trim();
    if (!accountId) throw new Error("Choose a mailbox first.");
    const parsedUid = Number(uid);
    if (!Number.isInteger(parsedUid) || parsedUid <= 0) throw new Error("Invalid email id.");
    const message = await readMail(
      user.id,
      accountId,
      parsedUid,
      "INBOX",
    );
    return Response.json({ message });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not read email." },
      { status: 400 },
    );
  }
}
