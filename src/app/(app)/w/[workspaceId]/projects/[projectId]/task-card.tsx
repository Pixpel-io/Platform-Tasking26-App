"use client";

import { Avatar } from "@/components/avatar";
import { PRIORITY_META } from "@/lib/projects-shared";
import type { TaskWithRelations } from "@/lib/projects-shared";

function formatDue(due: string): { label: string; overdue: boolean } {
  const date = new Date(due);
  const label = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return { label, overdue: date.getTime() < Date.now() };
}

export function TaskCard({
  task,
  dragging,
  onDragStart,
  onClick,
}: {
  task: TaskWithRelations;
  dragging: boolean;
  onDragStart: () => void;
  onClick: () => void;
}) {
  const priority = PRIORITY_META[task.priority];
  const done = task.completed_at != null;
  const assignees = task.task_assignees
    .map((a) => a.profiles)
    .filter((p): p is NonNullable<typeof p> => p != null);
  const labels = task.task_labels
    .map((l) => l.labels)
    .filter((l): l is NonNullable<typeof l> => l != null);
  const due = task.due_date ? formatDue(task.due_date) : null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={`group/card cursor-pointer rounded-xl border border-border bg-surface p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md ${
        dragging ? "rotate-1 scale-[0.98] opacity-40 shadow-lg" : ""
      }`}
    >
      {labels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {labels.map((l) => (
            <span
              key={l.id}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `${l.color}22`, color: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-start gap-1.5">
        {done && (
          <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-success/15 text-success">
            <svg
              className="h-2.5 w-2.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
        )}
        <p
          className={`text-sm text-foreground ${done ? "line-through opacity-60" : ""}`}
        >
          {task.title}
        </p>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {task.priority !== "none" && (
            <span
              title={`${priority.label} priority`}
              className={`flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium ${priority.color}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${priority.dot}`} />
              {priority.label}
            </span>
          )}
          {due && (
            <span
              className={`flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                due.overdue && !done
                  ? "bg-danger/10 text-danger"
                  : "bg-surface-2 text-muted"
              }`}
            >
              <svg
                className="h-2.5 w-2.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              {due.label}
            </span>
          )}
        </div>
        {assignees.length > 0 && (
          <div className="flex shrink-0 -space-x-1.5">
            {assignees.slice(0, 3).map((a) => (
              <Avatar
                key={a.id}
                name={a.full_name}
                email={a.email}
                avatarUrl={a.avatar_url}
                size="xs"
                className="border-2 border-surface"
              />
            ))}
            {assignees.length > 3 && (
              <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-surface bg-surface-2 text-[9px] font-semibold text-muted">
                +{assignees.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
