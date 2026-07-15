"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Profile } from "@/lib/supabase/types";
import { Avatar } from "@/components/avatar";
import { BoardMembersManager } from "./board-members-manager";

// Header entry point for managing who can access the board. Shows a compact
// stack of member avatars + count; clicking opens a modal with the full
// add/remove manager. Only rendered for owners / workspace admins.
export function BoardMembersButton({
  workspaceId,
  projectId,
  ownerId,
  members,
  addable,
}: {
  workspaceId: string;
  projectId: string;
  ownerId: string;
  members: Profile[];
  addable: Profile[];
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Manage board members"
        title="Manage board members"
        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface-2 py-1 pl-1 pr-2.5 transition-colors hover:border-primary/40 hover:bg-surface"
      >
        <span className="flex -space-x-2">
          {members.slice(0, 3).map((m) => (
            <span key={m.id} className="rounded-full ring-2 ring-surface-2">
              <Avatar
                name={m.full_name}
                email={m.email}
                avatarUrl={m.avatar_url}
                size="xs"
              />
            </span>
          ))}
        </span>
        <span className="text-xs font-medium text-muted">{members.length}</span>
        <svg
          className="h-3.5 w-3.5 text-muted"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M19 8v6M22 11h-6" />
        </svg>
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 grid place-items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
            onClick={() => setOpen(false)}
          >
            <div
              className="mt-8 w-full max-w-lg animate-scale-in rounded-2xl border border-border bg-background p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Board members
                  </h2>
                  <p className="mt-0.5 text-sm text-muted">
                    Manage who can see and work on this board.
                  </p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
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
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <BoardMembersManager
                workspaceId={workspaceId}
                projectId={projectId}
                ownerId={ownerId}
                members={members}
                addable={addable}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
