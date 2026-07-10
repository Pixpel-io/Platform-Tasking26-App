"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { ConversationWithParticipants } from "@/lib/chat-shared";
import { dmCounterpart } from "@/lib/chat-shared";
import type { Profile } from "@/lib/supabase/types";
import { Avatar } from "@/components/avatar";
import { StatusDialog, activeStatus } from "@/components/status-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { hideDmContact, openDirectMessageGlobal } from "@/app/(app)/w/[workspaceId]/chat-actions";
import { DmInviteDialog } from "@/app/(app)/w/[workspaceId]/dm-invite-dialog";
import { SidebarRowMeta } from "@/app/(app)/w/[workspaceId]/chat/typing";
import { signOut } from "@/app/(auth)/actions";
import { useHiddenContacts } from "@/lib/use-hidden-contacts";
import { useDmRoster } from "@/lib/use-dm-roster";

function Icon({ d, className = "h-4 w-4 shrink-0" }: { d: string; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

// Sidebar for the global /dm shell - DM contacts only, no workspace nav.
export function DmShellSidebar({
  userId,
  profile,
  contacts,
  conversations,
  firstWorkspaceId,
}: {
  userId: string;
  profile: Profile | null;
  contacts: Profile[];
  conversations: ConversationWithParticipants[];
  firstWorkspaceId: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Profile | null>(null);
  const [, startTransition] = useTransition();
  useHiddenContacts(userId);
  useDmRoster(userId);

  const dmList = useMemo(() => {
    const convByUser = new Map<string, string>();
    for (const conv of conversations) {
      const other = dmCounterpart(conv, userId);
      if (other && !convByUser.has(other.id)) {
        convByUser.set(other.id, conv.id);
      }
    }
    const me = contacts.find((m) => m.id === userId);
    return [
      ...(me ? [{ member: me, isSelf: true }] : []),
      ...contacts
        .filter((m) => m.id !== userId)
        .map((member) => ({ member, isSelf: false })),
    ].map((row) => ({
      ...row,
      conversationId: convByUser.get(row.member.id) ?? null,
    }));
  }, [contacts, conversations, userId]);

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-linear-to-b from-surface to-background/60">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-border/70 p-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-linear-to-br from-primary to-primary/60 text-primary-foreground shadow-sm shadow-primary/30">
          <Icon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">
            Direct messages
          </span>
          <span className="block text-[11px] text-muted">TasKing</span>
        </span>
        <button
          onClick={() => setInviteOpen(true)}
          aria-label="Invite someone to message"
          title="Invite someone to message"
          className="ml-auto grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted transition-colors hover:bg-primary/15 hover:text-primary"
        >
          <Icon d="M12 5v14M5 12h14" className="h-4 w-4" />
        </button>
      </div>

      {/* Contacts */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {dmList.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted/60">
            No conversations yet. Invite someone with the + button.
          </p>
        )}
        {dmList.map(({ member, conversationId, isSelf }) => {
          const label = member.full_name ?? member.email;
          const href = conversationId ? `/dm/${conversationId}` : null;
          const active = href != null && pathname === href;
          const className = `group/dmrow relative flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-1.5 text-left text-sm transition-all duration-150 ${
            active
              ? "bg-primary/10 font-medium text-primary"
              : "text-muted hover:translate-x-0.5 hover:bg-surface-2 hover:text-foreground"
          }`;
          const inner = (
            <>
              {active && (
                <span className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
              )}
              <Avatar
                name={member.full_name}
                email={member.email}
                avatarUrl={member.avatar_url}
                size="xs"
              />
              <span className="min-w-0 flex-1 truncate">
                {label}
                {isSelf && <span className="ml-1 text-muted">(you)</span>}
                {activeStatus(member)?.emoji && (
                  <span className="ml-1.5">{activeStatus(member)?.emoji}</span>
                )}
              </span>
              {conversationId && (
                <SidebarRowMeta target={{ conversationId }} unread={0} />
              )}
              {!isSelf && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setRemoveTarget(member);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      setRemoveTarget(member);
                    }
                  }}
                  aria-label={`Remove ${label} from your DMs`}
                  title="Remove from your DMs (they can still message you)"
                  className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-md text-muted opacity-0 transition-all hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover/dmrow:opacity-100"
                >
                  <Icon d="M18 6 6 18M6 6l12 12" className="h-3 w-3" />
                </span>
              )}
            </>
          );
          return href ? (
            <Link key={member.id} href={href} className={className}>
              {inner}
            </Link>
          ) : (
            <button
              key={member.id}
              onClick={() =>
                startTransition(() => {
                  void openDirectMessageGlobal(member.id);
                })
              }
              className={className}
            >
              {inner}
            </button>
          );
        })}
      </nav>

      {/* Workspace link / onboarding */}
      <div className="border-t border-border/70 p-3">
        {firstWorkspaceId ? (
          <button
            onClick={() => router.push(`/w/${firstWorkspaceId}`)}
            className="flex w-full cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Icon d="M3 12l9-9 9 9M5 10v10h14V10" className="h-4 w-4" />
            Back to your workspace
          </button>
        ) : (
          <Link
            href="/onboarding"
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-primary/40 px-3 py-2 text-sm text-primary transition-colors hover:bg-primary/10"
          >
            <Icon d="M12 5v14M5 12h14" className="h-4 w-4" />
            Create a workspace
          </Link>
        )}

        {/* Profile row */}
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 px-1 py-1">
            <Avatar
              name={profile?.full_name}
              email={profile?.email}
              avatarUrl={profile?.avatar_url}
              size="sm"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">
                {profile?.full_name ?? "Me"}
              </span>
              <span className="block truncate text-xs text-muted">
                {(profile && activeStatus(profile)?.text) ?? profile?.email}
              </span>
            </span>
          </span>
          <span className="flex items-center">
            {profile && (
              <button
                onClick={() => setStatusOpen(true)}
                aria-label="Set a status"
                title="Set a status"
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                {activeStatus(profile)?.emoji ?? (
                  <Icon d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
                )}
              </button>
            )}
            <form action={signOut}>
              <button
                type="submit"
                aria-label="Sign out"
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-danger"
              >
                <Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </button>
            </form>
          </span>
        </div>
      </div>

      <DmInviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />

      {removeTarget && (
        <ConfirmDialog
          title={`Remove ${removeTarget.full_name ?? removeTarget.email} from your DMs?`}
          description="This only hides them from your list - your chat history stays, they aren't notified, and they reappear if either of you messages again."
          confirmLabel="Remove"
          onConfirm={() => {
            const id = removeTarget.id;
            setRemoveTarget(null);
            startTransition(() => {
              void hideDmContact(id);
              router.refresh();
            });
          }}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
      {statusOpen && profile && (
        <StatusDialog profile={profile} onClose={() => setStatusOpen(false)} />
      )}
    </aside>
  );
}
