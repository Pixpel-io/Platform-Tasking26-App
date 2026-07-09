"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, FormMessage, Input, Label } from "@/components/ui";
import { renameChannel } from "../../chat-actions";

// Pencil button in the group header (creator/admin only) that opens a small
// rename dialog for the group's name and description.
export function RenameGroup({
  workspaceId,
  channelId,
  name,
  description,
}: {
  workspaceId: string;
  channelId: string;
  name: string;
  description: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const [desc, setDesc] = useState(description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function show() {
    setValue(name);
    setDesc(description ?? "");
    setError(null);
    setOpen(true);
  }

  function save() {
    startTransition(async () => {
      const res = await renameChannel(workspaceId, channelId, value, desc);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={show}
        aria-label="Rename group"
        title="Rename group"
        className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
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
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-foreground">
                Rename group
              </h2>

              <div className="mt-4 space-y-4">
                {error && <FormMessage type="error">{error}</FormMessage>}

                <div>
                  <Label htmlFor="group-name">Name</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                      #
                    </span>
                    <Input
                      id="group-name"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") save();
                      }}
                      autoFocus
                      className="pl-7"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="group-desc">Description (optional)</Label>
                  <Input
                    id="group-desc"
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="What's this group about?"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={save}
                    disabled={pending || value.trim().length < 2}
                  >
                    {pending ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
