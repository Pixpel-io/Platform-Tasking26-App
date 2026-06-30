"use client";

import { useState, useTransition } from "react";
import type { Profile } from "@/lib/supabase/types";
import type { BoardColumn, TaskWithRelations } from "@/lib/projects-shared";
import { useBoard } from "@/lib/use-board";
import { createTask, moveTask } from "../task-actions";
import { TaskCard } from "./task-card";
import { TaskPanel } from "./task-panel";

// Spacing between sequential task positions; midpoint inserts stay integer-ish.
const STEP = 1024;

export function KanbanBoard({
  projectId,
  initialBoard,
  members,
}: {
  projectId: string;
  initialBoard: BoardColumn[];
  members: Profile[];
}) {
  const { board, applyLocal } = useBoard(projectId, initialBoard);
  const [dragId, setDragId] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Compute a position that lands the task at `index` within `tasks`.
  function positionFor(tasks: TaskWithRelations[], index: number): number {
    const before = tasks[index - 1]?.position;
    const after = tasks[index]?.position;
    if (before == null && after == null) return STEP;
    if (before == null) return after! - STEP;
    if (after == null) return before + STEP;
    return (before + after) / 2;
  }

  function handleDrop(columnId: string, index: number) {
    if (!dragId) return;
    const taskId = dragId;
    setDragId(null);

    const col = board.find((c) => c.id === columnId);
    if (!col) return;
    // Exclude the dragged task itself when measuring neighbors.
    const without = col.tasks.filter((t) => t.id !== taskId);
    const position = positionFor(without, index);

    applyLocal((cols) => {
      let moved: TaskWithRelations | undefined;
      const stripped = cols.map((c) => {
        const found = c.tasks.find((t) => t.id === taskId);
        if (found) moved = found;
        return { ...c, tasks: c.tasks.filter((t) => t.id !== taskId) };
      });
      if (!moved) return cols;
      const updated = { ...moved, column_id: columnId, position };
      return stripped.map((c) => {
        if (c.id !== columnId) return c;
        const tasks = [...c.tasks];
        const insertAt = Math.min(index, tasks.length);
        tasks.splice(insertAt, 0, updated);
        return { ...c, tasks };
      });
    });

    startTransition(async () => {
      await moveTask(taskId, columnId, position);
    });
  }

  return (
    <>
      <div className="flex h-full gap-4 overflow-x-auto p-6">
        {board.map((column) => (
          <Column
            key={column.id}
            column={column}
            projectId={projectId}
            dragId={dragId}
            onDragStart={setDragId}
            onDrop={handleDrop}
            onOpenTask={setOpenTaskId}
          />
        ))}
      </div>

      {openTaskId && (
        <TaskPanel
          taskId={openTaskId}
          members={members}
          onClose={() => setOpenTaskId(null)}
        />
      )}
    </>
  );
}

function Column({
  column,
  projectId,
  dragId,
  onDragStart,
  onDrop,
  onOpenTask,
}: {
  column: BoardColumn;
  projectId: string;
  dragId: string | null;
  onDragStart: (id: string) => void;
  onDrop: (columnId: string, index: number) => void;
  onOpenTask: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [over, setOver] = useState(false);
  const [, startTransition] = useTransition();

  function submitNew() {
    const value = title.trim();
    if (!value) {
      setAdding(false);
      return;
    }
    setTitle("");
    setAdding(false);
    startTransition(async () => {
      await createTask({ projectId, columnId: column.id, title: value });
    });
  }

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl bg-surface-2/40">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {column.name}
          </span>
          <span className="rounded-full bg-surface px-1.5 text-xs text-muted">
            {column.tasks.length}
          </span>
        </div>
        <button
          onClick={() => setAdding(true)}
          aria-label={`Add task to ${column.name}`}
          className="grid h-5 w-5 place-items-center rounded text-muted hover:bg-surface hover:text-foreground"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <div
        className={`min-h-2 flex-1 space-y-2 overflow-y-auto rounded-lg px-2 pb-2 transition-colors duration-150 ${
          over ? "bg-primary/5 ring-2 ring-inset ring-primary/30" : ""
        }`}
        onDragOver={(e) => {
          if (dragId) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={() => {
          setOver(false);
          onDrop(column.id, column.tasks.length);
        }}
      >
        {column.tasks.map((task, index) => (
          <div
            key={task.id}
            onDragOver={(e) => {
              if (dragId) e.preventDefault();
            }}
            onDrop={(e) => {
              if (!dragId) return;
              e.stopPropagation();
              setOver(false);
              onDrop(column.id, index);
            }}
          >
            <TaskCard
              task={task}
              dragging={dragId === task.id}
              onDragStart={() => onDragStart(task.id)}
              onClick={() => onOpenTask(task.id)}
            />
          </div>
        ))}

        {adding ? (
          <textarea
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={submitNew}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitNew();
              }
              if (e.key === "Escape") {
                setTitle("");
                setAdding(false);
              }
            }}
            placeholder="Task title…"
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full rounded-lg px-3 py-1.5 text-left text-sm text-muted hover:bg-surface hover:text-foreground"
          >
            + Add task
          </button>
        )}
      </div>
    </div>
  );
}
