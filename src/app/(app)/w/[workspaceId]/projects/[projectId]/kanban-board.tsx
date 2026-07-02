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
      <div className="flex h-full gap-3 overflow-x-auto p-3 sm:gap-4 sm:p-6">
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

// Stable accent per column so boards read as distinct lanes. Common column
// names get semantic colors; anything else falls back on a hash of the name.
const COLUMN_ACCENTS = [
  "#38bdf8",
  "#a78bfa",
  "#fbbf24",
  "#34d399",
  "#f472b6",
  "#fb923c",
];
function columnAccent(name: string): string {
  const n = name.toLowerCase();
  if (/(done|complete|shipped|closed)/.test(n)) return "#34d399";
  if (/(progress|doing|active|review)/.test(n)) return "#fbbf24";
  if (/(todo|to do|backlog|planned)/.test(n)) return "#38bdf8";
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return COLUMN_ACCENTS[Math.abs(hash) % COLUMN_ACCENTS.length];
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
  const accent = columnAccent(column.name);

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
    <div
      className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-surface-2/40 transition-all duration-150 ${
        over
          ? "border-primary/40 shadow-lg shadow-primary/10"
          : "border-border/50"
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: accent, boxShadow: `0 0 8px ${accent}66` }}
          />
          <span className="truncate text-sm font-semibold text-foreground">
            {column.name}
          </span>
          <span className="rounded-full bg-surface px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted">
            {column.tasks.length}
          </span>
        </div>
        <button
          onClick={() => setAdding(true)}
          aria-label={`Add task to ${column.name}`}
          className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted transition-colors hover:bg-primary/15 hover:text-primary"
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
        className={`min-h-2 flex-1 space-y-2 overflow-y-auto rounded-xl px-2 pb-2 transition-colors duration-150 ${
          over ? "bg-primary/5" : ""
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

        {column.tasks.length === 0 && !adding && (
          <div
            className={`grid place-items-center rounded-xl border border-dashed px-3 py-6 text-center text-xs transition-colors duration-150 ${
              over
                ? "border-primary/50 text-primary"
                : "border-border/70 text-muted/60"
            }`}
          >
            {dragId ? "Drop here" : "No tasks yet"}
          </div>
        )}

        {adding ? (
          <div className="animate-scale-in rounded-xl border border-primary/40 bg-surface p-1 shadow-md shadow-primary/10">
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
              className="w-full resize-none rounded-lg bg-transparent px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus-visible:outline-none"
            />
            <p className="px-2.5 pb-1 text-[10px] text-muted/70">
              Enter to add · Esc to cancel
            </p>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="group/add flex w-full cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-left text-sm text-muted transition-all duration-150 hover:bg-surface hover:text-foreground"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 transition-transform duration-150 group-hover/add:rotate-90"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add task
          </button>
        )}
      </div>
    </div>
  );
}
