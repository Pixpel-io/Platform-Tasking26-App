import type {
  Conversation,
  Message,
  MessageAttachment,
  MessageReaction,
  Profile,
} from "@/lib/supabase/types";

export type MessageWithRelations = Message & {
  profiles: Profile | null;
  message_reactions: MessageReaction[];
  message_attachments: MessageAttachment[];
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
