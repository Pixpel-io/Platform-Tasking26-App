"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/supabase/types";
import type { BoardColumn, TaskWithRelations } from "@/lib/projects-shared";
import { commentCount, PRIORITY_META } from "@/lib/projects-shared";
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

// ── Column sorting ──────────────────────────────────────────────────────────
type SortKey = "task" | "status" | "priority" | "sqa" | "due" | "people";
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

const SORT_PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};
const SORT_SQA_RANK: Record<string, number> = {
  pending: 0,
  in_testing: 1,
  done: 2,
};

type Row = { task: TaskWithRelations; column: BoardColumn };

function compareRows(
  a: Row,
  b: Row,
  key: SortKey,
  dir: "asc" | "desc",
  board: BoardColumn[],
): number {
  const mult = dir === "asc" ? 1 : -1;
  // Undated tasks always sink to the bottom, regardless of direction.
  if (key === "due") {
    const av = a.task.due_date;
    const bv = b.task.due_date;
    if (!av && !bv) return 0;
    if (!av) return 1;
    if (!bv) return -1;
    return (new Date(av).getTime() - new Date(bv).getTime()) * mult;
  }
  let base = 0;
  switch (key) {
    case "task":
      // numeric:true so "Task 2" sorts before "Task 10" (1→99 style).
      base = a.task.title.localeCompare(b.task.title, undefined, {
        numeric: true,
        sensitivity: "base",
      });
      break;
    case "status":
      base =
        board.findIndex((c) => c.id === a.column.id) -
        board.findIndex((c) => c.id === b.column.id);
      break;
    case "priority":
      base =
        (SORT_PRIORITY_RANK[a.task.priority] ?? 99) -
        (SORT_PRIORITY_RANK[b.task.priority] ?? 99);
      break;
    case "sqa":
      base =
        (SORT_SQA_RANK[a.task.sqa_status] ?? 99) -
        (SORT_SQA_RANK[b.task.sqa_status] ?? 99);
      break;
    case "people":
      base = a.task.task_assignees.length - b.task.task_assignees.length;
      break;
  }
  return base * mult;
}

// Header cell with stacked up/down arrows. Click cycles asc → desc → off.
function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const dir = sort?.key === sortKey ? sort.dir : null;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      title={`Sort by ${label}`}
      className={`group/sort flex h-full cursor-pointer items-center gap-1 py-2 text-left transition-colors hover:text-foreground ${
        dir ? "text-foreground" : ""
      } ${className ?? "px-3"}`}
    >
      <span>{label}</span>
      <span className="flex flex-col leading-none transition-opacity group-hover/sort:opacity-100">
        <svg
          className={`h-2 w-2 ${dir === "asc" ? "text-primary" : "text-muted/40"}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m18 15-6-6-6 6" />
        </svg>
        <svg
          className={`h-2 w-2 ${dir === "desc" ? "text-primary" : "text-muted/40"}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </button>
  );
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

  // -- Toolbar filters (Monday-style: search / person / status / priority) ---
  const [search, setSearch] = useState("");
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const [hideDone, setHideDone] = useState(false);
  const [sort, setSort] = useState<SortState>(null);

  // asc → desc → off, so a third click on the same column clears the sort and
  // restores the natural status/position order.
  function onSort(key: SortKey) {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  // One flat list: every task with its status column, ordered by status then
  // position. Status lives ONLY in the Status cell - no duplicate grouping.
  const allRows = board.flatMap((column) =>
    column.tasks.map((task) => ({ task, column })),
  );

  const query = search.trim().toLowerCase();
  const filtered = allRows.filter(({ task, column }) => {
    if (query && !task.title.toLowerCase().includes(query)) return false;
    if (personFilter && !task.task_assignees.some((a) => a.user_id === personFilter)) {
      return false;
    }
    if (statusFilter && column.id !== statusFilter) return false;
    if (priorityFilter && task.priority !== priorityFilter) return false;
    if (hideDone && task.completed_at != null) return false;
    return true;
  });
  const rows = sort
    ? [...filtered].sort((a, b) => compareRows(a, b, sort.key, sort.dir, board))
    : filtered;
  const filtering =
    query !== "" ||
    personFilter != null ||
    statusFilter != null ||
    priorityFilter != null ||
    hideDone;
  const doneCount = allRows.filter(({ task }) => task.completed_at != null).length;

  return (
    <div className="overflow-y-auto overflow-x-hidden p-3 sm:p-6">
      <TableToolbar
        board={board}
        members={members}
        search={search}
        onSearch={setSearch}
        personFilter={personFilter}
        onPersonFilter={setPersonFilter}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        priorityFilter={priorityFilter}
        onPriorityFilter={setPriorityFilter}
        hideDone={hideDone}
        onHideDone={setHideDone}
        shown={rows.length}
        total={allRows.length}
        done={doneCount}
        filtering={filtering}
        groupColorOf={(name, i) => groupColor(name, i)}
      />

      <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-border">
        {/* Header row */}
        <div className="grid grid-cols-[minmax(200px,1fr)_130px_110px_110px_110px_120px] items-center gap-0 border-b border-border bg-surface-2/40 text-xs font-medium text-muted max-lg:min-w-full max-lg:grid-cols-[minmax(140px,1fr)_100px_84px]">
          <SortHeader label="Task" sortKey="task" sort={sort} onSort={onSort} />
          <SortHeader label="Status" sortKey="status" sort={sort} onSort={onSort} className="border-l border-border/60 px-3" />
          <SortHeader label="Priority" sortKey="priority" sort={sort} onSort={onSort} className="border-l border-border/60 px-3" />
          <SortHeader label="SQA" sortKey="sqa" sort={sort} onSort={onSort} className="border-l border-border/60 px-3 max-lg:hidden" />
          <SortHeader label="Due" sortKey="due" sort={sort} onSort={onSort} className="border-l border-border/60 px-3 max-lg:hidden" />
          <SortHeader label="People" sortKey="people" sort={sort} onSort={onSort} className="border-l border-border/60 px-3 max-lg:hidden" />
        </div>

        {rows.length === 0 && (
          <p className="bg-surface px-4 py-8 text-center text-sm text-muted">
            {filtering
              ? "No tasks match the current filters."
              : "No tasks yet. Add the first one below."}
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

// ── Toolbar: search + person / status / priority filters + progress ─────────

function TableToolbar({
  board,
  members,
  search,
  onSearch,
  personFilter,
  onPersonFilter,
  statusFilter,
  onStatusFilter,
  priorityFilter,
  onPriorityFilter,
  hideDone,
  onHideDone,
  shown,
  total,
  done,
  filtering,
  groupColorOf,
}: {
  board: BoardColumn[];
  members: Profile[];
  search: string;
  onSearch: (v: string) => void;
  personFilter: string | null;
  onPersonFilter: (v: string | null) => void;
  statusFilter: string | null;
  onStatusFilter: (v: string | null) => void;
  priorityFilter: string | null;
  onPriorityFilter: (v: string | null) => void;
  hideDone: boolean;
  onHideDone: (v: boolean) => void;
  shown: number;
  total: number;
  done: number;
  filtering: boolean;
  groupColorOf: (name: string, index: number) => string;
}) {
  // Anchor lives in state (not a ref) so the popover can render off it.
  const [openMenu, setOpenMenu] = useState<{
    kind: "person" | "status" | "priority";
    anchor: HTMLElement;
  } | null>(null);

  function toggleMenu(
    kind: "person" | "status" | "priority",
    e: React.MouseEvent<HTMLButtonElement>,
  ) {
    const anchor = e.currentTarget;
    setOpenMenu((prev) => (prev?.kind === kind ? null : { kind, anchor }));
  }

  const activePerson = members.find((m) => m.id === personFilter);
  const activeStatus = board.find((c) => c.id === statusFilter);
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const chipBase =
    "flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors";
  const chipIdle = "border-border text-muted hover:bg-surface-2 hover:text-foreground";
  const chipActive = "border-primary/40 bg-primary/10 text-primary";

  function clearAll() {
    onSearch("");
    onPersonFilter(null);
    onStatusFilter(null);
    onPriorityFilter(null);
    onHideDone(false);
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search tasks…"
          className="h-8 w-44 rounded-lg border border-border bg-surface pl-8 pr-7 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none sm:w-56"
        />
        {search && (
          <button
            onClick={() => onSearch("")}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 cursor-pointer place-items-center rounded text-muted hover:text-foreground"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Person filter */}
      <button
        onClick={(e) => toggleMenu("person", e)}
        className={`${chipBase} ${activePerson ? chipActive : chipIdle}`}
      >
        {activePerson ? (
          <>
            <Avatar
              name={activePerson.full_name}
              email={activePerson.email}
              avatarUrl={activePerson.avatar_url}
              size="xs"
            />
            <span className="max-w-24 truncate">
              {activePerson.full_name ?? activePerson.email}
            </span>
          </>
        ) : (
          <>
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Person
          </>
        )}
      </button>
      {openMenu?.kind === "person" && (
        <CellPopover anchor={openMenu.anchor} onClose={() => setOpenMenu(null)} width={208}>
          {members.map((m) => {
            const active = personFilter === m.id;
            return (
              <button
                key={m.id}
                onClick={() => {
                  onPersonFilter(active ? null : m.id);
                  setOpenMenu(null);
                }}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                  active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-surface-2"
                }`}
              >
                <Avatar name={m.full_name} email={m.email} avatarUrl={m.avatar_url} size="xs" />
                <span className="min-w-0 flex-1 truncate">{m.full_name ?? m.email}</span>
              </button>
            );
          })}
        </CellPopover>
      )}

      {/* Status filter */}
      <button
        onClick={(e) => toggleMenu("status", e)}
        className={`${chipBase} ${activeStatus ? chipActive : chipIdle}`}
      >
        {activeStatus ? (
          <>
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{
                backgroundColor: groupColorOf(
                  activeStatus.name,
                  board.findIndex((c) => c.id === activeStatus.id),
                ),
              }}
            />
            <span className="max-w-24 truncate">{activeStatus.name}</span>
          </>
        ) : (
          <>
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 3H2l8 9.46V19l4 2v-8.54z" />
            </svg>
            Status
          </>
        )}
      </button>
      {openMenu?.kind === "status" && (
        <CellPopover anchor={openMenu.anchor} onClose={() => setOpenMenu(null)} width={192}>
          {board.map((c, i) => {
            const active = statusFilter === c.id;
            return (
              <button
                key={c.id}
                onClick={() => {
                  onStatusFilter(active ? null : c.id);
                  setOpenMenu(null);
                }}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                  active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-surface-2"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: groupColorOf(c.name, i) }}
                />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="text-xs text-muted">{c.tasks.length}</span>
              </button>
            );
          })}
        </CellPopover>
      )}

      {/* Priority filter */}
      <button
        onClick={(e) => toggleMenu("priority", e)}
        className={`${chipBase} ${priorityFilter ? chipActive : chipIdle}`}
      >
        {priorityFilter ? (
          <>
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: PRIORITY_BG[priorityFilter] }}
            />
            {PRIORITY_META[priorityFilter as keyof typeof PRIORITY_META]?.label ?? priorityFilter}
          </>
        ) : (
          <>
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" />
            </svg>
            Priority
          </>
        )}
      </button>
      {openMenu?.kind === "priority" && (
        <CellPopover anchor={openMenu.anchor} onClose={() => setOpenMenu(null)} width={176}>
          {Object.entries(PRIORITY_BG).map(([p, color]) => {
            const active = priorityFilter === p;
            return (
              <button
                key={p}
                onClick={() => {
                  onPriorityFilter(active ? null : p);
                  setOpenMenu(null);
                }}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                  active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-surface-2"
                }`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
                {PRIORITY_META[p as keyof typeof PRIORITY_META]?.label ?? p}
              </button>
            );
          })}
        </CellPopover>
      )}

      {/* Hide done toggle */}
      <button
        onClick={() => onHideDone(!hideDone)}
        className={`${chipBase} ${hideDone ? chipActive : chipIdle}`}
        title="Hide completed tasks"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />
        </svg>
        Hide done
      </button>

      {filtering && (
        <button
          onClick={clearAll}
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted transition-colors hover:text-danger"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
          Clear
        </button>
      )}

      {/* Progress summary, right-aligned */}
      <div className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted">
        {filtering && (
          <span>
            {shown} of {total}
          </span>
        )}
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2 max-sm:hidden">
          <div
            className="h-full rounded-full bg-success transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="max-sm:hidden">
          {done}/{total} done
        </span>
      </div>
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
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
    // Confirm-then-remove: the row dims while the delete is in flight and only
    // leaves the board once the server confirms. Removing optimistically hid
    // failures - rapid deletes that never committed reappeared on refresh.
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    startTransition(async () => {
      const res = await deleteTask(task.id);
      if (res.error) {
        setDeleting(false);
        setDeleteError(res.error);
      } else {
        onRemove(task.id);
      }
    });
  }

  return (
    <div
      className={`group/row grid grid-cols-[minmax(200px,1fr)_130px_110px_110px_110px_120px] items-stretch border-b border-border/60 bg-surface text-sm transition-colors last:border-b-0 hover:bg-surface-2/30 max-lg:min-w-full max-lg:grid-cols-[minmax(140px,1fr)_100px_84px] ${
        deleting ? "pointer-events-none opacity-40" : ""
      }`}
    >
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
        {/* Monday-style "add update" bubble: opens the task's Updates tab.
            With comments it stays visible and wears a count badge. */}
        {(() => {
          const updates = commentCount(task);
          return (
            <button
              onClick={onOpen}
              aria-label={
                updates > 0
                  ? `${updates} update${updates === 1 ? "" : "s"} on ${task.title}`
                  : `Open updates for ${task.title}`
              }
              title="Updates"
              className={`relative grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-md transition-all hover:bg-primary/10 hover:text-primary focus-visible:opacity-100 ${
                updates > 0
                  ? "text-primary opacity-100"
                  : "text-muted opacity-0 group-hover/row:opacity-100"
              }`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.5-.76L3 21l1.76-6A8.5 8.5 0 1 1 21 11.5z" />
                {updates === 0 && <path d="M12 8v6M9 11h6" />}
              </svg>
              {updates > 0 && (
                <span className="absolute -right-1 -top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-primary px-0.5 text-[9px] font-bold leading-none text-primary-foreground">
                  {updates > 9 ? "9+" : updates}
                </span>
              )}
            </button>
          );
        })()}
        {deleteError && (
          <span
            className="shrink-0 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger"
            title={deleteError}
          >
            Delete failed
          </span>
        )}
        <button
          onClick={removeTask}
          disabled={deleting}
          aria-label={`Delete ${task.title}`}
          title="Delete task"
          className={`grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted transition-all hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover/row:opacity-100 ${
            deleting ? "opacity-100" : "opacity-0"
          }`}
        >
          {deleting ? (
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          )}
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

      {/* SQA approval cell */}
      <SqaCell task={task} onPatch={onPatch} />

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

// ── Cell: SQA approval (pending / in testing / done) ────────────────────────

const SQA_META: Record<
  "pending" | "in_testing" | "done",
  { label: string; bg: string }
> = {
  pending: { label: "Pending", bg: "#797e93" },
  in_testing: { label: "In Testing", bg: "#fdab3d" },
  done: { label: "Done", bg: "#00c875" },
};
const SQA_ORDER = ["pending", "in_testing", "done"] as const;

function SqaCell({
  task,
  onPatch,
}: {
  task: TaskWithRelations;
  onPatch: (taskId: string, patch: Partial<TaskWithRelations>) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [, startTransition] = useTransition();
  const close = useCallback(() => setAnchor(null), []);
  const current = SQA_META[task.sqa_status] ?? SQA_META.pending;

  function pick(next: (typeof SQA_ORDER)[number]) {
    close();
    onPatch(task.id, { sqa_status: next });
    startTransition(() => {
      void updateTask(task.id, { sqaStatus: next });
    });
  }

  return (
    <div className="relative border-l border-border/60 max-lg:hidden">
      <button
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className="h-full w-full cursor-pointer px-1 py-1"
      >
        <span
          className="flex h-full min-h-7 w-full items-center justify-center rounded-sm text-xs font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: current.bg }}
        >
          {current.label}
        </span>
      </button>
      {anchor && (
        <CellPopover anchor={anchor} onClose={close} width={150}>
          {SQA_ORDER.map((k) => (
            <button
              key={k}
              onClick={() => pick(k)}
              className="mb-1 block w-full cursor-pointer rounded-sm px-2 py-1.5 text-center text-xs font-medium text-white transition-opacity last:mb-0 hover:opacity-85"
              style={{ backgroundColor: SQA_META[k].bg }}
            >
              {SQA_META[k].label}
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
