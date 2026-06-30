import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyWorkspaces, getProfile, requireUser } from "@/lib/auth";
import {
  getChannels,
  getConversations,
  getWorkspaceMembersForChat,
} from "@/lib/chat";
import { getProjects } from "@/lib/projects";
import { getUnreadNotificationCount } from "@/lib/notifications";
import { PresenceProvider } from "@/components/presence-provider";
import { normalizeColor } from "@/lib/workspace-theme";
import { Sidebar } from "./sidebar";

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
  ] = await Promise.all([
    getMyWorkspaces(),
    getProfile(),
    getChannels(workspaceId),
    getConversations(workspaceId),
    getWorkspaceMembersForChat(workspaceId),
    getProjects(workspaceId),
    getUnreadNotificationCount(workspaceId),
  ]);

  return (
    <PresenceProvider workspaceId={workspaceId} userId={user.id}>
      <div
        className="flex h-screen overflow-hidden"
        style={{ "--primary": accent } as React.CSSProperties}
      >
        <Sidebar
          workspaceId={workspaceId}
          workspaces={workspaces}
          profile={profile}
          userId={user.id}
          channels={channels}
          conversations={conversations}
          members={members}
          projects={projects}
          unreadNotifications={unreadNotifications}
        />
        <main className="flex-1 overflow-y-auto bg-background">{children}</main>
      </div>
    </PresenceProvider>
  );
}
