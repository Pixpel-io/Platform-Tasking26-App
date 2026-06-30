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

// The display label + avatar source for a DM (the "other" person in a 1:1).
export function dmCounterpart(
  conversation: ConversationWithParticipants,
  meId: string,
): Profile | null {
  const others = conversation.conversation_participants.filter(
    (p) => p.user_id !== meId,
  );
  return others[0]?.profiles ?? null;
}
