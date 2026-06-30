"use client";

import { useState, useTransition } from "react";
import { acceptInvite } from "@/app/(app)/actions";
import { Button, FormMessage } from "@/components/ui";

export function AcceptInviteButton({ token }: { token: string }) {
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
            const result = await acceptInvite(token);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
    </div>
  );
}
