"use client";

import { useState, useTransition } from "react";
import { resendInvite, revokeInvite } from "@/app/(app)/actions";
import type { Invite } from "@/lib/supabase/types";

export function PendingInvites({
  workspaceId,
  invites,
}: {
  workspaceId: string;
  invites: Invite[];
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Defensive dedupe: if older rows exist for the same email, show only the
  // newest one. New invites no longer create duplicates server-side.
  const seen = new Set<string>();
  const unique = invites.filter((i) => {
    const key = i.email.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="mt-8 overflow-hidden rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
        Pending invites
      </div>
      {note && (
        <p className="border-b border-border bg-success/5 px-5 py-2 text-xs text-success">
          {note}
        </p>
      )}
      <ul className="divide-y divide-border">
        {unique.map((invite) => (
          <li
            key={invite.id}
            className="flex items-center justify-between px-5 py-3"
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                {invite.email}
              </p>
              <p className="text-xs text-muted">
                Invited as {invite.role} · expires{" "}
                {new Date(invite.expires_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                disabled={pending}
                onClick={() => {
                  setBusyId(invite.id);
                  setNote(null);
                  startTransition(async () => {
                    const res = await resendInvite(workspaceId, invite.id);
                    setNote(res?.error ?? res?.success ?? null);
                    setBusyId(null);
                  });
                }}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                {pending && busyId === invite.id ? "Sending…" : "Resend"}
              </button>
              <button
                disabled={pending}
                onClick={() => {
                  setBusyId(invite.id);
                  startTransition(async () => {
                    await revokeInvite(workspaceId, invite.id);
                    setBusyId(null);
                  });
                }}
                className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
              >
                Revoke
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
