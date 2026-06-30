"use client";

import { useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { usePresence } from "@/components/presence-provider";
import type { Profile, WorkspaceMember } from "@/lib/supabase/types";
import { removeMember } from "@/app/(app)/actions";
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

export function MemberRow({ member, isSelf, canManage, workspaceId }: Props) {
  const online = usePresence(member.user_id);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profile = member.profiles;
  const name = profile?.full_name ?? profile?.email ?? "Unknown";
  // Owner can't be removed; you can't remove yourself from this roster.
  const canRemove = canManage && !isSelf && member.role !== "owner";

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeMember(workspaceId, member.id);
      if (result?.error) {
        setError(result.error);
        setConfirming(false);
      }
    });
  }

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
          {error && <p className="mt-0.5 text-xs text-danger">{error}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Remove?</span>
            <button
              onClick={handleRemove}
              disabled={pending}
              className="cursor-pointer rounded-lg bg-danger px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Removing…" : "Yes, remove"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            {!isSelf && (
              <button
                onClick={() =>
                  startTransition(() => {
                    void openDirectMessage(workspaceId, member.user_id);
                  })
                }
                disabled={pending}
                className="cursor-pointer rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted opacity-0 transition-opacity hover:bg-surface-2 hover:text-foreground group-hover:opacity-100 disabled:opacity-50"
              >
                {pending ? "Opening…" : "Message"}
              </button>
            )}
            {canRemove && (
              <button
                onClick={() => setConfirming(true)}
                aria-label={`Remove ${name}`}
                title="Remove from workspace"
                className="cursor-pointer rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted opacity-0 transition-colors hover:border-danger/40 hover:bg-danger/5 hover:text-danger group-hover:opacity-100"
              >
                Remove
              </button>
            )}
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${
                roleBadge[member.role] ?? roleBadge.member
              }`}
            >
              {member.role}
            </span>
          </>
        )}
      </div>
    </li>
  );
}
