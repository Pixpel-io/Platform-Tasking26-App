"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth";
import { generateLinkCode } from "@/lib/telegram";

type Result = { error?: string };

// Lightweight poll target - the connect UI hits this every couple of seconds
// while a link code is outstanding, so the moment Telegram runs `/start CODE`
// the page transitions to "Connected" without a manual refresh.
export async function getTelegramStatus(): Promise<{
  externalId: string | null;
  verifiedAt: string | null;
  linkCode: string | null;
  linkCodeExpiresAt: string | null;
  mentionsEnabled: boolean;
  dmsEnabled: boolean;
  groupMessagesEnabled: boolean;
  taskEventsEnabled: boolean;
  lastSentAt: string | null;
} | null> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_notification_channels")
    .select(
      "external_id, verified_at, link_code, link_code_expires_at, mentions_enabled, dms_enabled, group_messages_enabled, task_events_enabled, last_sent_at",
    )
    .eq("user_id", user.id)
    .eq("kind", "telegram")
    .maybeSingle();
  if (!data) return null;
  return {
    externalId: data.external_id,
    verifiedAt: data.verified_at,
    linkCode: data.link_code,
    linkCodeExpiresAt: data.link_code_expires_at,
    mentionsEnabled: data.mentions_enabled,
    dmsEnabled: data.dms_enabled,
    groupMessagesEnabled: data.group_messages_enabled,
    taskEventsEnabled: data.task_events_enabled,
    lastSentAt: data.last_sent_at,
  };
}

// Generate (or rotate) a Telegram link code for the current user. Codes expire
// after 30 minutes; if a fresh unclaimed code exists we return it rather than
// churning through codes when the user just re-opens the settings page.
export async function generateTelegramLinkCode(forceRotate = false): Promise<
  { code: string; expiresAt: string } | Result
> {
  const user = await requireUser();
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("user_notification_channels")
    .select("id, link_code, link_code_expires_at, verified_at")
    .eq("user_id", user.id)
    .eq("kind", "telegram")
    .maybeSingle();

  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  if (existing?.verified_at) {
    return { error: "Telegram is already connected. Disconnect first to relink." };
  }

  if (existing) {
    // Reuse a live code if it isn't expired yet - prevents thrash when the
    // user re-opens the settings page or hits refresh.
    if (
      !forceRotate &&
      existing.link_code &&
      existing.link_code_expires_at &&
      new Date(existing.link_code_expires_at) > new Date()
    ) {
      return { code: existing.link_code, expiresAt: existing.link_code_expires_at };
    }
    const { error } = await supabase
      .from("user_notification_channels")
      .update({ link_code: code, link_code_expires_at: expiresAt })
      .eq("id", existing.id)
      .eq("user_id", user.id);
    if (error) return { error: error.message };
    return { code, expiresAt };
  }

  const { error } = await supabase
    .from("user_notification_channels")
    .insert({
      user_id: user.id,
      kind: "telegram",
      link_code: code,
      link_code_expires_at: expiresAt,
    });
  if (error) return { error: error.message };
  return { code, expiresAt };
}

// Full disconnect: nukes the row so a re-link starts from scratch. Cheaper
// than trying to reason about half-linked states.
export async function disconnectTelegram(
  workspaceId: string,
): Promise<Result> {
  const user = await requireUser();
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("user_notification_channels")
    .delete()
    .eq("user_id", user.id)
    .eq("kind", "telegram");
  if (error) return { error: error.message };
  revalidatePath(`/w/${workspaceId}/settings/notifications`);
  return {};
}

// Toggle a single preference. Kept as one small server action so the UI can
// update each switch independently without a full form roundtrip.
type ChannelPrefKey =
  | "mentions_enabled"
  | "dms_enabled"
  | "group_messages_enabled"
  | "task_events_enabled";

export async function setTelegramPreference(
  workspaceId: string,
  key: ChannelPrefKey,
  value: boolean,
): Promise<Result> {
  const user = await requireUser();
  const supabase = createServiceClient();
  const patch: Partial<Record<ChannelPrefKey, boolean>> = { [key]: value };
  const { error } = await supabase
    .from("user_notification_channels")
    .update(patch)
    .eq("user_id", user.id)
    .eq("kind", "telegram");
  if (error) return { error: error.message };
  revalidatePath(`/w/${workspaceId}/settings/notifications`);
  return {};
}
