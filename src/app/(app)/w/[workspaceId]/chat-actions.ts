"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { CLEOTILDA_HANDLE, respondAsCleotilda } from "@/lib/cleotilda";

type ChatResult = { error?: string };

// -- Groups ------------------------------------------------------------------

export async function createChannel(
  workspaceId: string,
  _prev: ChatResult | undefined,
  formData: FormData,
): Promise<ChatResult> {
  await requireUser();
  const name = String(formData.get("name") ?? "")
    .trim()
    .replace(/^#/, "")
    .toLowerCase()
    .replace(/\s+/g, "-");
  const description = String(formData.get("description") ?? "").trim();
  const memberIds = formData
    .getAll("memberIds")
    .map((v) => String(v))
    .filter(Boolean);

  if (name.length < 2) {
    return { error: "Group name must be at least 2 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_channel", {
    p_workspace_id: workspaceId,
    p_name: name,
    p_description: description || undefined,
    p_member_ids: memberIds,
  });

  if (error) return { error: error.message };

  revalidatePath(`/w/${workspaceId}`, "layout");
  redirect(`/w/${workspaceId}/c/${data}`);
}

// Rename a group (and optionally its description). RLS restricts channel
// updates to the creator or a workspace admin, so this no-ops for others.
export async function renameChannel(
  workspaceId: string,
  channelId: string,
  name: string,
  description?: string | null,
): Promise<ChatResult> {
  await requireUser();
  const clean = name.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-");
  if (clean.length < 2) {
    return { error: "Group name must be at least 2 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channels")
    .update({
      name: clean,
      ...(description !== undefined
        ? { description: description?.trim() || null }
        : {}),
    })
    .eq("id", channelId)
    .select("id");

  if (error) return { error: error.message };
  // RLS silently filters rows the caller can't update - surface that clearly.
  if (!data || data.length === 0) {
    return { error: "Only the group creator or a workspace admin can rename it." };
  }

  revalidatePath(`/w/${workspaceId}`, "layout");
  return {};
}

// Add existing workspace members to a group (creator/admin only - enforced in
// the RPC and RLS).
export async function addGroupMembers(
  workspaceId: string,
  channelId: string,
  memberIds: string[],
): Promise<ChatResult> {
  await requireUser();
  if (memberIds.length === 0) return {};
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_channel_members", {
    p_channel_id: channelId,
    p_member_ids: memberIds,
  });
  if (error) return { error: error.message };
  revalidatePath(`/w/${workspaceId}`, "layout");
  return {};
}

// Remove a member from a group (creator/admin only - enforced in the RPC and
// RLS). The group creator can't be removed.
export async function removeGroupMember(
  workspaceId: string,
  channelId: string,
  memberId: string,
): Promise<ChatResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_channel_member", {
    p_channel_id: channelId,
    p_member_id: memberId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/w/${workspaceId}`, "layout");
  return {};
}

// -- DMs ---------------------------------------------------------------------

// Open (or create) a DM from the global /dm shell - no workspace context.
// get_or_create_dm's p_workspace_id is unused post-0026 but kept for the
// signature; pass the caller's id (any uuid satisfies it).
export async function openDirectMessageGlobal(otherUserId: string) {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_or_create_dm", {
    p_workspace_id: user.id,
    p_other_user_id: otherUserId,
  });
  if (error) return { error: error.message };
  revalidatePath("/dm", "layout");
  redirect(`/dm/${data}`);
}

export async function openDirectMessage(
  workspaceId: string,
  otherUserId: string,
) {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_or_create_dm", {
    p_workspace_id: workspaceId,
    p_other_user_id: otherUserId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/w/${workspaceId}`, "layout");
  redirect(`/w/${workspaceId}/dm/${data}`);
}

// -- Messages ----------------------------------------------------------------

const MENTION_RE = /@([a-zA-Z0-9._-]+)/g;

export type PendingAttachment = {
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  kind: "file" | "image" | "video" | "voice";
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
};

export async function sendMessage(args: {
  // Null for global DMs opened outside any workspace (the /dm shell).
  workspaceId: string | null;
  channelId?: string;
  conversationId?: string;
  parentId?: string;
  body: string;
  attachments?: PendingAttachment[];
}): Promise<ChatResult & { id?: string }> {
  const user = await requireUser();
  const body = args.body.trim();
  const attachments = args.attachments ?? [];
  if (!body && attachments.length === 0) {
    return { error: "Message is empty." };
  }
  if (body.length > 8000) return { error: "Message is too long." };

  const supabase = await createClient();
  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      workspace_id: args.workspaceId ?? null,
      channel_id: args.channelId ?? null,
      conversation_id: args.conversationId ?? null,
      parent_id: args.parentId ?? null,
      user_id: user.id,
      body,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (attachments.length > 0) {
    const { error: attachErr } = await supabase
      .from("message_attachments")
      .insert(
        attachments.map((a) => ({
          message_id: message.id,
          storage_path: a.storagePath,
          file_name: a.fileName,
          mime_type: a.mimeType,
          size_bytes: a.sizeBytes,
          kind: a.kind,
          width: a.width ?? null,
          height: a.height ?? null,
          duration_ms: a.durationMs ?? null,
        })),
      );
    if (attachErr) return { error: attachErr.message };
  }

  // Resolve @mentions against workspace members and record them.
  const handles = [...body.matchAll(MENTION_RE)].map((m) => m[1].toLowerCase());
  if (handles.length > 0 && args.workspaceId) {
    const { data: members } = await supabase
      .from("workspace_members")
      .select("user_id, profiles(email, full_name)")
      .eq("workspace_id", args.workspaceId)
      .is("deleted_at", null);

    const rows =
      (members as
        | { user_id: string; profiles: { email: string; full_name: string | null } | null }[]
        | null) ?? [];

    const matchedIds = new Set<string>();
    for (const r of rows) {
      const emailLocal = r.profiles?.email?.split("@")[0]?.toLowerCase() ?? "";
      const nameHandle =
        r.profiles?.full_name?.toLowerCase().replace(/\s+/g, "") ?? "";
      if (
        handles.some(
          (h) => h === emailLocal || h === nameHandle || nameHandle.startsWith(h),
        )
      ) {
        matchedIds.add(r.user_id);
      }
    }

    if (matchedIds.size > 0) {
      await supabase.from("message_mentions").insert(
        [...matchedIds].map((id) => ({
          message_id: message.id,
          mentioned_id: id,
        })),
      );
    }
  }

  // @cleotilda summons the AI assistant. Awaited so the serverless action
  // isn't frozen mid-reply, but failures never affect the user's message.
  if (handles.includes(CLEOTILDA_HANDLE) && !args.parentId && args.workspaceId) {
    const { data: me } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();
    await respondAsCleotilda({
      target: {
        workspaceId: args.workspaceId,
        channelId: args.channelId,
        conversationId: args.conversationId,
      },
      userId: user.id,
      userName: me?.full_name ?? me?.email ?? "Someone",
      prompt: body,
    });
  }

  return { id: message.id };
}

export async function editMessage(
  messageId: string,
  body: string,
): Promise<ChatResult> {
  await requireUser();
  const trimmed = body.trim();
  if (!trimmed) return { error: "Message is empty." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("messages")
    .update({ body: trimmed, edited_at: new Date().toISOString() })
    .eq("id", messageId);
  if (error) return { error: error.message };
  return {};
}

export async function deleteMessage(messageId: string): Promise<ChatResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString(), body: "" })
    .eq("id", messageId);
  if (error) return { error: error.message };
  return {};
}

export async function togglePin(
  messageId: string,
  pinned: boolean,
): Promise<ChatResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("messages")
    .update({
      pinned_at: pinned ? new Date().toISOString() : null,
      pinned_by: pinned ? user.id : null,
    })
    .eq("id", messageId);
  if (error) return { error: error.message };
  return {};
}

// -- Reactions ---------------------------------------------------------------

export async function toggleReaction(
  messageId: string,
  emoji: string,
): Promise<ChatResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("message_reactions")
    .select("id")
    .eq("message_id", messageId)
    .eq("user_id", user.id)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    await supabase.from("message_reactions").delete().eq("id", existing.id);
  } else {
    const { error } = await supabase
      .from("message_reactions")
      .insert({ message_id: messageId, user_id: user.id, emoji });
    if (error) return { error: error.message };
  }
  return {};
}

// -- Read state --------------------------------------------------------------

export async function markRead(args: {
  channelId?: string;
  conversationId?: string;
  lastMessageId?: string;
}): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const now = new Date().toISOString();

  // read_state uses partial unique indexes (one per target type), which
  // PostgREST upsert can't infer - so select-then-update/insert manually.
  let existingQuery = supabase
    .from("read_state")
    .select("id")
    .eq("user_id", user.id);
  existingQuery = args.channelId
    ? existingQuery.eq("channel_id", args.channelId)
    : existingQuery.eq("conversation_id", args.conversationId ?? "");

  const { data: existing } = await existingQuery.maybeSingle();

  if (existing) {
    await supabase
      .from("read_state")
      .update({ last_read_at: now, last_read_message_id: args.lastMessageId ?? null })
      .eq("id", existing.id);
  } else {
    await supabase.from("read_state").insert({
      user_id: user.id,
      channel_id: args.channelId ?? null,
      conversation_id: args.conversationId ?? null,
      last_read_at: now,
      last_read_message_id: args.lastMessageId ?? null,
    });
  }

  // Reading the room also clears its notifications (dm/mention/group ones
  // pointing at this conversation or channel) so the bell badge drops without
  // a separate visit to the notifications page. The realtime UPDATE event
  // makes every open tab recount.
  let clear = supabase
    .from("notifications")
    .update({ read_at: now })
    .eq("user_id", user.id)
    .is("read_at", null);
  clear = args.channelId
    ? clear.eq("channel_id", args.channelId)
    : clear.eq("conversation_id", args.conversationId ?? "");
  await clear;
}
