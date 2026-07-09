"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import type { Profile } from "@/lib/supabase/types";
import { CreateProjectDialog } from "./create-project-dialog";

export function NewProjectButton({
  workspaceId,
  members,
  meId,
}: {
  workspaceId: string;
  members: Profile[];
  meId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        New board
      </Button>
      <CreateProjectDialog
        workspaceId={workspaceId}
        open={open}
        onClose={() => setOpen(false)}
        members={members}
        meId={meId}
      />
    </>
  );
}
