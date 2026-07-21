"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { usePresence } from "@/components/presence-provider";
import { useProfileCard } from "@/components/profile-card";
import type { Profile, WorkspaceMember } from "@/lib/supabase/types";
import { changeMemberRole, removeMember } from "@/app/(app)/actions";
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
  const openProfile = useProfileCard();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const roleMenuRef = useRef<HTMLDivElement>(null);
  const profile = member.profiles;
  const name = profile?.full_name ?? profile?.email ?? "Unknown";
  // Owner can't be removed / re-roled; you can't touch your own row here.
  const canRemove = canManage && !isSelf && member.role !== "owner";
  const canChangeRole = canManage && !isSelf && member.role !== "owner";

  useEffect(() => {
    if (!roleMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (
        roleMenuRef.current &&
        !roleMenuRef.current.contains(e.target as Node)
      ) {
        setRoleMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setRoleMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [roleMenuOpen]);

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

  function handleRoleChange(nextRole: "admin" | "member") {
    setError(null);
    setRoleMenuOpen(false);
    if (nextRole === member.role) return;
    startTransition(async () => {
      const result = await changeMemberRole(
        workspaceId,
        member.user_id,
        nextRole,
      );
      if (result?.error) setError(result.error);
    });
  }

  return (
    <li className="group flex items-center justify-between px-5 py-3 transition-colors duration-150 hover:bg-surface-2/50">
      <button
        type="button"
        onClick={() => profile && openProfile(profile)}
        disabled={!profile}
        className="flex items-center gap-3 text-left disabled:cursor-default"
      >
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
      </button>
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
            {canChangeRole ? (
              <div ref={roleMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setRoleMenuOpen((v) => !v)}
                  disabled={pending}
                  aria-haspopup="menu"
                  aria-expanded={roleMenuOpen}
                  className={`flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-xs font-medium capitalize transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                    roleBadge[member.role] ?? roleBadge.member
                  }`}
                >
                  {member.role}
                  <svg
                    className={`h-3 w-3 transition-transform duration-150 ${
                      roleMenuOpen ? "rotate-180" : ""
                    }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {roleMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-20 mt-1 w-48 animate-scale-in origin-top-right overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-xl shadow-black/20"
                  >
                    <RoleOption
                      label="Admin"
                      description="Manage members and settings"
                      active={member.role === "admin"}
                      onClick={() => handleRoleChange("admin")}
                    />
                    <RoleOption
                      label="Member"
                      description="Regular access"
                      active={member.role === "member"}
                      onClick={() => handleRoleChange("member")}
                    />
                  </div>
                )}
              </div>
            ) : (
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${
                  roleBadge[member.role] ?? roleBadge.member
                }`}
              >
                {member.role}
              </span>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function RoleOption({
  label,
  description,
  active,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
        active ? "bg-primary/10" : "hover:bg-surface-2"
      }`}
    >
      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center">
        {active && (
          <svg
            className="h-4 w-4 text-primary"
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
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">
          {label}
        </span>
        <span className="block text-xs text-muted">{description}</span>
      </span>
    </button>
  );
}
