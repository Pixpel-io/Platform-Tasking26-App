import { readMail, requestUser } from "@/lib/mail-server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ uid: string }> },
) {
  const user = await requestUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { uid } = await context.params;
    const parsedUid = Number(uid);
    if (!Number.isInteger(parsedUid) || parsedUid <= 0) throw new Error("Invalid email id.");
    const message = await readMail(
      user.id,
      parsedUid,
      new URL(request.url).searchParams.get("folder") || "INBOX",
    );
    return Response.json({ message });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not read email." },
      { status: 400 },
    );
  }
}
