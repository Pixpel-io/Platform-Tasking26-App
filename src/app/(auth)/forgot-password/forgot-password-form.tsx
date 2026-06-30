"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EmailOnlySchema, fieldErrorsOf } from "@/lib/validation";
import { Button, FieldError, FormMessage, Input, Label } from "@/components/ui";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string[] | undefined>(undefined);

  // Runs in the browser so the PKCE code_verifier is written to a cookie that
  // the /auth/callback route handler can read back to complete the exchange.
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEmailError(undefined);

    const formData = new FormData(e.currentTarget);
    const parsed = EmailOnlySchema.safeParse({ email: formData.get("email") });
    if (!parsed.success) {
      setEmailError(fieldErrorsOf(parsed.error).email);
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      parsed.data.email,
      {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      },
    );
    setPending(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSuccess("If that email exists, a password reset link is on its way.");
  }

  if (success) {
    return <FormMessage type="success">{success}</FormMessage>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <FormMessage type="error">{error}</FormMessage>}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
        <FieldError message={emailError} />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
