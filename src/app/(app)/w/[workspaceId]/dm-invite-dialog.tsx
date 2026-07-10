"use client";

import { useActionState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button, FieldError, FormMessage, Input, Label } from "@/components/ui";
import { sendDmInvite } from "@/app/(app)/dm-invite-actions";

// Personal DM invitation: connect with someone outside your workspaces so you
// can message each other directly. Mirrors the create-group dialog shell.
export function DmInviteDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(sendDmInvite, undefined);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Portal to <body>: ancestors with backdrop-filter/transform would trap
  // this fixed overlay and let page content bleed through the dialog.
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground">
          Invite to message
        </h2>
        <p className="mt-1 text-sm text-muted">
          Connect with someone outside your workspaces. They&apos;ll get an
          email invitation; once they accept, you can message each other
          directly - nothing else is shared.
        </p>

        <form action={formAction} className="mt-4 space-y-4">
          {state?.error && <FormMessage type="error">{state.error}</FormMessage>}
          {state?.success && (
            <FormMessage type="success">{state.success}</FormMessage>
          )}

          <div>
            <Label htmlFor="dm-invite-email">Email</Label>
            <Input
              id="dm-invite-email"
              name="email"
              type="email"
              placeholder="name@company.com"
              autoFocus
              required
            />
            <FieldError message={state?.fieldErrors?.email?.[0]} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {state?.success ? "Done" : "Cancel"}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send invitation"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
