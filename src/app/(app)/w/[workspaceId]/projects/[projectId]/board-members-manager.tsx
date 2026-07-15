"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/supabase/types";
import { Avatar } from "@/components/avatar";
import { addProjectMembers, removeProjectMember } from "../project-actions";

function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
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

export function BoardMembersManager({
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Profile | null>(null);

  // Add-member picker state.
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setRemoving(null);
    }
    if (removing) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [removing]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submitAdd() {
    const ids = [...selected];
    if (ids.length === 0) {
      setPicking(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await addProjectMembers(workspaceId, projectId, ids);
      if (res.error) {
        setError(res.error);
        return;
      }
      setSelected(new Set());
      setPicking(false);
      router.refresh();
    });
  }

  function confirmRemove() {
    if (!removing) return;
    const id = removing.id;
    setError(null);
    startTransition(async () => {
      const res = await removeProjectMember(workspaceId, projectId, id);
      if (res.error) {
        setError(res.error);
        setRemoving(null);
        return;
      }
      setRemoving(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {/* Current members */}
      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            {members.length} member{members.length === 1 ? "" : "s"}
          </span>
          {addable.length > 0 && !picking && (
            <button
              onClick={() => setPicking(true)}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <Icon d="M12 5v14M5 12h14" className="h-3.5 w-3.5" />
              Add members
            </button>
          )}
        </div>

        <ul className="max-h-72 divide-y divide-border overflow-y-auto">
          {members.map((m) => {
            const isOwner = m.id === ownerId;
            return (
              <li key={m.id} className="flex items-center gap-3 px-5 py-3">
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
                {isOwner ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    Owner
                  </span>
                ) : (
                  <button
                    onClick={() => setRemoving(m)}
                    disabled={pending}
                    aria-label={`Remove ${m.full_name ?? m.email} from this board`}
                    title="Remove from board"
                    className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                  >
                    <Icon d="M18 6 6 18M6 6l12 12" className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Add-member picker */}
      {picking && (
        <section className="animate-fade-in rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Add workspace members
            </h2>
            <button
              onClick={() => {
                setPicking(false);
                setSelected(new Set());
              }}
              className="cursor-pointer text-xs font-medium text-muted transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </div>

          <div className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
            {addable.map((m) => {
              const checked = selected.has(m.id);
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                    checked
                      ? "bg-primary/10 text-foreground"
                      : "text-muted hover:bg-surface-2"
                  }`}
                >
                  <span
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
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
                  <span className="truncate">{m.full_name ?? m.email}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={submitAdd}
              disabled={pending || selected.size === 0}
              className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 disabled:opacity-50"
            >
              {pending
                ? "Adding…"
                : `Add ${selected.size || ""} member${
                    selected.size === 1 ? "" : "s"
                  }`.trim()}
            </button>
          </div>
        </section>
      )}

      {/* Remove confirmation */}
      {removing && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setRemoving(null)}
        >
          <div
            className="w-full max-w-sm animate-scale-in rounded-2xl border border-border bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-foreground">
              Remove from board?
            </h2>
            <p className="mt-2 text-sm text-muted">
              <span className="font-medium text-foreground">
                {removing.full_name ?? removing.email}
              </span>{" "}
              will lose access to this board and its tasks. You can add them back
              later.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setRemoving(null)}
                className="cursor-pointer rounded-lg px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemove}
                disabled={pending}
                className="cursor-pointer rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
