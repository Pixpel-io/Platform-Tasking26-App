"use client";

import { useActionState } from "react";
import { inviteMember } from "@/app/(app)/actions";
import { Button, FieldError, FormMessage, Input } from "@/components/ui";

export function InviteForm({ workspaceId }: { workspaceId: string }) {
  const action = inviteMember.bind(null, workspaceId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && <FormMessage type="error">{state.error}</FormMessage>}
      {state?.success && (
        <FormMessage type="success">{state.success}</FormMessage>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <Input
            name="email"
            type="email"
            placeholder="teammate@company.com"
            required
          />
          <FieldError message={state?.fieldErrors?.email} />
        </div>
        <select
          name="role"
          defaultValue="member"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <Button type="submit" disabled={pending}>
          {pending ? "Inviting…" : "Send invite"}
        </Button>
      </div>
    </form>
  );
}
