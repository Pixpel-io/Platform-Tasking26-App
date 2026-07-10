"use client";

import { useState, useTransition } from "react";
import { acceptDmInvite } from "@/app/(app)/dm-invite-actions";
import { Button, FormMessage } from "@/components/ui";

export function AcceptDmInviteButton({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="space-y-3">
      {error && <FormMessage type="error">{error}</FormMessage>}
      <Button
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptDmInvite(token);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending ? "Connecting…" : "Accept invitation"}
      </Button>
    </div>
  );
}
