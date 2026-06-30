import { notFound } from "next/navigation";
import { getProfile, requireUser } from "@/lib/auth";
import {
  dmCounterpart,
  getConversation,
  getMessages,
} from "@/lib/chat";
import { ChatHeader } from "../../chat/chat-header";
import { ChatRoom } from "../../chat/chat-room";

export default async function DMPage({
  params,
}: PageProps<"/w/[workspaceId]/dm/[conversationId]">) {
  const { workspaceId, conversationId } = await params;
  const user = await requireUser();
  const [conversation, profile] = await Promise.all([
    getConversation(conversationId),
    getProfile(),
  ]);

  if (!conversation) notFound();

  const messages = await getMessages({ conversationId });
  const other = dmCounterpart(conversation, user.id);
  const meName = profile?.full_name ?? profile?.email ?? "You";
  const title = other?.full_name ?? other?.email ?? "Direct message";

  return (
    <div className="flex h-full flex-col">
      <ChatHeader
        title={title}
        subtitle={other?.email ?? undefined}
        icon={
          <span className="grid h-7 w-7 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-foreground">
            {(other?.full_name ?? other?.email ?? "?")[0]?.toUpperCase()}
          </span>
        }
      />
      <div className="min-h-0 flex-1">
        <ChatRoom
          target={{ workspaceId, conversationId }}
          meId={user.id}
          meName={meName}
          initialMessages={messages}
        />
      </div>
    </div>
  );
}
