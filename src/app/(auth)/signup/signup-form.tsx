"use client";

import { useActionState } from "react";
import { signup } from "../actions";
import { Button, FieldError, FormMessage, Input, Label } from "@/components/ui";

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);

  return (
    <form action={action} className="space-y-4">
      {state?.error && <FormMessage type="error">{state.error}</FormMessage>}

      <div>
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" autoComplete="name" required />
        <FieldError message={state?.fieldErrors?.fullName} />
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
        <FieldError message={state?.fieldErrors?.email} />
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
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
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
