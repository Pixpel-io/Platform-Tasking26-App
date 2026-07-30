"use client";

import { useActionState, useRef, useState } from "react";
import { updateProfile } from "@/app/(app)/actions";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/avatar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ImageCropDialog } from "@/components/image-crop-dialog";
import { Button, FieldError, FormMessage, Input, Label } from "@/components/ui";
import type { Profile } from "@/lib/supabase/types";

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(updateProfile, undefined);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setUploadError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setUploadError("Image must be 5MB or smaller.");
      return;
    }

    setUploadError(null);
    setPendingCropFile(file);
  }

  async function handleCroppedAvatar(blob: Blob) {
    setPendingCropFile(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const path = `${profile.id}/${crypto.randomUUID()}.png`;
      const { error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, blob, { contentType: "image/png", upsert: false });
      if (error) {
        setUploadError(error.message);
        return;
      }
      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={action} className="space-y-4">
      {state?.error && <FormMessage type="error">{state.error}</FormMessage>}
      {state?.success && (
        <FormMessage type="success">{state.success}</FormMessage>
      )}

      <input type="hidden" name="avatarUrl" value={avatarUrl} />

      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <Avatar
          name={profile.full_name}
          email={profile.email}
          avatarUrl={avatarUrl}
          size="xl"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-2 disabled:opacity-60"
            >
              {uploading ? "Uploading…" : "Upload photo"}
            </button>
            {avatarUrl && (
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
            PNG, JPG, WebP, or GIF up to 5MB. You&apos;ll get to crop it before
            it saves.
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/*"
          onChange={pickAvatarFile}
          className="hidden"
        />
      </div>
      {uploadError && <FormMessage type="error">{uploadError}</FormMessage>}

      <div className="text-sm text-muted">
        Signed in as{" "}
        <span className="font-medium text-foreground">{profile.email}</span>
      </div>

      <div>
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          defaultValue={profile.full_name ?? ""}
          required
        />
        <FieldError message={state?.fieldErrors?.fullName} />
      </div>

      <div>
        <Label htmlFor="title">
          Position <span className="font-normal text-muted">(optional)</span>
        </Label>
        <Input
          id="title"
          name="title"
          defaultValue={profile.title ?? ""}
          placeholder="e.g. Blockchain Developer"
        />
      </div>

      <Button type="submit" disabled={pending || uploading}>
        {pending ? "Saving…" : "Save changes"}
      </Button>

      {confirmRemove && (
        <ConfirmDialog
          title="Remove profile picture?"
          description="Your avatar will fall back to your initials until you upload a new photo. Save changes to apply."
          confirmLabel="Remove photo"
          onConfirm={() => {
            setAvatarUrl("");
            setConfirmRemove(false);
          }}
          onCancel={() => setConfirmRemove(false)}
        />
      )}

      {pendingCropFile && (
        <ImageCropDialog
          file={pendingCropFile}
          title="Crop profile picture"
          confirmLabel="Save photo"
          aspect={1}
          onDone={(blob) => void handleCroppedAvatar(blob)}
          onCancel={() => setPendingCropFile(null)}
        />
      )}
    </form>
  );
}
