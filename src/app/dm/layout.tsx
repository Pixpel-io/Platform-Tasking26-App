import Link from "next/link";
import { getProfile, requireUser } from "@/lib/auth";
import { getMyWorkspaces } from "@/lib/auth";
import { getConversations, getDmContacts } from "@/lib/chat";
import { ThemeToggle } from "@/components/theme-toggle";
import { PresenceProvider } from "@/components/presence-provider";
import { TypingProvider } from "@/app/(app)/w/[workspaceId]/chat/typing";
import { DmShellSidebar } from "./dm-shell-sidebar";

// Global DM shell: chat without any workspace. Serves DM-invited users who
// belong to zero workspaces (Juan's model - DMs are personal, workspaces are
// for boards). Members with workspaces get a link back into them.
export default async function DmShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [profile, contacts, conversations, workspaces] = await Promise.all([
    getProfile(),
    getDmContacts(),
    getConversations(""),
    getMyWorkspaces(),
  ]);

  const meName = profile?.full_name ?? profile?.email ?? "You";
  const firstWorkspaceId = workspaces[0]?.workspace_id ?? null;

  return (
    <PresenceProvider userId={user.id}>
    <TypingProvider meId={user.id} meName={meName}>
      <div className="flex h-dvh overflow-hidden bg-background">
        <DmShellSidebar
          userId={user.id}
          profile={profile}
          contacts={contacts}
          conversations={conversations}
          firstWorkspaceId={firstWorkspaceId}
        />
        <div className="relative min-w-0 flex-1">
          <div className="absolute right-4 top-3 z-30">
            <ThemeToggle />
          </div>
          <main className="h-full overflow-y-auto">{children}</main>
        </div>
      </div>
      {firstWorkspaceId === null && (
        <p className="sr-only">
          <Link href="/onboarding">Create a workspace</Link>
        </p>
      )}
    </TypingProvider>
    </PresenceProvider>
  );
}
