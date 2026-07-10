import { notFound } from "next/navigation";
import { getProfile, requireUser } from "@/lib/auth";
import {
  dmCounterpart,
  getConversation,
  getLastReadAt,
  getMessages,
} from "@/lib/chat";
import { isSelfDm } from "@/lib/chat-shared";
import { ChatHeader } from "@/app/(app)/w/[workspaceId]/chat/chat-header";
import { ChatRoom } from "@/app/(app)/w/[workspaceId]/chat/chat-room";
import { DmHeaderAvatar } from "@/app/(app)/w/[workspaceId]/chat/dm-header-avatar";
import { TypingSubtitle } from "@/app/(app)/w/[workspaceId]/chat/typing";

// A DM opened in the global shell (no workspace): same ChatRoom, null
// workspace target - text-only composer, no workspace-scoped extras.
export default async function GlobalDmPage({
  params,
}: PageProps<"/dm/[conversationId]">) {
  const { conversationId } = await params;
  const user = await requireUser();
  const [conversation, profile, messages, lastReadAt] = await Promise.all([
    getConversation(conversationId),
    getProfile(),
    getMessages({ conversationId }),
    getLastReadAt({ conversationId }),
  ]);

  if (!conversation) notFound();

  const other = dmCounterpart(conversation, user.id);
  const self = isSelfDm(conversation, user.id);
  const meName = profile?.full_name ?? profile?.email ?? "You";
  const title = self
    ? `${meName} (you)`
    : (other?.full_name ?? other?.email ?? "Direct message");

  return (
    <div className="flex h-full flex-col">
      <ChatHeader
        title={title}
        subtitle={
          self ? (
            "Your space - jot notes, drafts and reminders."
          ) : (
            <TypingSubtitle
              target={{ conversationId }}
              fallback={other?.email}
            />
          )
        }
        icon={other ? <DmHeaderAvatar profile={other} /> : undefined}
      />
      <div className="min-h-0 flex-1">
        <ChatRoom
          target={{ workspaceId: null, conversationId }}
          meId={user.id}
          meName={meName}
          members={other ? [other] : []}
          initialMessages={messages}
          lastReadAt={lastReadAt}
        />
      </div>
    </div>
  );
}
