import type {
  Conversation,
  Message,
  MessageAttachment,
  MessageReaction,
  Profile,
} from "@/lib/supabase/types";

// The original message an inline reply quotes: just enough to render the
// quote strip (author + snippet), not the full relations. Null when the
// message isn't a reply or the quoted original was deleted.
export type QuotedMessage = Pick<
  Message,
  "id" | "body" | "user_id" | "deleted_at"
> & {
  profiles: Pick<Profile, "id" | "full_name" | "email"> | null;
  message_attachments: Pick<MessageAttachment, "kind">[];
};

export type MessageWithRelations = Message & {
  profiles: Profile | null;
  message_reactions: MessageReaction[];
  message_attachments: MessageAttachment[];
  reply_to: QuotedMessage | null;
};

export type ConversationWithParticipants = Conversation & {
  conversation_participants: { user_id: string; profiles: Profile | null }[];
};

// A channel member's read position, used to render group read receipts.
export type ChannelRead = {
  user_id: string;
  last_read_at: string;
  last_read_message_id: string | null;
};

// One-line preview of a message for the reply banner / quote strip. Falls back
// to an attachment label ("Photo", "Video", …) when there's no text, and caps
// the length so the quote never dominates the row.
export function buildReplySnippet(msg: {
  body: string;
  deleted_at: string | null;
  message_attachments: { kind: string }[];
}): string {
  if (msg.deleted_at) return "Deleted message";
  const text = msg.body.trim().replace(/\s+/g, " ");
  if (text) return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  const att = msg.message_attachments[0];
  if (!att) return "Message";
  const label: Record<string, string> = {
    image: "Photo",
    video: "Video",
    voice: "Voice message",
    file: "Attachment",
  };
  return label[att.kind] ?? "Attachment";
}

// The display label + avatar source for a DM (the "other" person in a 1:1;
// yourself in a self-DM notes space).
export function dmCounterpart(
  conversation: ConversationWithParticipants,
  meId: string,
): Profile | null {
  const others = conversation.conversation_participants.filter(
    (p) => p.user_id !== meId,
  );
  return (
    others[0]?.profiles ??
    conversation.conversation_participants[0]?.profiles ??
    null
  );
}

// A conversation whose only participant is me (Slack-style "message yourself").
export function isSelfDm(
  conversation: ConversationWithParticipants,
  meId: string,
): boolean {
  return conversation.conversation_participants.every(
    (p) => p.user_id === meId,
  );
}
