import { enforceMailRateLimit, requestUser, syncMailNotifications } from "@/lib/mail-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requestUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await enforceMailRateLimit(user.id, "inbox");
    await syncMailNotifications(user.id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not check mail." }, { status: 400 });
  }
}
