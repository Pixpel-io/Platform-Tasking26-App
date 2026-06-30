"use client";

import { useActionState, useEffect, useState } from "react";
import { Button, FieldError, FormMessage, Input, Label } from "@/components/ui";
import type { Profile } from "@/lib/supabase/types";
import { createChannel } from "./chat-actions";

export function CreateChannelDialog({
  workspaceId,
  open,
  onClose,
  members,
  meId,
}: {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
  members: Profile[];
  meId: string;
}) {
  const action = createChannel.bind(null, workspaceId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reset the picker whenever the dialog reopens.
  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  if (!open) return null;

  // The creator is always a member, so don't offer to "add" yourself.
  const others = members.filter((m) => m.id !== meId);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground">
          Create a group
        </h2>
        <p className="mt-1 text-sm text-muted">
          Groups are private to their members. Add people now or invite them
          later.
        </p>

        <form action={formAction} className="mt-4 space-y-4">
          {state?.error && <FormMessage type="error">{state.error}</FormMessage>}

          {[...selected].map((id) => (
            <input key={id} type="hidden" name="memberIds" value={id} />
          ))}

          <div>
            <Label htmlFor="name">Name</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                #
              </span>
              <Input
                id="name"
                name="name"
                placeholder="marketing"
                autoFocus
                required
                className="pl-7"
              />
            </div>
            <FieldError message={state?.error} />
          </div>

          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              name="description"
              placeholder="What's this group about?"
            />
          </div>

          <div>
            <Label>Members</Label>
            {others.length === 0 ? (
              <p className="mt-1 text-sm text-muted">
                No other workspace members yet — invite teammates first.
              </p>
            ) : (
              <div className="mt-1 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
                {others.map((m) => {
                  const checked = selected.has(m.id);
                  return (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => toggle(m.id)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                        checked
                          ? "bg-primary/10 text-foreground"
                          : "text-muted hover:bg-surface-2"
                      }`}
                    >
                      <span
                        className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border"
                        }`}
                      >
                        {checked && (
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
                      </span>
                      <span className="truncate">
                        {m.full_name ?? m.email}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create group"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
