"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteWorkspace, updateWorkspace } from "@/app/(app)/actions";
import { ColorPicker } from "@/components/color-picker";
import { Button, FieldError, FormMessage, Input, Label } from "@/components/ui";
import { normalizeColor } from "@/lib/workspace-theme";

export function SettingsForm({
  workspaceId,
  name,
  color,
  companyName,
  canEditCompany,
  canDelete,
}: {
  workspaceId: string;
  name: string;
  color: string;
  companyName: string;
  canEditCompany: boolean;
  canDelete: boolean;
}) {
  const action = updateWorkspace.bind(null, workspaceId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [selected, setSelected] = useState<string>(normalizeColor(color));

  return (
    <div className="space-y-8">
      <form action={formAction} className="space-y-4">
        {state?.error && <FormMessage type="error">{state.error}</FormMessage>}
        {state?.success && (
          <FormMessage type="success">{state.success}</FormMessage>
        )}

        <div>
          <Label htmlFor="companyName">
            Company name{" "}
            {!canEditCompany && (
              <span className="font-normal text-muted">
                (only the company owner can change this)
              </span>
            )}
          </Label>
          <Input
            id="companyName"
            name="companyName"
            defaultValue={companyName}
            disabled={!canEditCompany}
            required={canEditCompany}
          />
          <FieldError message={state?.fieldErrors?.companyName} />
        </div>

        <div>
          <Label htmlFor="name">Workspace name</Label>
          <Input id="name" name="name" defaultValue={name} required />
          <FieldError message={state?.fieldErrors?.name} />
        </div>

        <div>
          <Label>Accent color</Label>
          <p className="mb-2 text-sm text-muted">
            The whole workspace UI will match this color.
          </p>
          <ColorPicker name="color" value={selected} onChange={setSelected} />
          <FieldError message={state?.fieldErrors?.color} />
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </form>

      {canDelete && <DangerZone workspaceId={workspaceId} name={name} />}
    </div>
  );
}

function DangerZone({
  workspaceId,
  name,
}: {
  workspaceId: string;
  name: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteWorkspace(workspaceId);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="rounded-xl border border-danger/30 bg-danger/5 p-5">
      <h2 className="text-sm font-semibold text-danger">Danger zone</h2>
      <p className="mt-1 text-sm text-muted">
        Deleting <span className="font-medium text-foreground">{name}</span>{" "}
        removes it for everyone. This can&apos;t be undone.
      </p>
      {error && (
        <div className="mt-3">
          <FormMessage type="error">{error}</FormMessage>
        </div>
      )}
      {confirming ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            Are you sure?
          </span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="cursor-pointer rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Deleting…" : "Yes, delete workspace"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 cursor-pointer rounded-lg border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
        >
          Delete workspace
        </button>
      )}
    </div>
  );
}
