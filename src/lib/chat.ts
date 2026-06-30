import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import type { Channel, Profile } from "@/lib/supabase/types";
import {
  dmCounterpart,
  type ConversationWithParticipants,
  type MessageWithRelations,
} from "@/lib/chat-shared";

export { dmCounterpart };
export type { ConversationWithParticipants, MessageWithRelations };

// `messages` has two FKs to profiles (user_id and pinned_by), so the embed
// must name the sender FK explicitly — otherwise PostgREST can't disambiguate
// and the join resolves to null ("Unknown" sender).
const MESSAGE_SELECT =
  "*, profiles:profiles!messages_user_id_fkey(*), message_reactions(*), message_attachments(*)";

// Channels the current user can see in a workspace (public + private they're in).
export const getChannels = cache(
  async (workspaceId: string): Promise<Channel[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("channels")
      .select("*")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    return data ?? [];
  },
);

// 1:1 + group DMs the current user participates in, with the other people.
export const getConversations = cache(
  async (workspaceId: string): Promise<ConversationWithParticipants[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("conversations")
      .select(
        "*, conversation_participants(user_id, profiles(*))",
      )
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    return (data as ConversationWithParticipants[] | null) ?? [];
  },
);

export async function getChannel(
  channelId: string,
): Promise<Channel | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("channels")
    .select("*")
    .eq("id", channelId)
    .is("deleted_at", null)
    .single();
  return data;
}

export async function getConversation(
  conversationId: string,
): Promise<ConversationWithParticipants | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select("*, conversation_participants(user_id, profiles(*))")
    .eq("id", conversationId)
    .is("deleted_at", null)
    .single();
  return (data as ConversationWithParticipants | null) ?? null;
}

// Top-level messages (no thread parent) for a channel or conversation, oldest first.
export async function getMessages(opts: {
  channelId?: string;
  conversationId?: string;
  limit?: number;
}): Promise<MessageWithRelations[]> {
  const supabase = await createClient();
  let query = supabase
    .from("messages")
    .select(MESSAGE_SELECT)
    .is("parent_id", null)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);

  if (opts.channelId) query = query.eq("channel_id", opts.channelId);
  if (opts.conversationId)
    query = query.eq("conversation_id", opts.conversationId);

  const { data } = await query;
  const rows = (data as MessageWithRelations[] | null) ?? [];
  return rows.reverse();
}

// Replies to a single parent message (a thread), oldest first.
export async function getThreadReplies(
  parentId: string,
): Promise<MessageWithRelations[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("parent_id", parentId)
    .order("created_at", { ascending: true });
  return (data as MessageWithRelations[] | null) ?? [];
}

export const getWorkspaceMembersForChat = cache(
  async (workspaceId: string): Promise<Profile[]> => {
    await requireUser();
    const supabase = await createClient();
    const { data } = await supabase
      .from("workspace_members")
      .select("profiles(*)")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null);
    const rows = (data as { profiles: Profile | null }[] | null) ?? [];
    return rows.map((r) => r.profiles).filter((p): p is Profile => p !== null);
  },
);
