"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui";
import type { PriorityLevel, Profile } from "@/lib/supabase/types";
import {
  formatDuration,
  PRIORITY_META,
  PRIORITY_ORDER,
  type TaskDetail,
} from "@/lib/projects-shared";
import {
  addChecklist,
  addChecklistItem,
  addComment,
  deleteChecklistItem,
  logTime,
  setTaskCompleted,
  toggleAssignee,
  toggleChecklistItem,
  updateTask,
} from "../task-actions";

const DETAIL_SELECT =
  "*, task_assignees(user_id, profiles(*)), task_labels(label_id, labels(*)), task_watchers(user_id), task_comments(*, profiles(*)), checklists(*, checklist_items(*))";

export function TaskPanel({
  taskId,
  members,
  onClose,
}: {
  taskId: string;
  members: Profile[];
  onClose: () => void;
}) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();

  const reload = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("tasks")
      .select(DETAIL_SELECT)
      .eq("id", taskId)
      .single();
    setTask((data as unknown as TaskDetail | null) ?? null);
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function act(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      await reload();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !task ? (
          <div className="grid flex-1 place-items-center text-muted">
            {loading ? "Loading…" : "Task not found."}
          </div>
        ) : (
          <TaskBody
            task={task}
            members={members}
            onClose={onClose}
            act={act}
          />
        )}
      </div>
    </div>
  );
}

function TaskBody({
  task,
  members,
  act,
  onClose,
}: {
  task: TaskDetail;
  members: Profile[];
  onClose: () => void;
  act: (fn: () => Promise<unknown>) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [comment, setComment] = useState("");
  const [checklistItem, setChecklistItem] = useState<Record<string, string>>({});
  const [timeInput, setTimeInput] = useState("");
  const done = task.completed_at != null;
  const assigneeIds = new Set(task.task_assignees.map((a) => a.user_id));

  return (
    <>
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <button
          onClick={() =>
            act(() => setTaskCompleted(task.id, !done))
          }
          className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium ${
            done
              ? "bg-success/10 text-success"
              : "text-muted hover:bg-surface-2 hover:text-foreground"
          }`}
        >
          <span
            className={`grid h-4 w-4 place-items-center rounded-full border ${
              done ? "border-success bg-success text-white" : "border-border"
            }`}
          >
            {done && (
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
          {done ? "Completed" : "Mark complete"}
        </button>
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-6 p-5">
        {/* Title */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title.trim() && title !== task.title) {
              act(() => updateTask(task.id, { title: title.trim() }));
            }
          }}
          className="w-full bg-transparent text-xl font-semibold text-foreground focus:outline-none"
        />

        {/* Meta grid: priority + due date */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Priority
            </p>
            <select
              value={task.priority}
              onChange={(e) =>
                act(() =>
                  updateTask(task.id, {
                    priority: e.target.value as PriorityLevel,
                  }),
                )
              }
              className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Due date
            </p>
            <input
              type="date"
              defaultValue={task.due_date?.slice(0, 10) ?? ""}
              onChange={(e) =>
                act(() =>
                  updateTask(task.id, {
                    dueDate: e.target.value || null,
                  }),
                )
              }
              className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Assignees */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Assignees
          </p>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => {
              const active = assigneeIds.has(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => act(() => toggleAssignee(task.id, m.id))}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "bg-surface-2 text-muted hover:text-foreground"
                  }`}
                >
                  {m.full_name ?? m.email}
                </button>
              );
            })}
          </div>
        </div>

        {/* Description */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Description
          </p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              if (description !== (task.description ?? "")) {
                act(() =>
                  updateTask(task.id, {
                    description: description.trim() || null,
                  }),
                );
              }
            }}
            placeholder="Add a description…"
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
          />
        </div>

        {/* Checklists */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Checklists
            </p>
            <button
              onClick={() => act(() => addChecklist(task.id, "Checklist"))}
              className="text-xs text-primary hover:underline"
            >
              + Add checklist
            </button>
          </div>
          <div className="space-y-3">
            {task.checklists.map((cl) => {
              const total = cl.checklist_items.filter((i) => !i.deleted_at).length;
              const complete = cl.checklist_items.filter(
                (i) => !i.deleted_at && i.is_done,
              ).length;
              return (
                <div
                  key={cl.id}
                  className="rounded-lg border border-border p-3"
                >
                  <p className="text-sm font-medium text-foreground">
                    {cl.title}{" "}
                    <span className="text-xs text-muted">
                      {complete}/{total}
                    </span>
                  </p>
                  <div className="mt-2 space-y-1">
                    {cl.checklist_items
                      .filter((i) => !i.deleted_at)
                      .map((item) => (
                        <div key={item.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={item.is_done}
                            onChange={() =>
                              act(() =>
                                toggleChecklistItem(item.id, !item.is_done),
                              )
                            }
                            className="h-4 w-4 rounded border-border"
                          />
                          <span
                            className={`flex-1 text-sm ${
                              item.is_done
                                ? "text-muted line-through"
                                : "text-foreground"
                            }`}
                          >
                            {item.content}
                          </span>
                          <button
                            onClick={() =>
                              act(() => deleteChecklistItem(item.id))
                            }
                            className="text-xs text-muted hover:text-danger"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                  </div>
                  <input
                    value={checklistItem[cl.id] ?? ""}
                    onChange={(e) =>
                      setChecklistItem((prev) => ({
                        ...prev,
                        [cl.id]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const value = (checklistItem[cl.id] ?? "").trim();
                        if (value) {
                          setChecklistItem((prev) => ({ ...prev, [cl.id]: "" }));
                          act(() => addChecklistItem(cl.id, value));
                        }
                      }
                    }}
                    placeholder="Add an item…"
                    className="mt-2 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Time tracking */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Time
          </p>
          <div className="flex items-center gap-2 text-sm text-muted">
            <span>Estimate: {formatDuration(task.time_estimate_minutes)}</span>
          </div>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              min={1}
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              placeholder="Minutes"
              className="w-32 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
            />
            <Button
              variant="outline"
              onClick={() => {
                const mins = Number(timeInput);
                if (mins > 0) {
                  setTimeInput("");
                  act(() => logTime(task.id, mins));
                }
              }}
            >
              Log time
            </Button>
          </div>
        </div>

        {/* Comments */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Comments
          </p>
          <div className="space-y-3">
            {task.task_comments
              .filter((c) => !c.deleted_at)
              .map((c) => (
                <div key={c.id} className="flex gap-2">
                  <Avatar
                    name={c.profiles?.full_name}
                    email={c.profiles?.email}
                    avatarUrl={c.profiles?.avatar_url}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">
                      {c.profiles?.full_name ?? c.profiles?.email ?? "Someone"}
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {c.body}
                    </p>
                  </div>
                </div>
              ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && comment.trim()) {
                  const value = comment.trim();
                  setComment("");
                  act(() => addComment(task.id, value));
                }
              }}
              placeholder="Write a comment…"
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
            />
            <Button
              onClick={() => {
                if (comment.trim()) {
                  const value = comment.trim();
                  setComment("");
                  act(() => addComment(task.id, value));
                }
              }}
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
