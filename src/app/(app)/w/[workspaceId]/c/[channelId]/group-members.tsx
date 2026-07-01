"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/supabase/types";
import { Avatar } from "@/components/avatar";
import { useProfileCard } from "@/components/profile-card";
import { addGroupMembers, removeGroupMember } from "../../chat-actions";

function Icon({
  d,
  className = "h-4 w-4",
}: {
  d: string;
  className?: string;
}) {
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

// Slack-style group roster. A member-count pill in the header opens a panel
// that lists the current members and lets the creator/admin add teammates who
// aren't in the group yet.
export function GroupMembers({
  workspaceId,
  channelId,
  members,
  workspaceMembers,
  canManage = false,
  creatorId,
}: {
  workspaceId: string;
  channelId: string;
  members: Profile[];
  workspaceMembers: Profile[];
  canManage?: boolean;
  creatorId?: string | null;
}) {
  const router = useRouter();
  const openProfile = useProfileCard();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Reset the picker each time the panel opens.
  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setError(null);
    }
  }, [open]);

  // Workspace members who aren't already in the group.
  const addable = useMemo(() => {
    const inGroup = new Set(members.map((m) => m.id));
    return workspaceMembers.filter((m) => !inGroup.has(m.id));
  }, [members, workspaceMembers]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await addGroupMembers(workspaceId, channelId, [...selected]);
      if (res.error) {
        setError(res.error);
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  function remove(id: string) {
    setError(null);
    setRemovingId(id);
    startTransition(async () => {
      const res = await removeGroupMember(workspaceId, channelId, id);
      setRemovingId(null);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`${members.length} members — view or add people`}
        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-sm text-muted transition-all duration-150 hover:border-primary/50 hover:bg-primary/10 hover:text-primary hover:shadow-sm hover:shadow-primary/20"
      >
        <Icon
          d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
          className="h-3.5 w-3.5"
        />
        <span className="font-medium">{members.length}</span>
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-50 grid animate-fade-in place-items-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md origin-center animate-scale-in overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/30"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with accent wash */}
            <div className="relative border-b border-border bg-linear-to-br from-primary/10 via-surface to-surface px-6 pb-5 pt-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-linear-to-br from-primary to-primary/60 text-primary-foreground shadow-sm shadow-primary/30">
                    <Icon
                      d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
                      className="h-5 w-5"
                    />
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      Members
                    </h2>
                    <p className="mt-0.5 text-sm text-muted">
                      {members.length}{" "}
                      {members.length === 1 ? "person" : "people"} in this group
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <Icon d="M18 6L6 18M6 6l12 12" />
                </button>
              </div>
            </div>

            <div className="px-6 py-5">
              {/* Current roster */}
              <div className="max-h-52 space-y-0.5 overflow-y-auto">
                {members.map((m) => {
                  const isCreator = m.id === creatorId;
                  const canRemove = canManage && !isCreator;
                  return (
                    <div
                      key={m.id}
                      className="group flex items-center gap-3 rounded-xl px-2 py-1.5 transition-all duration-150 hover:bg-primary/5"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          openProfile(m);
                        }}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                      >
                        <Avatar
                          name={m.full_name}
                          email={m.email}
                          avatarUrl={m.avatar_url}
                          size="sm"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {m.full_name ?? m.email}
                          </span>
                          {m.full_name && (
                            <span className="block truncate text-xs text-muted">
                              {m.email}
                            </span>
                          )}
                        </span>
                      </button>
                      {isCreator && (
                        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                          Creator
                        </span>
                      )}
                      {canRemove && (
                        <button
                          type="button"
                          onClick={() => remove(m.id)}
                          disabled={pending}
                          aria-label={`Remove ${m.full_name ?? m.email}`}
                          title="Remove from group"
                          className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg text-muted opacity-0 transition-all duration-150 hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {removingId === m.id ? (
                            <svg
                              className="h-3.5 w-3.5 animate-spin-fast"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                            >
                              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                          ) : (
                            <Icon
                              d="M14 11v6M10 11v6M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                              className="h-3.5 w-3.5"
                            />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add people (creator/admin only) */}
              {canManage && (
              <div className="mt-5 border-t border-border pt-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Add people
                  </p>
                  {selected.size > 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {selected.size} selected
                    </span>
                  )}
                </div>
                {addable.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed border-border px-3 py-4 text-center text-sm text-muted">
                    Everyone in the workspace is already here.
                  </p>
                ) : (
                  <>
                    <div className="mt-3 max-h-40 space-y-0.5 overflow-y-auto rounded-xl border border-border p-1.5">
                      {addable.map((m) => {
                        const checked = selected.has(m.id);
                        return (
                          <button
                            type="button"
                            key={m.id}
                            onClick={() => toggle(m.id)}
                            className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-all duration-150 ${
                              checked
                                ? "bg-primary/10 text-foreground ring-1 ring-inset ring-primary/20"
                                : "text-foreground hover:translate-x-0.5 hover:bg-primary/5"
                            }`}
                          >
                            <span
                              className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors ${
                                checked
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border"
                              }`}
                            >
                              {checked && (
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-3 w-3"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                >
                                  <path d="M20 6 9 17l-5-5" />
                                </svg>
                              )}
                            </span>
                            <Avatar
                              name={m.full_name}
                              email={m.email}
                              avatarUrl={m.avatar_url}
                              size="xs"
                            />
                            <span className="truncate">
                              {m.full_name ?? m.email}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        onClick={() => setOpen(false)}
                        className="rounded-lg px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={submit}
                        disabled={pending || selected.size === 0}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/30 transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                      >
                        {pending
                          ? "Adding…"
                          : selected.size > 0
                            ? `Add ${selected.size}`
                            : "Add"}
                      </button>
                    </div>
                  </>
                )}
              </div>
              )}

              {error && (
                <p className="mt-3 text-sm text-danger">{error}</p>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
