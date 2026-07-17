"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { MembershipWithWorkspace } from "@/lib/auth";
import type { ConversationWithParticipants } from "@/lib/chat-shared";
import { dmCounterpart } from "@/lib/chat-shared";
import type { Channel, Profile } from "@/lib/supabase/types";
import type { ProjectWithMembers } from "@/lib/projects-shared";
import { Avatar } from "@/components/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { StatusDialog, activeStatus } from "@/components/status-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { usePresence } from "@/components/presence-provider";
import { useDmActivity } from "@/lib/use-dm-activity";
import { useDmUnreads } from "@/lib/use-dm-unreads";
import { useWorkspaceUnreads } from "@/lib/use-workspace-unreads";
import { useChannelUnreads } from "@/lib/use-channel-unreads";
import { useProjectUnreads } from "@/lib/use-project-unreads";
import { setFaviconBadge, setTitleUnread } from "@/lib/favicon-badge";
import { useLiveMembers } from "@/lib/use-live-members";
import { useGroupMembership } from "@/lib/use-group-membership";
import { useHiddenContacts } from "@/lib/use-hidden-contacts";
import { useDmRoster } from "@/lib/use-dm-roster";
import { signOut } from "@/app/(auth)/actions";
import { hideDmContact, openDirectMessage } from "./chat-actions";
import { SidebarRowMeta } from "./chat/typing";
import { CreateChannelDialog } from "./create-channel-dialog";
import { DmInviteDialog } from "./dm-invite-dialog";
import { WorkspaceSplash } from "./workspace-loader";

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

function PresenceDot({ userId, className = "" }: { userId: string; className?: string }) {
  const online = usePresence(userId);
  return (
    <span
      className={`h-2 w-2 rounded-full ${online ? "bg-success" : "bg-muted/40"} ${className}`}
    />
  );
}

export function Sidebar({
  workspaceId,
  workspaces,
  profile,
  userId,
  channels,
  conversations,
  members: initialMembers,
  projects,
  dmContacts: initialDmContacts,
  dmUnreads,
  channelUnreads,
  workspaceUnreads,
  projectUnreads,
}: {
  workspaceId: string;
  workspaces: MembershipWithWorkspace[];
  profile: Profile | null;
  userId: string;
  channels: Channel[];
  conversations: ConversationWithParticipants[];
  members: Profile[];
  projects: ProjectWithMembers[];
  dmContacts: Profile[];
  dmUnreads: Record<string, number>;
  channelUnreads: Record<string, number>;
  workspaceUnreads: Record<string, number>;
  projectUnreads: Record<string, number>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const dmUnreadCounts = useDmUnreads(workspaceId, userId, dmUnreads);
  const channelUnreadCounts = useChannelUnreads(
    workspaceId,
    userId,
    channelUnreads,
  );
  const members = useLiveMembers(initialMembers);
  const dmContacts = useLiveMembers(initialDmContacts, "sidebar:dm-contacts");
  const workspaceUnreadCounts = useWorkspaceUnreads(userId, workspaceUnreads);
  const projectUnreadCounts = useProjectUnreads(
    workspaceId,
    userId,
    projectUnreads,
  );
  useGroupMembership(userId);
  useHiddenContacts(userId);
  useDmRoster(userId);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  // When switching workspaces we show a branded full-screen splash, then push
  // the route. The whole layout remounts on arrival, tearing the splash down.
  const [switchingTo, setSwitchingTo] =
    useState<MembershipWithWorkspace | null>(null);
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [dmInviteOpen, setDmInviteOpen] = useState(false);
  // Contact pending removal from the DM list (confirm before hiding).
  const [removeTarget, setRemoveTarget] = useState<Profile | null>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [groupsCollapsed, setGroupsCollapsed] = useState(false);
  const [dmsCollapsed, setDmsCollapsed] = useState(false);
  const [, startTransition] = useTransition();
  const base = `/w/${workspaceId}`;
  const current = workspaces.find((w) => w.workspace_id === workspaceId);

  // Unread notifications waiting in workspaces OTHER than the one being viewed.
  // Surfaced on the switcher button so multi-workspace users notice activity
  // elsewhere without opening the dropdown.
  const otherWorkspaceUnread = workspaces.reduce(
    (sum, w) =>
      w.workspace_id === workspaceId
        ? sum
        : sum + (workspaceUnreadCounts[w.workspace_id] ?? 0),
    0,
  );

  // Slack-style tab alerts while any DM or group has unreads: red dot on the
  // favicon + "(N)" prefix on the tab title. Both clear as soon as everything
  // is read (markRead updates the live counts, which re-runs this).
  const totalUnread =
    Object.values(dmUnreadCounts).reduce((a, b) => a + b, 0) +
    Object.values(channelUnreadCounts).reduce((a, b) => a + b, 0);
  useEffect(() => {
    void setFaviconBadge(totalUnread > 0);
    setTitleUnread(totalUnread);
  }, [totalUnread]);

  // Global DM roster: yourself first (notes-to-self), then everyone who
  // shares at least one workspace with you - NOT just this workspace's
  // members. Existing conversation ids make rows direct links; the rest are
  // created on click. Contacts with conversations sort by latest message
  // (WhatsApp-style, live via useDmActivity); the rest keep roster order.
  const dmActivity = useDmActivity(userId, conversations);
  const dmList = useMemo(() => {
    const convByUser = new Map<string, string>();
    for (const conv of conversations) {
      const other = dmCounterpart(conv, userId);
      if (other && !convByUser.has(other.id)) {
        convByUser.set(other.id, conv.id);
      }
    }
    const me = dmContacts.find((m) => m.id === userId);
    const rows = dmContacts
      .filter((m) => m.id !== userId)
      .map((member) => ({
        member,
        isSelf: false,
        conversationId: convByUser.get(member.id) ?? null,
      }))
      .sort(
        (a, b) =>
          (b.conversationId ? (dmActivity[b.conversationId] ?? 0) : 0) -
          (a.conversationId ? (dmActivity[a.conversationId] ?? 0) : 0),
      );
    // The personal/notes-to-self DM always sits at the very bottom - it's a
    // fixed personal space, so bumping it above active conversations reads as
    // inconsistent ordering.
    return [
      ...rows,
      ...(me
        ? [
            {
              member: me,
              isSelf: true,
              conversationId: convByUser.get(me.id) ?? null,
            },
          ]
        : []),
    ];
  }, [dmContacts, conversations, userId, dmActivity]);

  const topNav = [
    { href: base, label: "Dashboard", icon: "M3 12l9-9 9 9M5 10v10h14V10" },
    {
      href: `${base}/settings`,
      label: "Settings",
      icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    },
  ];

  return (
    <aside className="relative flex h-dvh w-64 shrink-0 flex-col border-r border-border bg-linear-to-b from-surface to-background/60">
      {/* Workspace switcher */}
      <div className="relative border-b border-border/70 p-3">
        <button
          onClick={() => setSwitcherOpen((o) => !o)}
          className="group flex w-full items-center justify-between rounded-xl border border-transparent px-2 py-2 text-left transition-colors hover:border-border hover:bg-surface-2"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="relative shrink-0">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-linear-to-br from-primary to-primary/60 text-sm font-bold text-primary-foreground shadow-sm shadow-primary/30">
                {current?.workspaces?.name?.[0]?.toUpperCase() ?? "?"}
              </span>
              {otherWorkspaceUnread > 0 && (
                <span
                  aria-label={`${otherWorkspaceUnread} unread in other workspaces`}
                  className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 animate-scale-in place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-surface"
                >
                  {otherWorkspaceUnread > 99 ? "99+" : otherWorkspaceUnread}
                </span>
              )}
            </span>
            <span className="truncate text-sm font-semibold text-foreground">
              {current?.workspaces?.name ?? "Workspace"}
            </span>
          </span>
          <Icon
            d="M6 9l6 6 6-6"
            className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${
              switcherOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {switcherOpen && (
          <div className="absolute left-3 right-3 z-20 mt-1 origin-top animate-scale-in overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-xl shadow-black/30">
            <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
              Workspaces
            </p>
            {workspaces.map((w) => {
              const isCurrent = w.workspace_id === workspaceId;
              const color = w.workspaces?.color ?? "#4f46e5";
              return (
                <button
                  key={w.workspace_id}
                  onClick={() => {
                    setSwitcherOpen(false);
                    if (isCurrent) return;
                    setSwitchingTo(w);
                    // Let the splash paint before the (blocking) route push.
                    startTransition(() => router.push(`/w/${w.workspace_id}`));
                  }}
                  className={`group/ws flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-all duration-150 ${
                    isCurrent
                      ? "bg-primary/10 font-semibold text-foreground ring-1 ring-inset ring-primary/20"
                      : "text-muted hover:translate-x-0.5 hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-bold text-white shadow-sm"
                    style={{ backgroundColor: color }}
                  >
                    {w.workspaces?.name?.[0]?.toUpperCase() ?? "?"}
                  </span>
                  <span className="flex-1 truncate">{w.workspaces?.name}</span>
                  {!isCurrent && (workspaceUnreadCounts[w.workspace_id] ?? 0) > 0 && (
                    <span
                      className="grid h-5 min-w-5 shrink-0 animate-scale-in place-items-center rounded-full px-1.5 text-[11px] font-semibold text-white shadow-sm"
                      style={{ backgroundColor: color }}
                    >
                      {(workspaceUnreadCounts[w.workspace_id] ?? 0) > 99
                        ? "99+"
                        : workspaceUnreadCounts[w.workspace_id]}
                    </span>
                  )}
                  {isCurrent && (
                    <svg
                      className="h-4 w-4 shrink-0 text-primary"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              );
            })}
            <div className="my-1 border-t border-border" />
            <Link
              href="/onboarding"
              onClick={() => setSwitcherOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-dashed border-primary/40 text-primary">
                <Icon d="M12 5v14M5 12h14" className="h-4 w-4" />
              </span>
              New workspace
            </Link>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-3">
        {/* Top nav */}
        <div className="space-y-1">
          {topNav.map((item) => {
            const active =
              item.href === base
                ? pathname === base
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                className={`group/nav relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150 ${
                  active
                    ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
                    : "text-muted hover:translate-x-0.5 hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_10px] shadow-primary/60" />
                )}
                <Icon
                  d={item.icon}
                  className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover/nav:scale-110"
                />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Groups */}
        <div>
          <div className="flex items-center justify-between px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            <button
              onClick={() => setGroupsCollapsed((v) => !v)}
              aria-expanded={!groupsCollapsed}
              className="flex flex-1 items-center gap-1 rounded px-2 py-0.5 hover:text-foreground"
            >
              <Icon
                d="M9 18l6-6-6-6"
                className={`h-3 w-3 shrink-0 transition-transform duration-150 ${
                  groupsCollapsed ? "" : "rotate-90"
                }`}
              />
              <span>Groups</span>
            </button>
            <button
              onClick={() => setChannelDialogOpen(true)}
              aria-label="Create group"
              className="grid h-5 w-5 place-items-center rounded-md transition-colors hover:bg-primary/15 hover:text-primary"
            >
              <Icon d="M12 5v14M5 12h14" className="h-3.5 w-3.5" />
            </button>
          </div>
          {!groupsCollapsed && (
          <div className="space-y-0.5">
            {channels.length === 0 && (
              <p className="px-3 py-1 text-xs text-muted/60">No groups yet</p>
            )}
            {channels.map((c) => {
              const href = `${base}/c/${c.id}`;
              const active = pathname === href;
              const unreadCh = channelUnreadCounts[c.id] ?? 0;
              return (
                <Link
                  key={c.id}
                  href={href}
                  prefetch={true}
                  className={`relative flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm transition-all duration-150 ${
                    active
                      ? "bg-primary/10 font-medium text-primary"
                      : unreadCh > 0
                        ? "font-semibold text-foreground hover:bg-surface-2"
                        : "text-muted hover:translate-x-0.5 hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                  )}
                  <Icon
                    d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
                    className="h-3.5 w-3.5 shrink-0"
                  />
                  <span className="flex-1 truncate">{c.name}</span>
                  <SidebarRowMeta
                    target={{ channelId: c.id }}
                    unread={unreadCh}
                  />
                </Link>
              );
            })}
          </div>
          )}
        </div>

        {/* Projects */}
        <div>
          <div className="flex items-center justify-between px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            <span className="px-2 py-0.5">Task Boards</span>
            <Link
              href={`${base}/projects`}
              aria-label="All task boards"
              className="grid h-5 w-5 place-items-center rounded-md transition-colors hover:bg-primary/15 hover:text-primary"
            >
              <Icon d="M12 5v14M5 12h14" className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="space-y-0.5">
            {projects.length === 0 && (
              <p className="px-3 py-1 text-xs text-muted/60">No boards yet</p>
            )}
            {projects.slice(0, 8).map((p) => {
              const href = `${base}/projects/${p.id}`;
              const active = pathname.startsWith(href);
              const unreadPr = projectUnreadCounts[p.id] ?? 0;
              return (
                <Link
                  key={p.id}
                  href={href}
                  prefetch={true}
                  className={`relative flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm transition-all duration-150 ${
                    active
                      ? "bg-primary/10 font-medium text-primary"
                      : unreadPr > 0
                        ? "font-semibold text-foreground hover:bg-surface-2"
                        : "text-muted hover:translate-x-0.5 hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                  )}
                  <Icon
                    d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                    className="h-3.5 w-3.5 shrink-0"
                  />
                  <span className="flex-1 truncate">{p.name}</span>
                  {unreadPr > 0 && (
                    <span
                      aria-label={`${unreadPr} unread`}
                      className="grid h-5 min-w-5 shrink-0 animate-scale-in place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/30"
                    >
                      {unreadPr > 99 ? "99+" : unreadPr}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
        {/* Direct messages - global (Slack model): everyone you share ANY
            workspace with; the same threads no matter the workspace. Framed
            as its own soft card so it reads as a personal space distinct
            from the workspace sections around it. */}
        <div className="rounded-2xl border border-primary/15 bg-linear-to-b from-primary/8 to-transparent p-1.5">
          <div className="flex items-center justify-between pb-1 pl-1 pr-1.5 pt-0.5">
            <button
              onClick={() => setDmsCollapsed((v) => !v)}
              aria-expanded={!dmsCollapsed}
              className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5 text-left"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                <Icon
                  d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                  className="h-3.5 w-3.5"
                />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-wide text-foreground/90">
                  Direct messages
                </span>
                <span className="block text-[10px] leading-tight text-muted/70">
                  Across all workspaces
                </span>
              </span>
              <Icon
                d="M9 18l6-6-6-6"
                className={`ml-auto h-3 w-3 shrink-0 text-muted transition-transform duration-150 ${
                  dmsCollapsed ? "" : "rotate-90"
                }`}
              />
            </button>
            <button
              onClick={() => setDmInviteOpen(true)}
              aria-label="Invite someone to message"
              title="Invite someone to message"
              className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted transition-colors hover:bg-primary/15 hover:text-primary"
            >
              <Icon d="M12 5v14M5 12h14" className="h-3.5 w-3.5" />
            </button>
          </div>
        {!dmsCollapsed && (
          <div className="space-y-0.5">
            {dmList.length === 0 && (
              <p className="px-3 py-1 text-xs text-muted/60">
                No contacts yet
              </p>
            )}
            {dmList.map(({ member, conversationId, isSelf }) => {
              const label = member.full_name ?? member.email;
              const href = conversationId ? `${base}/dm/${conversationId}` : null;
              const active = href != null && pathname === href;
              const unreadDm = conversationId
                ? (dmUnreadCounts[conversationId] ?? 0)
                : 0;
              const className = `group/dmrow relative flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-1.5 text-left text-sm transition-all duration-150 ${
                active
                  ? "bg-primary/10 font-medium text-primary"
                  : unreadDm > 0
                    ? "font-semibold text-foreground hover:bg-surface-2"
                    : "text-muted hover:translate-x-0.5 hover:bg-surface-2 hover:text-foreground"
              }`;
              const inner = (
                <>
                  {active && (
                    <span className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                  )}
                  <span className="relative">
                    <Avatar
                      name={member.full_name}
                      email={member.email}
                      avatarUrl={member.avatar_url}
                      size="xs"
                    />
                    <PresenceDot
                      userId={member.id}
                      className="absolute -bottom-0.5 -right-0.5 border-2 border-surface"
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {label}
                    {isSelf && <span className="ml-1 text-muted">(you)</span>}
                    {activeStatus(member)?.emoji && (
                      <span className="ml-1.5">
                        {activeStatus(member)?.emoji}
                      </span>
                    )}
                  </span>
                  {conversationId && (
                    <SidebarRowMeta
                      target={{ conversationId }}
                      unread={unreadDm}
                    />
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
                <Link
                  key={member.id}
                  href={href}
                  prefetch={true}
                  className={className}
                >
                  {inner}
                </Link>
              ) : (
                <button
                  key={member.id}
                  onClick={() =>
                    startTransition(() => {
                      void openDirectMessage(workspaceId, member.id);
                    })
                  }
                  className={className}
                >
                  {inner}
                </button>
              );
            })}
          </div>
        )}
        </div>

      </nav>

      {/* User footer */}
      <div className="flex items-center justify-between gap-2 border-t border-border/70 p-3">
        <Link
          href={`${base}/profile`}
          className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-2"
        >
          <span className="relative">
            <Avatar
              name={profile?.full_name}
              email={profile?.email}
              avatarUrl={profile?.avatar_url}
              size="sm"
            />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-success" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">
              {profile?.full_name ?? "Me"}
            </span>
            <span className="block truncate text-xs text-muted">
              {(profile && activeStatus(profile)?.text) ?? profile?.email}
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-1">
          {profile && (
            <button
              onClick={() => setStatusDialogOpen(true)}
              aria-label="Set a status"
              title="Set a status"
              className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              {activeStatus(profile)?.emoji ?? (
                <Icon d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
              )}
            </button>
          )}
          <ThemeToggle />
          <form action={signOut}>
            <button
              type="submit"
              aria-label="Sign out"
              className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-danger"
            >
              <Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </button>
          </form>
        </div>
      </div>

      <DmInviteDialog
        open={dmInviteOpen}
        onClose={() => setDmInviteOpen(false)}
      />

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

      <CreateChannelDialog
        workspaceId={workspaceId}
        open={channelDialogOpen}
        onClose={() => setChannelDialogOpen(false)}
        members={members}
        meId={userId}
      />

      {statusDialogOpen && profile && (
        <StatusDialog
          profile={profile}
          onClose={() => setStatusDialogOpen(false)}
        />
      )}

      {switchingTo && (
        <WorkspaceSplash
          name={switchingTo.workspaces?.name ?? "Workspace"}
          accent={switchingTo.workspaces?.color ?? "#4f46e5"}
          portal
        />
      )}
    </aside>
  );
}
