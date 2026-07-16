"use client";

import { useEffect, useState, useTransition } from "react";
import { deleteChannel } from "../../chat-actions";

// Trash button in the group header. Opens a confirm dialog; deletion is a
// soft-delete and the RPC restricts it to the group creator (others never see
// this button, and the RPC rejects them too). On success the action redirects
// to the workspace home.
export function DeleteGroupButton({
  workspaceId,
  channelId,
  groupName,
}: {
  workspaceId: string;
  channelId: string;
  groupName: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await deleteChannel(workspaceId, channelId);
      if (res?.error) setError(res.error);
      // On success the action redirects to the workspace home.
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Delete group"
        title="Delete group"
        className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm animate-scale-in rounded-2xl border border-border bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-foreground">
              Delete group?
            </h2>
            <p className="mt-2 text-sm text-muted">
              <span className="font-medium text-foreground">#{groupName}</span>{" "}
              and all of its messages will be removed for everyone. This cannot
              be undone from the app.
            </p>
            {error && (
              <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="cursor-pointer rounded-lg px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={confirm}
                disabled={pending}
                className="cursor-pointer rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Deleting..." : "Delete group"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
