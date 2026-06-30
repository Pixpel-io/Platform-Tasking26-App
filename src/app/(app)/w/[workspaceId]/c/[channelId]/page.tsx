import { notFound } from "next/navigation";
import { getProfile, requireUser } from "@/lib/auth";
import { getChannel, getMessages } from "@/lib/chat";
import { ChatHeader } from "../../chat/chat-header";
import { ChatRoom } from "../../chat/chat-room";

export default async function ChannelPage({
  params,
}: PageProps<"/w/[workspaceId]/c/[channelId]">) {
  const { workspaceId, channelId } = await params;
  const user = await requireUser();
  const [channel, profile, messages] = await Promise.all([
    getChannel(channelId),
    getProfile(),
    getMessages({ channelId }),
  ]);

  if (!channel) notFound();

  const meName = profile?.full_name ?? profile?.email ?? "You";

  return (
    <div className="flex h-full flex-col">
      <ChatHeader
        title={`# ${channel.name}`}
        subtitle={channel.description ?? undefined}
        icon={<span className="text-muted">#</span>}
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
