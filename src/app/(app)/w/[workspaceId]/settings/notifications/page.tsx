import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { SettingsTabs } from "../settings-tabs";
import { TelegramConnectionCard } from "./telegram-connection";

export default async function NotificationsSettingsPage({
  params,
}: PageProps<"/w/[workspaceId]/settings/notifications">) {
  const { workspaceId } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: telegram } = await supabase
    .from("user_notification_channels")
    .select(
      "id, external_id, link_code, link_code_expires_at, verified_at, mentions_enabled, dms_enabled, group_messages_enabled, task_events_enabled, last_sent_at",
    )
    .eq("user_id", user.id)
    .eq("kind", "telegram")
    .maybeSingle();

  const rawBotUsername = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "")
    .trim()
    .replace(/^@/, "");
  const botUsername = /^[A-Za-z0-9_]{5,32}$/.test(rawBotUsername)
    ? rawBotUsername
    : "";

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">
          Notifications
        </h1>
        <p className="mt-1 text-muted">
          Forward mentions, DMs, and group messages to another channel.
        </p>
      </header>
      <SettingsTabs base={`/w/${workspaceId}/settings`} />
      <TelegramConnectionCard
        userId={user.id}
        workspaceId={workspaceId}
        botUsername={botUsername}
        connection={telegram ?? null}
      />
    </div>
  );
}
