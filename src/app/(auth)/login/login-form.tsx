"use client";

import { useActionState } from "react";
import { login } from "../actions";
import { Button, FieldError, FormMessage, Input, Label } from "@/components/ui";

export function LoginForm({ redirectedFrom }: { redirectedFrom?: string }) {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="space-y-4">
      {state?.error && <FormMessage type="error">{state.error}</FormMessage>}
      {redirectedFrom && (
        <input type="hidden" name="redirectedFrom" value={redirectedFrom} />
      )}

      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
        <FieldError message={state?.fieldErrors?.email} />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <a href="/forgot-password" className="text-xs text-primary hover:underline">
            Forgot?
          </a>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <FieldError message={state?.fieldErrors?.password} />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
