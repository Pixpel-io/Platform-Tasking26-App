"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, FormMessage } from "@/components/ui";

// Spends the one-time magic-link token - only on an explicit tap, never on
// page load, so URL prefetchers can't burn it.
export function QrSignInButton({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function signIn() {
    startTransition(async () => {
      const supabase = createClient();
      const { error: otpError } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: token,
      });
      if (otpError) {
        setError(
          otpError.message.toLowerCase().includes("expired") ||
            otpError.message.toLowerCase().includes("invalid")
            ? "This code was already used or has expired. Generate a new QR code from your profile and scan again."
            : otpError.message,
        );
        return;
      }
      // Session cookie is set - enter the app.
      window.location.href = "/";
    });
  }

  return (
    <div className="space-y-3">
      {error && <FormMessage type="error">{error}</FormMessage>}
      <Button className="w-full" disabled={pending} onClick={signIn}>
        {pending ? "Signing in…" : "Open Tasking"}
      </Button>
    </div>
  );
}
