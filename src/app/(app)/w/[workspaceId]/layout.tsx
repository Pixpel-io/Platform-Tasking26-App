import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyWorkspaces, getProfile, requireUser } from "@/lib/auth";
import {
  getChannels,
  getConversations,
  getWorkspaceMembersForChat,
} from "@/lib/chat";
import { getProjects } from "@/lib/projects";
import { PresenceProvider } from "@/components/presence-provider";
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
    .select("id")
    .eq("id", workspaceId)
    .is("deleted_at", null)
    .single();

  if (!workspace) notFound();

  const [workspaces, profile, channels, conversations, members, projects] =
    await Promise.all([
      getMyWorkspaces(),
      getProfile(),
      getChannels(workspaceId),
      getConversations(workspaceId),
      getWorkspaceMembersForChat(workspaceId),
      getProjects(workspaceId),
    ]);

  return (
    <PresenceProvider workspaceId={workspaceId} userId={user.id}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          workspaceId={workspaceId}
          workspaces={workspaces}
          profile={profile}
          userId={user.id}
          channels={channels}
          conversations={conversations}
          members={members}
          projects={projects}
        />
        <main className="flex-1 overflow-y-auto bg-background">{children}</main>
      </div>
    </PresenceProvider>
  );
}
