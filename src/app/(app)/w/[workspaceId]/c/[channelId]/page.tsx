import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireUser } from "@/lib/auth";
import {
  getChannel,
  getChannelMembers,
  getLastReadAt,
  getMessages,
  getWorkspaceMembersForChat,
} from "@/lib/chat";
import { ChatHeader } from "../../chat/chat-header";
import { ChatRoom } from "../../chat/chat-room";
import { TypingSubtitle } from "../../chat/typing";
import { GroupMembers } from "./group-members";

export default async function ChannelPage({
  params,
}: PageProps<"/w/[workspaceId]/c/[channelId]">) {
  const { workspaceId, channelId } = await params;
  const user = await requireUser();
  const supabase = await createClient();
  const [
    channel,
    profile,
    messages,
    channelMembers,
    workspaceMembers,
    isAdmin,
    lastReadAt,
  ] = await Promise.all([
    getChannel(channelId),
    getProfile(),
    getMessages({ channelId }),
    getChannelMembers(channelId),
    getWorkspaceMembersForChat(workspaceId),
    supabase
      .rpc("is_workspace_admin", { p_workspace_id: workspaceId })
      .then((r) => r.data ?? false),
    getLastReadAt({ channelId }),
  ]);

  if (!channel) notFound();

  // Only the group creator or a workspace admin may add/remove members.
  const canManageMembers = isAdmin || channel.created_by === user.id;

  const meName = profile?.full_name ?? profile?.email ?? "You";

  return (
    <div className="flex h-full flex-col">
      <ChatHeader
        title={channel.name}
        subtitle={
          <TypingSubtitle
            target={{ channelId }}
            fallback={channel.description}
          />
        }
        icon={
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-linear-to-br from-primary/20 to-primary/5 text-base font-semibold text-primary ring-1 ring-inset ring-primary/15">
            #
          </span>
        }
        actions={
          <GroupMembers
            workspaceId={workspaceId}
            channelId={channelId}
            members={channelMembers}
            workspaceMembers={workspaceMembers}
            canManage={canManageMembers}
            creatorId={channel.created_by}
          />
        }
      />
      <div className="min-h-0 flex-1">
        <ChatRoom
          target={{ workspaceId, channelId }}
          meId={user.id}
          meName={meName}
          members={channelMembers}
          initialMessages={messages}
          lastReadAt={lastReadAt}
        />
      </div>
    </div>
  );
}
