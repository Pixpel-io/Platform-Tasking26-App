"use client";

import { useState, useTransition } from "react";
import { adminDeleteWorkspace } from "./admin-actions";

type Row = {
  id: string;
  name: string;
  color: string;
  created_at: string;
  memberCount: number;
  ownerName: string;
};

// Platform-wide workspace list for super admins: who owns what, jump into a
// workspace, or delete it (with a typed-confirm dialog since it nukes the
// workspace for everyone).
export function WorkspaceList({ workspaces }: { workspaces: Row[] }) {
  const [confirmTarget, setConfirmTarget] = useState<Row | null>(null);
  const [revokeAccess, setRevokeAccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    if (!confirmTarget) return;
    setError(null);
    startTransition(async () => {
      const res = await adminDeleteWorkspace(confirmTarget.id, revokeAccess);
      if (res.error) setError(res.error);
      else setConfirmTarget(null);
    });
  }

  if (workspaces.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted">
        No workspaces yet.
      </p>
    );
  }

  return (
    <>
      <ul className="mt-3 divide-y divide-border/60">
        {workspaces.map((w) => (
          <li key={w.id} className="flex items-center gap-3 py-2.5">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: w.color }}
            >
              {w.name[0]?.toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {w.name}
              </span>
              <span className="block truncate text-xs text-muted">
                Owner: {w.ownerName} · {w.memberCount} member
                {w.memberCount === 1 ? "" : "s"} ·{" "}
                {new Date(w.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </span>
            <a
              href={`/w/${w.id}`}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary/40 hover:text-primary"
            >
              Open
            </a>
            <button
              onClick={() => {
                setError(null);
                setRevokeAccess(false);
                setConfirmTarget(w);
              }}
              aria-label={`Delete ${w.name}`}
              title="Delete workspace"
              className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </li>
        ))}
      </ul>

      {confirmTarget && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setConfirmTarget(null)}
        >
          <div
            className="w-full max-w-sm animate-scale-in rounded-2xl border border-border bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-foreground">
              Delete workspace?
            </h2>
            <p className="mt-2 text-sm text-muted">
              <span className="font-medium text-foreground">
                {confirmTarget.name}
              </span>{" "}
              (owner: {confirmTarget.ownerName}) will be removed for all{" "}
              {confirmTarget.memberCount} member
              {confirmTarget.memberCount === 1 ? "" : "s"} - chats, projects,
              everything. This cannot be undone from the app.
            </p>
            <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-background px-3 py-2.5">
              <input
                type="checkbox"
                checked={revokeAccess}
                onChange={(e) => setRevokeAccess(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-danger"
              />
              <span className="text-sm text-foreground">
                Also revoke {confirmTarget.ownerName}&apos;s workspace-creation
                access
                <span className="block text-xs text-muted">
                  They&apos;ll need super admin approval to create workspaces
                  again.
                </span>
              </span>
            </label>
            {error && (
              <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmTarget(null)}
                className="cursor-pointer rounded-lg px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={pending}
                className="cursor-pointer rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Deleting..." : "Delete workspace"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
