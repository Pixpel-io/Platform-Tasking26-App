"use client";

import { useActionState } from "react";
import { updateProfile } from "@/app/(app)/actions";
import { Button, FieldError, FormMessage, Input, Label } from "@/components/ui";
import type { Profile } from "@/lib/supabase/types";

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(updateProfile, undefined);

  return (
    <form action={action} className="space-y-4">
      {state?.error && <FormMessage type="error">{state.error}</FormMessage>}
      {state?.success && (
        <FormMessage type="success">{state.success}</FormMessage>
      )}

      <div className="flex items-center gap-4">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-surface-2 text-xl font-semibold text-foreground">
          {(profile.full_name ?? profile.email)[0]?.toUpperCase()}
        </span>
        <div className="text-sm text-muted">
          Signed in as
          <br />
          <span className="font-medium text-foreground">{profile.email}</span>
        </div>
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
        <Label htmlFor="avatarUrl">
          Avatar URL <span className="font-normal text-muted">(optional)</span>
        </Label>
        <Input
          id="avatarUrl"
          name="avatarUrl"
          type="url"
          defaultValue={profile.avatar_url ?? ""}
          placeholder="https://…"
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
