// =============================================================================
// Telegram Bot -> Tasking webhook.
//
// Telegram POSTs an "Update" object here every time the user talks to the bot.
// We only care about two commands:
//   /start <CODE>  - claim a link_code that Tasking's settings UI generated,
//                    bind this chat_id to the user, mark verified.
//   /stop          - disable delivery for this chat.
//
// Security:
//   - Telegram echoes our TELEGRAM_WEBHOOK_SECRET in the
//     `x-telegram-bot-api-secret-token` header. Any request without it is
//     rejected before we even parse the body.
//   - We use the service-role client for the update because the caller is
//     Telegram, not the end user. Auth is bearer-token style via that header.
// =============================================================================

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TelegramMessage = {
  chat: { id: number; type: string; first_name?: string };
  text?: string;
  from?: { id: number; first_name?: string; username?: string };
};

type TelegramUpdate = { update_id: number; message?: TelegramMessage };

export async function POST(req: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) {
    // Fail loud instead of silently accepting unauthenticated updates.
    return NextResponse.json(
      { error: "TELEGRAM_WEBHOOK_SECRET not configured" },
      { status: 500 },
    );
  }
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const message = update.message;
  if (!message || !message.text) return NextResponse.json({ ok: true });

  const chatId = String(message.chat.id);
  const text = message.text.trim();

  if (text === "/stop" || text === "/disable") {
    await handleStop(chatId);
    return NextResponse.json({ ok: true });
  }

  if (text === "/help" || text === "/ping") {
    await replyPlain(
      chatId,
      "I forward Tasking notifications here. Use /stop to pause delivery.",
    );
    return NextResponse.json({ ok: true });
  }

  // Parse `/start CODE` (Telegram sends the payload verbatim as the message
  // text when the user opens t.me/YourBot?start=CODE) - AND accept a bare
  // code with no prefix, so users who tap Start without a start param can
  // still finish the link by copy-pasting the code.
  const codeCandidate = extractLinkCode(text);
  if (codeCandidate) {
    await handleStart(chatId, codeCandidate, message);
    return NextResponse.json({ ok: true });
  }

  if (text.startsWith("/start")) {
    await replyPlain(
      chatId,
      "Send the link code from Tasking → Settings → Notifications, or open the app and tap Generate link code.",
    );
    return NextResponse.json({ ok: true });
  }

  // Silently ignore other text - the bot is one-way by design.
  return NextResponse.json({ ok: true });
}

// Pull a link code out of an incoming message. Accepts three shapes:
//   /start ABC123DEFG   (Telegram's deep-link flow)
//   ABC123DEFG          (user pasted just the code)
//   /ABC123DEFG         (user pasted with a leading slash by habit)
// The code alphabet is the same base32 subset generateLinkCode() uses.
function extractLinkCode(text: string): string | null {
  const stripped = text
    .replace(/^\/start\s+/i, "")
    .replace(/^\/+/, "")
    .trim()
    .toUpperCase();
  if (/^[BCDFGHJKMNPQRSTVWXYZ23456789]{8,16}$/.test(stripped)) {
    return stripped;
  }
  return null;
}

async function handleStart(
  chatId: string,
  code: string,
  message: TelegramMessage,
) {
  const supabase = createServiceClient();
  const { data: row, error } = await supabase
    .from("user_notification_channels")
    .select("*")
    .eq("kind", "telegram")
    .eq("link_code", code)
    .maybeSingle();

  if (error || !row) {
    await replyPlain(
      chatId,
      "That code is not valid. Generate a fresh one from Tasking → Settings → Notifications.",
    );
    return;
  }

  if (row.link_code_expires_at && new Date(row.link_code_expires_at) < new Date()) {
    await replyPlain(
      chatId,
      "That code has expired. Generate a fresh one from Tasking → Settings → Notifications.",
    );
    return;
  }

  const { error: updateErr } = await supabase
    .from("user_notification_channels")
    .update({
      external_id: chatId,
      link_code: null,
      link_code_expires_at: null,
      verified_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (updateErr) {
    await replyPlain(
      chatId,
      "Couldn't link your account. Try again in a minute, or generate a new code.",
    );
    return;
  }

  const who = message.from?.first_name ?? "there";
  await replyPlain(
    chatId,
    `Linked! I'll forward mentions, DMs, and group messages from Tasking here.\n\nSend /stop any time to pause.`,
  );
  // Fire-and-forget welcome tag.
  void who;
}

async function handleStop(chatId: string) {
  const supabase = createServiceClient();
  await supabase
    .from("user_notification_channels")
    .update({
      mentions_enabled: false,
      dms_enabled: false,
      group_messages_enabled: false,
      task_events_enabled: false,
    })
    .eq("kind", "telegram")
    .eq("external_id", chatId);
  await replyPlain(
    chatId,
    "Notifications paused. Re-enable any category from Tasking → Settings → Notifications.",
  );
}

async function replyPlain(chatId: string, text: string) {
  try {
    await sendTelegramMessage({ chatId, text });
  } catch {
    // Best-effort - the webhook must always 200 or Telegram will retry.
  }
}
