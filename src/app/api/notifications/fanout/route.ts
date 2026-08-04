// =============================================================================
// Notifications fanout - dispatches newly inserted notifications to a user's
// external channels (currently only Telegram).
//
// Triggered by a Supabase Database Webhook on `notifications` INSERT (configure
// once in the Supabase dashboard - see the setup section in
// 0055_user_notification_channels.sql). The webhook posts a payload shaped like:
//   { type: "INSERT", table: "notifications", record: { id, user_id, ... } }
//
// Auth: we require the `x-fanout-secret` header to match FANOUT_SECRET. The
// service-role client is used to read the notification with joins and to
// disable a channel if Telegram returns 403 (user blocked the bot).
// =============================================================================

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  formatNotificationForTelegram,
  shouldForwardToChannel,
  type FanoutNotification,
} from "@/lib/notifications-telegram";
import { sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WebhookPayload = {
  type?: string;
  table?: string;
  record?: { id?: string; user_id?: string };
};

export async function POST(req: Request) {
  const expected = process.env.FANOUT_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "FANOUT_SECRET not configured" },
      { status: 500 },
    );
  }
  const secret = req.headers.get("x-fanout-secret");
  if (secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    // Nothing to do without the bot token; return 2xx so Supabase doesn't
    // retry indefinitely.
    return NextResponse.json({ ok: true, skipped: "no_bot_token" });
  }

  let body: WebhookPayload;
  try {
    body = (await req.json()) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  if (body.type !== "INSERT" || body.table !== "notifications") {
    return NextResponse.json({ ok: true, skipped: "wrong_event" });
  }
  const notificationId = body.record?.id;
  const userId = body.record?.user_id;
  if (!notificationId || !userId) {
    return NextResponse.json({ ok: true, skipped: "missing_ids" });
  }

  const supabase = createServiceClient();

  // Only fetch enabled telegram channels first - skip everything if the user
  // hasn't linked. Cheaper than always loading the notification join.
  const { data: channels, error: channelErr } = await supabase
    .from("user_notification_channels")
    .select(
      "id, external_id, mentions_enabled, dms_enabled, group_messages_enabled, task_events_enabled",
    )
    .eq("user_id", userId)
    .eq("kind", "telegram")
    .not("external_id", "is", null)
    .not("verified_at", "is", null);

  if (channelErr) {
    return NextResponse.json({ error: channelErr.message }, { status: 500 });
  }
  if (!channels || channels.length === 0) {
    return NextResponse.json({ ok: true, skipped: "no_channels" });
  }

  const { data: notification, error: nErr } = await supabase
    .from("notifications")
    .select(
      "id, type, title, body, workspace_id, channel_id, conversation_id, project_id, task_id, actor_id, workspace:workspaces(name), channel:channels(name), actor:profiles!notifications_actor_id_fkey(full_name, email)",
    )
    .eq("id", notificationId)
    .maybeSingle();

  if (nErr || !notification) {
    return NextResponse.json({ ok: true, skipped: "notification_gone" });
  }
  const typed = notification as unknown as FanoutNotification;

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const message = formatNotificationForTelegram(typed, siteUrl);

  // Deliver in parallel - one bad channel shouldn't hold up the others.
  const results = await Promise.allSettled(
    channels.map(async (ch) => {
      if (!ch.external_id) return { skipped: true };
      const prefs = {
        mentions_enabled: ch.mentions_enabled,
        dms_enabled: ch.dms_enabled,
        group_messages_enabled: ch.group_messages_enabled,
        task_events_enabled: ch.task_events_enabled,
      };
      if (!shouldForwardToChannel(typed, prefs)) return { skipped: true };
      try {
        await sendTelegramMessage({
          chatId: ch.external_id,
          text: message.text,
          action: message.action,
        });
        await supabase
          .from("user_notification_channels")
          .update({ last_sent_at: new Date().toISOString() })
          .eq("id", ch.id);
        return { sent: true };
      } catch (err) {
        const e = err as { telegramCode?: number };
        // 403 = user blocked the bot. Disable delivery so we stop hammering.
        if (e.telegramCode === 403) {
          await supabase
            .from("user_notification_channels")
            .update({
              mentions_enabled: false,
              dms_enabled: false,
              group_messages_enabled: false,
              task_events_enabled: false,
              verified_at: null,
              external_id: null,
            })
            .eq("id", ch.id);
        }
        throw err;
      }
    }),
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  return NextResponse.json({ ok: true, sent, failed });
}
