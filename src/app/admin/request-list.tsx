"use client";

import { useState, useTransition } from "react";
import { decideWorkspaceRequest } from "./admin-actions";

type Request = {
  id: string;
  workspace_name: string;
  organization_name: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  requester: { full_name: string | null; email: string } | null;
};

const STATUS_STYLE: Record<string, string> = {
  approved: "bg-success/10 text-success",
  rejected: "bg-danger/10 text-danger",
  pending: "bg-amber-500/10 text-amber-500",
};

export function RequestList({
  pending,
  decided,
}: {
  pending: Request[];
  decided: Request[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function decide(id: string, decision: "approved" | "rejected") {
    setError(null);
    setActingOn(id);
    startTransition(async () => {
      const res = await decideWorkspaceRequest(id, decision);
      setActingOn(null);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div>
      {error && (
        <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {pending.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          No pending requests.
        </p>
      ) : (
        <ul className="space-y-2">
          {pending.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {r.workspace_name}
                  {r.organization_name && (
                    <span className="ml-2 font-normal text-muted">
                      ({r.organization_name})
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  by {r.requester?.full_name ?? r.requester?.email ?? "Unknown"}{" "}
                  · {new Date(r.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => decide(r.id, "approved")}
                  disabled={actingOn === r.id}
                  className="cursor-pointer rounded-lg bg-success px-3.5 py-1.5 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => decide(r.id, "rejected")}
                  disabled={actingOn === r.id}
                  className="cursor-pointer rounded-lg border border-danger/40 px-3.5 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {decided.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Recent decisions
          </p>
          <ul className="space-y-1">
            {decided.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {r.workspace_name}
                  <span className="ml-2 text-xs text-muted">
                    by {r.requester?.full_name ?? r.requester?.email}
                  </span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[r.status]}`}
                >
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
