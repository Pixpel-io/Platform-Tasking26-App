"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

type Provider = "google" | "azure";

// Runs in the browser so the PKCE code_verifier is stored in a cookie the
// /auth/callback route can read back to complete the code exchange.
function useOAuth(provider: Provider, redirectedFrom?: string, scopes?: string) {
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    const supabase = createClient();
    const next = redirectedFrom
      ? `?next=${encodeURIComponent(redirectedFrom)}`
      : "";
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback${next}`,
        ...(scopes ? { scopes } : {}),
      },
    });
    if (error || !data?.url) {
      setPending(false);
      return;
    }
    window.location.href = data.url;
  }

  return { pending, start };
}

export function GoogleButton({ redirectedFrom }: { redirectedFrom?: string }) {
  const { pending, start } = useOAuth("google", redirectedFrom);

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={pending}
      onClick={start}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
        />
      </svg>
      {pending ? "Redirecting…" : "Continue with Google"}
    </Button>
  );
}

export function MicrosoftButton({
  redirectedFrom,
}: {
  redirectedFrom?: string;
}) {
  // Azure defaults to only the OpenID scopes; ask for email explicitly so the
  // profile lands with a usable address.
  const { pending, start } = useOAuth("azure", redirectedFrom, "email");

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={pending}
      onClick={start}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24">
        <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
        <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
        <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
        <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
      </svg>
      {pending ? "Redirecting…" : "Continue with Microsoft"}
    </Button>
  );
}
