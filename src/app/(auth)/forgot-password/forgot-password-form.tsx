"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "../actions";
import { Button, FieldError, FormMessage, Input, Label } from "@/components/ui";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(
    requestPasswordReset,
    undefined,
  );

  if (state?.success) {
    return <FormMessage type="success">{state.success}</FormMessage>;
  }

  return (
    <form action={action} className="space-y-4">
      {state?.error && <FormMessage type="error">{state.error}</FormMessage>}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
        <FieldError message={state?.fieldErrors?.email} />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
