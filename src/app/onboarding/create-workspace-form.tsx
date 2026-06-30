"use client";

import { useActionState } from "react";
import { createWorkspace } from "@/app/(app)/actions";
import { Button, FieldError, FormMessage, Input, Label } from "@/components/ui";

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspace, undefined);

  return (
    <form action={action} className="space-y-4">
      {state?.error && <FormMessage type="error">{state.error}</FormMessage>}
      <div>
        <Label htmlFor="workspaceName">Workspace name</Label>
        <Input
          id="workspaceName"
          name="workspaceName"
          placeholder="Acme Inc."
          required
        />
        <FieldError message={state?.fieldErrors?.workspaceName} />
      </div>
      <div>
        <Label htmlFor="organizationName">
          Organization name{" "}
          <span className="font-normal text-muted">(optional)</span>
        </Label>
        <Input
          id="organizationName"
          name="organizationName"
          placeholder="Defaults to the workspace name"
        />
        <FieldError message={state?.fieldErrors?.organizationName} />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
