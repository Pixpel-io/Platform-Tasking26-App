"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/supabase/types";
import type { BoardColumn, TaskWithRelations } from "@/lib/projects-shared";
import { PRIORITY_META } from "@/lib/projects-shared";
import { useBoard } from "@/lib/use-board";
import { Avatar } from "@/components/avatar";
import {
  createColumn,
  createTask,
  deleteTask,
  moveTask,
  setTaskCompleted,
  toggleAssignee,
  updateTask,
} from "../task-actions";
import { TaskPanel } from "./task-panel";

// Popovers render into a body portal at a fixed position so the group's
// rounded/overflow-hidden container can't clip them (the assignee dropdown
// was unusable inside short groups).
function CellPopover({
  anchor,
  onClose,
  width = 176,
  children,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Position derives from the anchor at mount (client-only, rect available in
  // the lazy initializer - avoids a setState-in-effect render cascade).
  const [pos] = useState<{ top: number; left: number }>(() => {
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    let left = rect.left;
    if (left + width > window.innerWidth - margin) {
      left = rect.right - width;
    }
    left = Math.max(margin, left);
    // Below the cell by default; flip above when near the bottom.
    const estimatedH = 260;
    const top =
      rect.bottom + estimatedH > window.innerHeight - margin
        ? Math.max(margin, rect.top - estimatedH)
        : rect.bottom + 4;
    return { top, left };
  });

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !anchor.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, width, zIndex: 80 }}
      className="max-h-64 animate-scale-in overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-xl"
    >
      {children}
    </div>,
    document.body,
  );
}

// Monday.com-style table: one colored group per status column, rows with
// inline-editable status / priority / due / assignees, and an add-task row
// per group. Data flows through useBoard so realtime keeps every cell live.

// Stable accent per group, Monday-style. Known names get semantic colors.
const GROUP_COLORS = ["#579bfc", "#a25ddc", "#ffcb00", "#00c875", "#ff642e", "#e2445c"];
function groupColor(name: string, index: number): string {
  const n = name.toLowerCase();
  if (/(done|complete|shipped|closed)/.test(n)) return "#00c875";
  if (/(progress|doing|active|review)/.test(n)) return "#fdab3d";
  if (/(todo|to do|backlog|planned)/.test(n)) return "#579bfc";
  return GROUP_COLORS[index % GROUP_COLORS.length];
}

const PRIORITY_BG: Record<string, string> = {
  urgent: "#e2445c",
  high: "#ff642e",
  medium: "#fdab3d",
  low: "#579bfc",
  none: "#797e93",
};

function fmtDue(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function MondayTable({
  projectId,
  initialBoard,
  members,
}: {
  projectId: string;
  initialBoard: BoardColumn[];
  members: Profile[];
}) {
  const { board, applyLocal } = useBoard(projectId, initialBoard);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // -- Optimistic patchers ---------------------------------------------------

  function removeTaskLocal(taskId: string) {
    applyLocal((cols) =>
      cols.map((c) => ({ ...c, tasks: c.tasks.filter((t) => t.id !== taskId) })),
    );
  }

  function patchTask(taskId: string, patch: Partial<TaskWithRelations>) {
    applyLocal((cols) =>
      cols.map((c) => ({
        ...c,
        tasks: c.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
      })),
    );
  }

  function changeStatus(task: TaskWithRelations, toColumnId: string) {
    if (task.column_id === toColumnId) return;
    const target = board.find((c) => c.id === toColumnId);
    const position =
      (target?.tasks[target.tasks.length - 1]?.position ?? 0) + 1024;
    applyLocal((cols) => {
      let moved: TaskWithRelations | undefined;
      const stripped = cols.map((c) => {
        const found = c.tasks.find((t) => t.id === task.id);
        if (found) moved = found;
        return { ...c, tasks: c.tasks.filter((t) => t.id !== task.id) };
      });
      if (!moved) return cols;
      const updated = { ...moved, column_id: toColumnId, position };
      return stripped.map((c) =>
        c.id === toColumnId ? { ...c, tasks: [...c.tasks, updated] } : c,
      );
    });
    startTransition(() => {
      void moveTask(task.id, toColumnId, position);
    });
  }

  // One flat list: every task with its status column, ordered by status then
  // position. Status lives ONLY in the Status cell - no duplicate grouping.
  const rows = board.flatMap((column) =>
    column.tasks.map((task) => ({ task, column })),
  );

  return (
    <div className="overflow-y-auto p-4 sm:p-6">
      <div className="overflow-hidden rounded-lg border border-border">
        {/* Header row */}
        <div className="grid grid-cols-[minmax(200px,1fr)_130px_110px_110px_120px] items-center gap-0 border-b border-border bg-surface-2/40 text-xs font-medium text-muted max-lg:grid-cols-[minmax(160px,1fr)_110px_100px]">
          <span className="px-3 py-2">Task</span>
          <span className="border-l border-border/60 px-3 py-2">Status</span>
          <span className="border-l border-border/60 px-3 py-2">Priority</span>
          <span className="border-l border-border/60 px-3 py-2 max-lg:hidden">Due</span>
          <span className="border-l border-border/60 px-3 py-2 max-lg:hidden">People</span>
        </div>

        {rows.length === 0 && (
          <p className="bg-surface px-4 py-8 text-center text-sm text-muted">
            No tasks yet. Add the first one below.
          </p>
        )}

        {rows.map(({ task, column }) => (
          <TaskRow
            key={task.id}
            task={task}
            column={column}
            board={board}
            members={members}
            projectId={projectId}
            onOpen={() => setOpenTaskId(task.id)}
            onChangeStatus={changeStatus}
            onPatch={patchTask}
            onRemove={removeTaskLocal}
            groupColorOf={(name, i) => groupColor(name, i)}
          />
        ))}

        <AddTaskRow
          projectId={projectId}
          columnId={board[0]?.id ?? ""}
          color={groupColor(board[0]?.name ?? "", 0)}
        />
      </div>

      {openTaskId && (
        <TaskPanel
          taskId={openTaskId}
          members={members}
          onClose={() => setOpenTaskId(null)}
        />
      )}
    </div>
  );
}

// ── One task row ────────────────────────────────────────────────────────────

function TaskRow({
  task,
  column,
  board,
  members,
  projectId,
  onOpen,
  onChangeStatus,
  onPatch,
  onRemove,
  groupColorOf,
}: {
  task: TaskWithRelations;
  column: BoardColumn;
  board: BoardColumn[];
  members: Profile[];
  projectId: string;
  onOpen: () => void;
  onChangeStatus: (task: TaskWithRelations, toColumnId: string) => void;
  onPatch: (taskId: string, patch: Partial<TaskWithRelations>) => void;
  onRemove: (taskId: string) => void;
  groupColorOf: (name: string, index: number) => string;
}) {
  const [, startTransition] = useTransition();
  const done = task.completed_at != null;
  const assignees = task.task_assignees
    .map((a) => a.profiles)
    .filter((p): p is NonNullable<typeof p> => p != null);

  function toggleDone() {
    onPatch(task.id, {
      completed_at: done ? null : new Date().toISOString(),
    });
    startTransition(() => {
      void setTaskCompleted(task.id, !done);
    });
  }

  function removeTask() {
    // Optimistic: pull the row out immediately; realtime confirms.
    onRemove(task.id);
    startTransition(() => {
      void deleteTask(task.id);
    });
  }

  return (
    <div className="group/row grid grid-cols-[minmax(200px,1fr)_130px_110px_110px_120px] items-stretch border-b border-border/60 bg-surface text-sm transition-colors last:border-b-0 hover:bg-surface-2/30 max-lg:grid-cols-[minmax(160px,1fr)_110px_100px]">
      {/* Title + done checkbox + delete */}
      <div className="flex min-w-0 items-center gap-2.5 px-3 py-2">
        <button
          onClick={toggleDone}
          aria-label={done ? "Mark incomplete" : "Mark complete"}
          className={`grid h-4.5 w-4.5 shrink-0 cursor-pointer place-items-center rounded-full border transition-colors ${
            done
              ? "border-success bg-success text-white"
              : "border-border text-transparent hover:border-success"
          }`}
        >
          <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>
        <button
          onClick={onOpen}
          className={`min-w-0 flex-1 cursor-pointer truncate text-left text-foreground hover:underline ${done ? "line-through opacity-60" : ""}`}
        >
          {task.title}
        </button>
        <button
          onClick={removeTask}
          aria-label={`Delete ${task.title}`}
          title="Delete task"
          className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted opacity-0 transition-all hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover/row:opacity-100"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>

      {/* Status cell */}
      <StatusCell
        task={task}
        board={board}
        current={column}
        projectId={projectId}
        onChangeStatus={onChangeStatus}
        groupColorOf={groupColorOf}
      />

      {/* Priority cell */}
      <PriorityCell task={task} onPatch={onPatch} />

      {/* Due cell */}
      <DueCell task={task} onPatch={onPatch} />

      {/* People cell */}
      <PeopleCell task={task} members={members} assignees={assignees} />
    </div>
  );
}

// ── Cell: status (Monday's colored pill dropdown) ───────────────────────────

function StatusCell({
  task,
  board,
  current,
  projectId,
  onChangeStatus,
  groupColorOf,
}: {
  task: TaskWithRelations;
  board: BoardColumn[];
  current: BoardColumn;
  projectId: string;
  onChangeStatus: (task: TaskWithRelations, toColumnId: string) => void;
  groupColorOf: (name: string, index: number) => string;
}) {
  const router = useRouter();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [addingStatus, setAddingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [, startTransition] = useTransition();
  const ci = board.findIndex((c) => c.id === current.id);
  const color = groupColorOf(current.name, Math.max(ci, 0));
  const close = useCallback(() => {
    setAnchor(null);
    setAddingStatus(false);
    setNewStatus("");
  }, []);

  function submitNewStatus() {
    const value = newStatus.trim();
    if (!value) {
      setAddingStatus(false);
      setNewStatus("");
      return;
    }
    close();
    startTransition(async () => {
      const res = await createColumn(projectId, value);
      if (res.id) {
        onChangeStatus(task, res.id);
        router.refresh();
      }
    });
  }

  return (
    <div className="relative border-l border-border/60">
      <button
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className="h-full w-full cursor-pointer px-1 py-1"
      >
        <span
          className="flex h-full min-h-7 w-full items-center justify-center rounded-sm text-xs font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: color }}
        >
          {current.name}
        </span>
      </button>
      {anchor && (
        <CellPopover anchor={anchor} onClose={close} width={180}>
          {board.map((c, i) => (
            <button
              key={c.id}
              onClick={() => {
                close();
                onChangeStatus(task, c.id);
              }}
              className="mb-1 block w-full cursor-pointer rounded-sm px-2 py-1.5 text-center text-xs font-medium text-white transition-opacity hover:opacity-85"
              style={{ backgroundColor: groupColorOf(c.name, i) }}
            >
              {c.name}
            </button>
          ))}
          {addingStatus ? (
            <input
              autoFocus
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNewStatus();
                if (e.key === "Escape") {
                  setAddingStatus(false);
                  setNewStatus("");
                }
              }}
              onBlur={submitNewStatus}
              placeholder="New status name..."
              className="no-focus-ring w-full rounded-sm border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-muted"
            />
          ) : (
            <button
              onClick={() => setAddingStatus(true)}
              className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-sm border border-dashed border-border px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary/40 hover:text-primary"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add status
            </button>
          )}
        </CellPopover>
      )}
    </div>
  );
}

// ── Cell: priority ──────────────────────────────────────────────────────────

const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;

function PriorityCell({
  task,
  onPatch,
}: {
  task: TaskWithRelations;
  onPatch: (taskId: string, patch: Partial<TaskWithRelations>) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [, startTransition] = useTransition();
  const close = useCallback(() => setAnchor(null), []);

  function pick(p: (typeof PRIORITIES)[number]) {
    close();
    onPatch(task.id, { priority: p });
    startTransition(() => {
      void updateTask(task.id, { priority: p });
    });
  }

  return (
    <div className="relative border-l border-border/60">
      <button
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className="h-full w-full cursor-pointer px-1 py-1"
      >
        <span
          className="flex h-full min-h-7 w-full items-center justify-center rounded-sm text-xs font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: PRIORITY_BG[task.priority] }}
        >
          {PRIORITY_META[task.priority].label}
        </span>
      </button>
      {anchor && (
        <CellPopover anchor={anchor} onClose={close} width={150}>
          {PRIORITIES.map((p) => (
            <button
              key={p}
              onClick={() => pick(p)}
              className="mb-1 block w-full cursor-pointer rounded-sm px-2 py-1.5 text-center text-xs font-medium text-white transition-opacity last:mb-0 hover:opacity-85"
              style={{ backgroundColor: PRIORITY_BG[p] }}
            >
              {PRIORITY_META[p].label}
            </button>
          ))}
        </CellPopover>
      )}
    </div>
  );
}

// ── Cell: due date ──────────────────────────────────────────────────────────

function DueCell({
  task,
  onPatch,
}: {
  task: TaskWithRelations;
  onPatch: (taskId: string, patch: Partial<TaskWithRelations>) => void;
}) {
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  // "Now" captured once per mount - keeps render pure (no Date.now in render).
  const [now] = useState(() => Date.now());
  const overdue =
    task.due_date &&
    !task.completed_at &&
    new Date(task.due_date).getTime() < now;

  function onChange(value: string) {
    const next = value || null;
    onPatch(task.id, { due_date: next });
    startTransition(() => {
      void updateTask(task.id, { dueDate: next });
    });
  }

  return (
    <div className="relative border-l border-border/60 max-lg:hidden">
      <button
        onClick={() => inputRef.current?.showPicker?.()}
        className={`h-full w-full cursor-pointer px-3 py-2 text-center text-xs ${
          overdue ? "font-medium text-danger" : "text-muted"
        } hover:text-foreground`}
      >
        {task.due_date ? fmtDue(task.due_date) : "+"}
      </button>
      <input
        ref={inputRef}
        type="date"
        value={task.due_date ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="pointer-events-none absolute inset-0 opacity-0"
        tabIndex={-1}
      />
    </div>
  );
}

// ── Cell: people ────────────────────────────────────────────────────────────

function PeopleCell({
  task,
  members,
  assignees,
}: {
  task: TaskWithRelations;
  members: Profile[];
  assignees: Profile[];
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [, startTransition] = useTransition();
  const close = useCallback(() => setAnchor(null), []);
  const assignedIds = new Set(assignees.map((a) => a.id));

  function toggle(userId: string) {
    startTransition(() => {
      void toggleAssignee(task.id, userId);
    });
  }

  return (
    <div className="relative border-l border-border/60 max-lg:hidden">
      <button
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className="flex h-full w-full cursor-pointer items-center justify-center px-3 py-1.5"
      >
        {assignees.length === 0 ? (
          <span className="grid h-6 w-6 place-items-center rounded-full border border-dashed border-border text-muted">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
        ) : (
          <span className="flex -space-x-1.5">
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
          </span>
        )}
      </button>
      {anchor && (
        <CellPopover anchor={anchor} onClose={close} width={208}>
          {members.map((m) => {
            const active = assignedIds.has(m.id);
            return (
              <button
                key={m.id}
                onClick={() => toggle(m.id)}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                  active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-surface-2"
                }`}
              >
                <Avatar
                  name={m.full_name}
                  email={m.email}
                  avatarUrl={m.avatar_url}
                  size="xs"
                />
                <span className="min-w-0 flex-1 truncate">
                  {m.full_name ?? m.email}
                </span>
                {active && (
                  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </CellPopover>
      )}
    </div>
  );
}

// ── Add-task row ────────────────────────────────────────────────────────────

function AddTaskRow({
  projectId,
  columnId,
  color,
}: {
  projectId: string;
  columnId: string;
  color: string;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [, startTransition] = useTransition();

  function submit() {
    const value = title.trim();
    setTitle("");
    setAdding(false);
    if (!value) return;
    startTransition(async () => {
      await createTask({ projectId, columnId, title: value });
    });
  }

  return adding ? (
    <div className="flex items-center gap-2 bg-surface px-3 py-1.5">
      <span className="h-4.5 w-4.5 shrink-0 rounded-full border border-dashed border-border" />
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            setTitle("");
            setAdding(false);
          }
        }}
        placeholder="Task name..."
        className="no-focus-ring w-full bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted"
      />
    </div>
  ) : (
    <button
      onClick={() => setAdding(true)}
      className="flex w-full cursor-pointer items-center gap-2 bg-surface px-3 py-2 text-left text-sm text-muted transition-colors hover:text-foreground"
    >
      <svg className="h-3.5 w-3.5" style={{ color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      Add task
    </button>
  );
}
