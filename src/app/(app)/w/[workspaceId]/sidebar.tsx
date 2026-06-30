"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { MembershipWithWorkspace } from "@/lib/auth";
import type { ConversationWithParticipants } from "@/lib/chat-shared";
import { dmCounterpart } from "@/lib/chat-shared";
import type { Channel, Profile } from "@/lib/supabase/types";
import type { ProjectWithMembers } from "@/lib/projects-shared";
import { ThemeToggle } from "@/components/theme-toggle";
import { usePresence } from "@/components/presence-provider";
import { signOut } from "@/app/(auth)/actions";
import { CreateChannelDialog } from "./create-channel-dialog";

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
  members,
  projects,
}: {
  workspaceId: string;
  workspaces: MembershipWithWorkspace[];
  profile: Profile | null;
  userId: string;
  channels: Channel[];
  conversations: ConversationWithParticipants[];
  members: Profile[];
  projects: ProjectWithMembers[];
}) {
  const pathname = usePathname();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const base = `/w/${workspaceId}`;
  const current = workspaces.find((w) => w.workspace_id === workspaceId);

  const topNav = [
    { href: base, label: "Dashboard", icon: "M3 12l9-9 9 9M5 10v10h14V10" },
    {
      href: `${base}/members`,
      label: "Members",
      icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    },
    {
      href: `${base}/search`,
      label: "Search",
      icon: "M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
    },
  ];

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-surface">
      {/* Workspace switcher */}
      <div className="relative border-b border-border p-3">
        <button
          onClick={() => setSwitcherOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-surface-2"
        >
          <span className="flex items-center gap-2 truncate">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              {current?.workspaces?.name?.[0]?.toUpperCase() ?? "?"}
            </span>
            <span className="truncate text-sm font-semibold text-foreground">
              {current?.workspaces?.name ?? "Workspace"}
            </span>
          </span>
          <Icon d="M6 9l6 6 6-6" />
        </button>

        {switcherOpen && (
          <div className="absolute left-3 right-3 z-10 mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
            {workspaces.map((w) => (
              <Link
                key={w.workspace_id}
                href={`/w/${w.workspace_id}`}
                onClick={() => setSwitcherOpen(false)}
                className={`block px-3 py-2 text-sm hover:bg-surface-2 ${
                  w.workspace_id === workspaceId
                    ? "font-semibold text-foreground"
                    : "text-muted"
                }`}
              >
                {w.workspaces?.name}
              </Link>
            ))}
            <Link
              href="/onboarding"
              onClick={() => setSwitcherOpen(false)}
              className="block border-t border-border px-3 py-2 text-sm text-primary hover:bg-surface-2"
            >
              + New workspace
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
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                <Icon d={item.icon} />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Groups */}
        <div>
          <div className="flex items-center justify-between px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            <span>Groups</span>
            <button
              onClick={() => setChannelDialogOpen(true)}
              aria-label="Create group"
              className="grid h-5 w-5 place-items-center rounded hover:bg-surface-2 hover:text-foreground"
            >
              <Icon d="M12 5v14M5 12h14" className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-0.5">
            {channels.length === 0 && (
              <p className="px-3 py-1 text-xs text-muted/60">No groups yet</p>
            )}
            {channels.map((c) => {
              const href = `${base}/c/${c.id}`;
              const active = pathname === href;
              return (
                <Link
                  key={c.id}
                  href={href}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  <Icon
                    d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
                    className="h-3.5 w-3.5 shrink-0"
                  />
                  <span className="truncate">{c.name}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Direct messages */}
        <div>
          <div className="flex items-center justify-between px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            <span>Direct messages</span>
            <Link
              href={`${base}/members`}
              aria-label="Start a DM"
              className="grid h-5 w-5 place-items-center rounded hover:bg-surface-2 hover:text-foreground"
            >
              <Icon d="M12 5v14M5 12h14" className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="space-y-0.5">
            {conversations.length === 0 && (
              <p className="px-3 py-1 text-xs text-muted/60">No conversations</p>
            )}
            {conversations.map((conv) => {
              const other = dmCounterpart(conv, userId);
              const href = `${base}/dm/${conv.id}`;
              const active = pathname === href;
              const label =
                other?.full_name ?? other?.email ?? "Conversation";
              return (
                <Link
                  key={conv.id}
                  href={href}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  {other ? (
                    <PresenceDot userId={other.id} className="shrink-0" />
                  ) : (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-muted/40" />
                  )}
                  <span className="truncate">{label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Projects */}
        <div>
          <div className="flex items-center justify-between px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            <span>Projects</span>
            <Link
              href={`${base}/projects`}
              aria-label="All projects"
              className="grid h-5 w-5 place-items-center rounded hover:bg-surface-2 hover:text-foreground"
            >
              <Icon d="M12 5v14M5 12h14" className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="space-y-0.5">
            {projects.length === 0 && (
              <p className="px-3 py-1 text-xs text-muted/60">No projects yet</p>
            )}
            {projects.slice(0, 8).map((p) => {
              const href = `${base}/projects/${p.id}`;
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={p.id}
                  href={href}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  <Icon
                    d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                    className="h-3.5 w-3.5 shrink-0"
                  />
                  <span className="truncate">{p.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* User footer */}
      <div className="flex items-center justify-between gap-2 border-t border-border p-3">
        <Link
          href={`${base}/profile`}
          className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2"
        >
          <span className="relative grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-foreground">
            {profile?.full_name?.[0]?.toUpperCase() ??
              profile?.email[0]?.toUpperCase()}
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-success" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">
              {profile?.full_name ?? "Me"}
            </span>
            <span className="block truncate text-xs text-muted">
              {profile?.email}
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-1">
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

      <CreateChannelDialog
        workspaceId={workspaceId}
        open={channelDialogOpen}
        onClose={() => setChannelDialogOpen(false)}
        members={members}
        meId={userId}
      />
    </aside>
  );
}
