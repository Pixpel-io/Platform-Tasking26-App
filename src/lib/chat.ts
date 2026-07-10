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
// must name the sender FK explicitly - otherwise PostgREST can't disambiguate
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
// DMs are global (one thread per pair of people, whatever the workspace) -
// RLS already scopes rows to conversations the user participates in, so no
// workspace filter. The parameter stays for call-site stability/caching.
export const getConversations = cache(
  async (_workspaceId: string): Promise<ConversationWithParticipants[]> => {
    void _workspaceId;
    const supabase = await createClient();
    const { data } = await supabase
      .from("conversations")
      .select(
        "*, conversation_participants(user_id, profiles(*))",
      )
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

// When the current user last read a channel/conversation - null when they
// never opened it. Drives "open at first unread" in the chat room.
export async function getLastReadAt(target: {
  channelId?: string;
  conversationId?: string;
}): Promise<string | null> {
  const user = await requireUser();
  const supabase = await createClient();
  let query = supabase
    .from("read_state")
    .select("last_read_at")
    .eq("user_id", user.id);
  query = target.channelId
    ? query.eq("channel_id", target.channelId)
    : query.eq("conversation_id", target.conversationId ?? "");
  const { data } = await query.maybeSingle();
  return data?.last_read_at ?? null;
}

// Per-conversation unread counts for the current user across all their DMs in
// a workspace: messages newer than their last_read_at (and not their own).
// Returns a map of conversation_id → unread count (omitting zeros).
export const getDmUnreadCounts = cache(
  async (_workspaceId: string): Promise<Record<string, number>> => {
    void _workspaceId;
    const user = await requireUser();
    const supabase = await createClient();

    const { data: convs } = await supabase
      .from("conversations")
      .select("id")
      .is("deleted_at", null);
    const conversationIds = (convs ?? []).map((c) => c.id);
    if (conversationIds.length === 0) return {};

    const { data: reads } = await supabase
      .from("read_state")
      .select("conversation_id, last_read_at")
      .eq("user_id", user.id)
      .in("conversation_id", conversationIds);
    const lastReadByConv = new Map<string, string>();
    for (const r of reads ?? []) {
      if (r.conversation_id)
        lastReadByConv.set(r.conversation_id, r.last_read_at);
    }

    // Pull recent top-level messages from others; tally those after last read.
    const { data: msgs } = await supabase
      .from("messages")
      .select("conversation_id, user_id, created_at")
      .in("conversation_id", conversationIds)
      .is("parent_id", null)
      .is("deleted_at", null)
      .neq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500);

    const counts: Record<string, number> = {};
    for (const m of msgs ?? []) {
      if (!m.conversation_id) continue;
      const lastRead = lastReadByConv.get(m.conversation_id);
      if (lastRead && new Date(m.created_at) <= new Date(lastRead)) continue;
      counts[m.conversation_id] = (counts[m.conversation_id] ?? 0) + 1;
    }
    return counts;
  },
);

// Per-channel unread counts for the current user across all groups they can see
// in a workspace: messages newer than their last_read_at (and not their own).
// Returns a map of channel_id → unread count (omitting zeros).
export const getChannelUnreadCounts = cache(
  async (workspaceId: string): Promise<Record<string, number>> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data: chans } = await supabase
      .from("channels")
      .select("id")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null);
    const channelIds = (chans ?? []).map((c) => c.id);
    if (channelIds.length === 0) return {};

    const { data: reads } = await supabase
      .from("read_state")
      .select("channel_id, last_read_at")
      .eq("user_id", user.id)
      .in("channel_id", channelIds);
    const lastReadByChannel = new Map<string, string>();
    for (const r of reads ?? []) {
      if (r.channel_id) lastReadByChannel.set(r.channel_id, r.last_read_at);
    }

    // Pull recent top-level messages from others; tally those after last read.
    const { data: msgs } = await supabase
      .from("messages")
      .select("channel_id, user_id, created_at")
      .in("channel_id", channelIds)
      .is("parent_id", null)
      .is("deleted_at", null)
      .neq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500);

    const counts: Record<string, number> = {};
    for (const m of msgs ?? []) {
      if (!m.channel_id) continue;
      const lastRead = lastReadByChannel.get(m.channel_id);
      if (lastRead && new Date(m.created_at) <= new Date(lastRead)) continue;
      counts[m.channel_id] = (counts[m.channel_id] ?? 0) + 1;
    }
    return counts;
  },
);

// Everyone the user can DM: members of ANY active workspace they belong to,
// deduped. The common-workspace rule is enforced explicitly (own memberships
// first, then those rosters) rather than via RLS alone - the super-admin
// select policy on workspace_members (0014) can read EVERY roster, which
// would otherwise put people from unshared workspaces in the DM list.
export const getDmContacts = cache(async (): Promise<Profile[]> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: mine } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces!inner(deleted_at)")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .is("workspaces.deleted_at", null);
  const myWorkspaceIds = (mine ?? []).map((m) => m.workspace_id);

  const seen = new Map<string, Profile>();

  if (myWorkspaceIds.length > 0) {
    const { data } = await supabase
      .from("workspace_members")
      .select("profiles(*)")
      .in("workspace_id", myWorkspaceIds)
      .is("deleted_at", null);
    const rows =
      (data as unknown as { profiles: Profile | null }[] | null) ?? [];
    for (const r of rows) {
      if (r.profiles && !seen.has(r.profiles.id)) {
        seen.set(r.profiles.id, r.profiles);
      }
    }
  }

  // Personal DM connections (accepted invites) - people you can message
  // without sharing any workspace.
  const { data: connections } = await supabase
    .from("dm_connections")
    .select("user_a, user_b")
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
  const connectedIds = (connections ?? [])
    .map((c) => (c.user_a === user.id ? c.user_b : c.user_a))
    .filter((id) => !seen.has(id));
  if (connectedIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", connectedIds)
      .is("deleted_at", null);
    for (const p of (profiles as Profile[] | null) ?? []) {
      if (!seen.has(p.id)) seen.set(p.id, p);
    }
  }

  // Drop people this user removed from their DM list (one-sided hide; a new
  // message from them un-hides via trigger).
  const { data: hidden } = await supabase
    .from("dm_hidden_contacts")
    .select("hidden_user_id")
    .eq("user_id", user.id);
  for (const h of hidden ?? []) seen.delete(h.hidden_user_id);

  // And anyone this user has blocked.
  const { data: blocked } = await supabase
    .from("dm_blocks")
    .select("blocked_user_id")
    .eq("user_id", user.id);
  for (const b of blocked ?? []) seen.delete(b.blocked_user_id);

  return [...seen.values()].sort((a, b) =>
    (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email),
  );
});

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

// The people who belong to a group, oldest-joined first.
export const getChannelMembers = cache(
  async (channelId: string): Promise<Profile[]> => {
    await requireUser();
    const supabase = await createClient();
    const { data } = await supabase
      .from("channel_members")
      .select("profiles(*)")
      .eq("channel_id", channelId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    const rows = (data as { profiles: Profile | null }[] | null) ?? [];
    return rows.map((r) => r.profiles).filter((p): p is Profile => p !== null);
  },
);
