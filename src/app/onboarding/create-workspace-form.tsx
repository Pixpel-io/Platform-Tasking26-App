"use client";

import { useActionState, useState } from "react";
import { createWorkspace } from "@/app/(app)/actions";
import { ColorPicker } from "@/components/color-picker";
import { Button, FieldError, FormMessage, Input, Label } from "@/components/ui";
import { DEFAULT_WORKSPACE_COLOR } from "@/lib/workspace-theme";

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspace, undefined);
  const [color, setColor] = useState<string>(DEFAULT_WORKSPACE_COLOR);

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
      <div>
        <Label>Accent color</Label>
        <p className="mb-2 text-sm text-muted">
          The whole workspace UI will match this color.
        </p>
        <ColorPicker name="color" value={color} onChange={setColor} />
        <FieldError message={state?.fieldErrors?.color} />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
