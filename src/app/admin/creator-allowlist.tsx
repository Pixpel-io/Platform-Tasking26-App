"use client";

import { useActionState, useState, useTransition } from "react";
import { addWorkspaceCreator, removeWorkspaceCreator } from "./admin-actions";

type Creator = { id: string; email: string; created_at: string };

export function CreatorAllowlist({ creators }: { creators: Creator[] }) {
  const [state, formAction, pending] = useActionState(addWorkspaceCreator, undefined);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function remove(id: string) {
    setRemoveError(null);
    setRemovingId(id);
    startTransition(async () => {
      const res = await removeWorkspaceCreator(id);
      setRemovingId(null);
      if (res.error) setRemoveError(res.error);
    });
  }

  return (
    <div className="mt-4">
      <form action={formAction} className="flex gap-2">
        <input
          type="email"
          name="email"
          required
          placeholder="email@company.com"
          className="w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Adding..." : "Allow"}
        </button>
      </form>
      {state?.error && (
        <p className="mt-2 text-sm text-danger">{state.error}</p>
      )}
      {state?.success && (
        <p className="mt-2 text-sm text-success">{state.success}</p>
      )}
      {removeError && (
        <p className="mt-2 text-sm text-danger">{removeError}</p>
      )}

      {creators.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted">
          No allowed creators yet. Only super admins can create workspaces.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border/60">
          {creators.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {c.email}
              </span>
              <span className="text-xs text-muted">
                added {new Date(c.created_at).toLocaleDateString()}
              </span>
              <button
                onClick={() => remove(c.id)}
                disabled={removingId === c.id}
                aria-label={`Remove ${c.email}`}
                title="Remove"
                className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
