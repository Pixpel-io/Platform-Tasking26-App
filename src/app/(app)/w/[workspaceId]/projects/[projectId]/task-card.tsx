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
      className={`group/card cursor-pointer rounded-lg border border-border bg-surface p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md ${
        dragging ? "rotate-1 scale-[0.98] opacity-40 shadow-lg" : ""
      }`}
    >
      {labels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {labels.map((l) => (
            <span
              key={l.id}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `${l.color}22`, color: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}

      <p
        className={`text-sm text-foreground ${done ? "line-through opacity-60" : ""}`}
      >
        {task.title}
      </p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {task.priority !== "none" && (
            <span className={`flex items-center gap-1 text-xs ${priority.color}`}>
              <span className={`h-2 w-2 rounded-full ${priority.dot}`} />
            </span>
          )}
          {due && (
            <span
              className={`text-xs ${due.overdue && !done ? "text-danger" : "text-muted"}`}
            >
              {due.label}
            </span>
          )}
        </div>
        {assignees.length > 0 && (
          <div className="flex -space-x-1.5">
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
          </div>
        )}
      </div>
    </div>
  );
}
