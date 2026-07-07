"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button, FieldError, FormMessage, Input, Label } from "@/components/ui";
import type { PriorityLevel, Profile } from "@/lib/supabase/types";
import { PRIORITY_META, PRIORITY_ORDER } from "@/lib/projects-shared";
import { createProject } from "./project-actions";

export function CreateProjectDialog({
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
  const action = createProject.bind(null, workspaceId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [priority, setPriority] = useState<PriorityLevel>("none");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setPriority("none");
    }
  }, [open]);

  if (!open) return null;

  const others = members.filter((m) => m.id !== meId);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Portal to <body>: ancestors with backdrop-filter/transform would trap
  // this fixed overlay and let page content bleed through the dialog.
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground">
          Create a project
        </h2>
        <p className="mt-1 text-sm text-muted">
          A project gets a Kanban board and is private to its members.
        </p>

        <form action={formAction} className="mt-4 space-y-4">
          {state?.error && <FormMessage type="error">{state.error}</FormMessage>}

          {[...selected].map((id) => (
            <input key={id} type="hidden" name="memberIds" value={id} />
          ))}
          <input type="hidden" name="priority" value={priority} />

          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              placeholder="Website redesign"
              autoFocus
              required
            />
            <FieldError message={state?.error} />
          </div>

          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              name="description"
              placeholder="What's this project about?"
            />
          </div>

          <div>
            <Label>Priority</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {PRIORITY_ORDER.map((p) => {
                const meta = PRIORITY_META[p];
                const active = priority === p;
                return (
                  <button
                    type="button"
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted hover:bg-surface-2"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Members</Label>
            {others.length === 0 ? (
              <p className="mt-1 text-sm text-muted">
                No other workspace members yet - invite teammates first.
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
                      <span className="truncate">{m.full_name ?? m.email}</span>
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
              {pending ? "Creating…" : "Create project"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
