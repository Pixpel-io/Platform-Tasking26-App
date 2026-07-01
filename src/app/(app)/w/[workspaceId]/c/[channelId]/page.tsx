import { notFound } from "next/navigation";
import { getProfile, requireUser } from "@/lib/auth";
import {
  getChannel,
  getChannelMembers,
  getMessages,
  getWorkspaceMembersForChat,
} from "@/lib/chat";
import { ChatHeader } from "../../chat/chat-header";
import { ChatRoom } from "../../chat/chat-room";
import { GroupMembers } from "./group-members";

export default async function ChannelPage({
  params,
}: PageProps<"/w/[workspaceId]/c/[channelId]">) {
  const { workspaceId, channelId } = await params;
  const user = await requireUser();
  const [channel, profile, messages, channelMembers, workspaceMembers] =
    await Promise.all([
      getChannel(channelId),
      getProfile(),
      getMessages({ channelId }),
      getChannelMembers(channelId),
      getWorkspaceMembersForChat(workspaceId),
    ]);

  if (!channel) notFound();

  const meName = profile?.full_name ?? profile?.email ?? "You";

  return (
    <div className="flex h-full flex-col">
      <ChatHeader
        title={`# ${channel.name}`}
        subtitle={channel.description ?? undefined}
        icon={<span className="text-muted">#</span>}
        actions={
          <GroupMembers
            workspaceId={workspaceId}
            channelId={channelId}
            members={channelMembers}
            workspaceMembers={workspaceMembers}
          />
        }
      />
      <div className="min-h-0 flex-1">
        <ChatRoom
          target={{ workspaceId, channelId }}
          meId={user.id}
          meName={meName}
          initialMessages={messages}
        />
      </div>
    </div>
  );
}
