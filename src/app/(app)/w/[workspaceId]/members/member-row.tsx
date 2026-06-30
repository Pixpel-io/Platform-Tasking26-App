"use client";

import { useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { usePresence } from "@/components/presence-provider";
import type { Profile, WorkspaceMember } from "@/lib/supabase/types";
import { openDirectMessage } from "../chat-actions";

type Props = {
  member: WorkspaceMember & { profiles: Profile | null };
  isSelf: boolean;
  canManage: boolean;
  workspaceId: string;
};

const roleBadge: Record<string, string> = {
  owner: "bg-primary/10 text-primary",
  admin: "bg-success/10 text-success",
  member: "bg-surface-2 text-muted",
};

export function MemberRow({ member, isSelf, workspaceId }: Props) {
  const online = usePresence(member.user_id);
  const [pending, startTransition] = useTransition();
  const profile = member.profiles;
  const name = profile?.full_name ?? profile?.email ?? "Unknown";

  return (
    <li className="group flex items-center justify-between px-5 py-3">
      <div className="flex items-center gap-3">
        <span className="relative">
          <Avatar
            name={profile?.full_name}
            email={profile?.email}
            avatarUrl={profile?.avatar_url}
          />
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${
              online ? "bg-success" : "bg-muted/50"
            }`}
            title={online ? "Online" : "Offline"}
          />
        </span>
        <div>
          <p className="text-sm font-medium text-foreground">
            {name}
            {isSelf && <span className="ml-1 text-xs text-muted">(you)</span>}
          </p>
          <p className="text-xs text-muted">{profile?.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {!isSelf && (
          <button
            onClick={() =>
              startTransition(() => {
                void openDirectMessage(workspaceId, member.user_id);
              })
            }
            disabled={pending}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted opacity-0 transition-opacity hover:bg-surface-2 hover:text-foreground group-hover:opacity-100 disabled:opacity-50"
          >
            {pending ? "Opening…" : "Message"}
          </button>
        )}
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${
            roleBadge[member.role] ?? roleBadge.member
          }`}
        >
          {member.role}
        </span>
      </div>
    </li>
  );
}
