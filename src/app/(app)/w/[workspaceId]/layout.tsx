import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyWorkspaces, getProfile, requireUser } from "@/lib/auth";
import {
  getChannelUnreadCounts,
  getChannels,
  getConversations,
  getDmUnreadCounts,
  getWorkspaceMembersForChat,
} from "@/lib/chat";
import { getProjects } from "@/lib/projects";
import { getUnreadNotificationCount } from "@/lib/notifications";
import { PresenceProvider } from "@/components/presence-provider";
import { NotificationToaster } from "@/components/notification-toaster";
import { normalizeColor } from "@/lib/workspace-theme";
import { Sidebar } from "./sidebar";
import { NotificationBell } from "./notification-bell";
import { WorkspaceLoader } from "./workspace-loader";

export default async function WorkspaceLayout({
  children,
  params,
}: LayoutProps<"/w/[workspaceId]">) {
  const { workspaceId } = await params;
  const user = await requireUser();

  // Membership guard — RLS would hide the row anyway, but fail fast + clearly.
  const supabase = await createClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, color")
    .eq("id", workspaceId)
    .is("deleted_at", null)
    .single();

  if (!workspace) notFound();

  const accent = normalizeColor(workspace.color);

  const [
    workspaces,
    profile,
    channels,
    conversations,
    members,
    projects,
    unreadNotifications,
    dmUnreads,
    channelUnreads,
  ] = await Promise.all([
    getMyWorkspaces(),
    getProfile(),
    getChannels(workspaceId),
    getConversations(workspaceId),
    getWorkspaceMembersForChat(workspaceId),
    getProjects(workspaceId),
    getUnreadNotificationCount(workspaceId),
    getDmUnreadCounts(workspaceId),
    getChannelUnreadCounts(workspaceId),
  ]);

  const workspaceName =
    workspaces.find((w) => w.workspace_id === workspaceId)?.workspaces?.name ??
    "Workspace";

  return (
    <PresenceProvider workspaceId={workspaceId} userId={user.id}>
      <WorkspaceLoader name={workspaceName} accent={accent} />
      <div
        className="flex h-screen overflow-hidden"
        style={{ "--primary": accent } as React.CSSProperties}
      >
        <NotificationToaster workspaceId={workspaceId} userId={user.id} />
        <Sidebar
          workspaceId={workspaceId}
          workspaces={workspaces}
          profile={profile}
          userId={user.id}
          channels={channels}
          conversations={conversations}
          members={members}
          projects={projects}
          dmUnreads={dmUnreads}
          channelUnreads={channelUnreads}
        />
        <div className="relative flex-1 overflow-hidden">
          <NotificationBell
            workspaceId={workspaceId}
            userId={user.id}
            initialCount={unreadNotifications}
          />
          <main className="h-full overflow-y-auto bg-background">
            {children}
          </main>
        </div>
      </div>
    </PresenceProvider>
  );
}
