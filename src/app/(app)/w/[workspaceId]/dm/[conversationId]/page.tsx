import { notFound } from "next/navigation";
import { getProfile, requireUser } from "@/lib/auth";
import {
  dmCounterpart,
  getConversation,
  getLastReadAt,
  getMessages,
} from "@/lib/chat";
import { isSelfDm } from "@/lib/chat-shared";
import { ChatHeader } from "../../chat/chat-header";
import { ChatRoom } from "../../chat/chat-room";
import { DmHeaderAvatar } from "../../chat/dm-header-avatar";
import { TypingSubtitle } from "../../chat/typing";

export default async function DMPage({
  params,
}: PageProps<"/w/[workspaceId]/dm/[conversationId]">) {
  const { workspaceId, conversationId } = await params;
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
          target={{ workspaceId, conversationId }}
          meId={user.id}
          meName={meName}
          meAvatarUrl={profile?.avatar_url ?? null}
          members={other ? [other] : []}
          initialMessages={messages}
          lastReadAt={lastReadAt}
        />
      </div>
    </div>
  );
}
