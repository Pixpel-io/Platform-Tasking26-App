"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { deleteWorkspace, updateWorkspace } from "@/app/(app)/actions";
import { ColorPicker } from "@/components/color-picker";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ImageCropDialog } from "@/components/image-crop-dialog";
import { Button, FieldError, FormMessage, Input, Label } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { normalizeColor } from "@/lib/workspace-theme";

const ICON_BUCKET = "workspace-icons";
const MAX_ICON_BYTES = 5 * 1024 * 1024;

export function SettingsForm({
  workspaceId,
  name,
  color,
  iconUrl: initialIconUrl,
  companyName,
  canEditCompany,
  canDelete,
}: {
  workspaceId: string;
  name: string;
  color: string;
  iconUrl: string;
  companyName: string;
  canEditCompany: boolean;
  canDelete: boolean;
}) {
  const action = updateWorkspace.bind(null, workspaceId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [selected, setSelected] = useState<string>(normalizeColor(color));
  const [iconUrl, setIconUrl] = useState(initialIconUrl);
  const [iconUploading, setIconUploading] = useState(false);
  const [iconError, setIconError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Set to the picked file once size/type pass; the crop dialog then owns it
  // and yields a cropped blob before we upload.
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  function pickIconFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setIconError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_ICON_BYTES) {
      setIconError("Image must be 5MB or smaller.");
      return;
    }

    setIconError(null);
    setPendingCropFile(file);
  }

  async function handleCroppedIcon(blob: Blob) {
    setPendingCropFile(null);
    setIconUploading(true);
    try {
      const supabase = createClient();
      // The bucket's RLS keys on the first path folder = workspace id, so
      // this path is the only shape that passes for a workspace admin. The
      // cropped blob is always PNG (preserves alpha for logos with
      // transparent backgrounds).
      const path = `${workspaceId}/${crypto.randomUUID()}.png`;
      const { error } = await supabase.storage
        .from(ICON_BUCKET)
        .upload(path, blob, { contentType: "image/png", upsert: false });
      if (error) {
        setIconError(error.message);
        return;
      }
      const { data } = supabase.storage.from(ICON_BUCKET).getPublicUrl(path);
      setIconUrl(data.publicUrl);
    } finally {
      setIconUploading(false);
    }
  }

  return (
    <div className="space-y-8">
      <form action={formAction} className="space-y-4">
        {state?.error && <FormMessage type="error">{state.error}</FormMessage>}
        {state?.success && (
          <FormMessage type="success">{state.success}</FormMessage>
        )}

        <input type="hidden" name="iconUrl" value={iconUrl} />

        <div>
          <Label>Workspace logo</Label>
          <div className="mt-2 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <span
              className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl text-xl font-bold text-white shadow-sm"
              style={{ backgroundColor: normalizeColor(selected) }}
            >
              {iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={iconUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                name[0]?.toUpperCase() ?? "?"
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => iconInputRef.current?.click()}
                  disabled={iconUploading}
                  className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-2 disabled:opacity-60"
                >
                  {iconUploading ? "Uploading…" : "Upload logo"}
                </button>
                {iconUrl && (
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(true)}
                    className="cursor-pointer text-sm text-muted hover:text-foreground"
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-muted">
                PNG, JPG, WebP, or GIF up to 5MB. You'll get to crop it before
                it saves.
              </p>
            </div>
            <input
              ref={iconInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/*"
              onChange={pickIconFile}
              className="hidden"
            />
          </div>
          {iconError && (
            <div className="mt-2">
              <FormMessage type="error">{iconError}</FormMessage>
            </div>
          )}
        </div>

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

        <Button type="submit" disabled={pending || iconUploading}>
          {pending ? "Saving…" : "Save changes"}
        </Button>

        {confirmRemove && (
          <ConfirmDialog
            title="Remove workspace logo?"
            description="The workspace tile will fall back to the accent color + initial until you upload a new logo. Save changes to apply."
            confirmLabel="Remove logo"
            onConfirm={() => {
              setIconUrl("");
              setConfirmRemove(false);
            }}
            onCancel={() => setConfirmRemove(false)}
          />
        )}

        {pendingCropFile && (
          <ImageCropDialog
            file={pendingCropFile}
            title="Crop workspace logo"
            confirmLabel="Save logo"
            aspect={1}
            onDone={(blob) => void handleCroppedIcon(blob)}
            onCancel={() => setPendingCropFile(null)}
          />
        )}
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
