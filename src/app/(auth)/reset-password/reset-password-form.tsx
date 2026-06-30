"use client";

import { useActionState } from "react";
import { updatePassword } from "../actions";
import { Button, FieldError, FormMessage, Input, Label } from "@/components/ui";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, undefined);

  return (
    <form action={action} className="space-y-4">
      {state?.error && <FormMessage type="error">{state.error}</FormMessage>}
      <div>
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
        <FieldError message={state?.fieldErrors?.password} />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
