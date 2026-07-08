"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useTransition,
} from "react";
import { Avatar } from "@/components/avatar";
import { usePresence } from "@/components/presence-provider";
import { StatusDialog, activeStatus } from "@/components/status-dialog";
import type { Profile } from "@/lib/supabase/types";
import { openDirectMessage } from "@/app/(app)/w/[workspaceId]/chat-actions";

type OpenProfile = (profile: Profile) => void;

const ProfileCardContext = createContext<OpenProfile>(() => {});

// Slack-style profile card. A single instance lives at the workspace layout and
// any avatar/name can pop it open via useProfileCard(). Clicking a person shows
// their photo, title, presence, and a shortcut to DM them.
export function ProfileCardProvider({
  workspaceId,
  meId,
  children,
}: {
  workspaceId: string;
  meId: string;
  children: React.ReactNode;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);

  const open = useCallback((p: Profile) => setProfile(p), []);
  const close = useCallback(() => setProfile(null), []);

  return (
    <ProfileCardContext.Provider value={open}>
      {children}
      {profile && (
        <ProfileCardModal
          profile={profile}
          workspaceId={workspaceId}
          meId={meId}
          onClose={close}
        />
      )}
    </ProfileCardContext.Provider>
  );
}

export function useProfileCard() {
  return useContext(ProfileCardContext);
}

function ProfileCardModal({
  profile,
  workspaceId,
  meId,
  onClose,
}: {
  profile: Profile;
  workspaceId: string;
  meId: string;
  onClose: () => void;
}) {
  const online = usePresence(profile.id);
  const [pending, startTransition] = useTransition();
  const [statusOpen, setStatusOpen] = useState(false);
  const isSelf = profile.id === meId;
  const name = profile.full_name ?? profile.email;
  const status = activeStatus(profile);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const lastSeen = profile.last_seen_at
    ? new Date(profile.last_seen_at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      className="fixed inset-0 z-90 grid animate-fade-in place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm origin-center animate-scale-in overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cover + avatar */}
        <div className="relative h-24 bg-linear-to-br from-primary/25 via-primary/10 to-surface">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg bg-surface/70 text-muted backdrop-blur transition-colors hover:bg-surface hover:text-foreground"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 pb-6">
          <div className="-mt-12 flex items-end justify-between">
            <span className="relative rounded-2xl ring-4 ring-surface">
              <Avatar
                name={profile.full_name}
                email={profile.email}
                avatarUrl={profile.avatar_url}
                size="xl"
                className="rounded-2xl"
              />
              <span
                className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-surface ${
                  online ? "bg-success" : "bg-muted/50"
                }`}
                title={online ? "Active" : "Away"}
              />
            </span>
          </div>

          <div className="mt-3">
            <h2 className="text-lg font-semibold text-foreground">
              {name}
              {isSelf && (
                <span className="ml-1.5 text-sm font-normal text-muted">
                  (you)
                </span>
              )}
            </h2>
            {profile.title && (
              <p className="mt-0.5 text-sm text-muted">{profile.title}</p>
            )}
          </div>

          {/* Slack-style custom status */}
          {status && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-surface-2/50 px-3 py-2 text-sm">
              {status.emoji && <span className="text-base">{status.emoji}</span>}
              <span className="min-w-0 truncate text-foreground">
                {status.text}
              </span>
            </div>
          )}

          <div className="mt-4 flex items-center gap-1.5 text-sm">
            <span
              className={`h-2 w-2 rounded-full ${
                online ? "bg-success" : "bg-muted/50"
              }`}
            />
            <span className={online ? "text-foreground" : "text-muted"}>
              {online ? "Active" : "Away"}
            </span>
          </div>

          {/* Contact */}
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <div className="flex items-center gap-2.5 text-sm">
              <svg
                className="h-4 w-4 shrink-0 text-muted"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <a
                href={`mailto:${profile.email}`}
                className="truncate text-primary hover:underline"
              >
                {profile.email}
              </a>
            </div>
            {lastSeen && !online && (
              <div className="flex items-center gap-2.5 text-sm text-muted">
                <svg
                  className="h-4 w-4 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                Last seen {lastSeen}
              </div>
            )}
          </div>

          {!isSelf && (
            <button
              onClick={() =>
                startTransition(() => {
                  void openDirectMessage(workspaceId, profile.id);
                })
              }
              disabled={pending}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/30 transition-all hover:opacity-90 disabled:opacity-60"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {pending ? "Opening…" : "Message"}
            </button>
          )}

          {isSelf && (
            <button
              onClick={() => setStatusOpen(true)}
              className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
              </svg>
              {status ? "Edit status" : "Set a status"}
            </button>
          )}
        </div>
      </div>

      {statusOpen && (
        <StatusDialog profile={profile} onClose={() => setStatusOpen(false)} />
      )}
    </div>
  );
}
