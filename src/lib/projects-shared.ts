// Client-safe types + helpers for Phase 2 (Project Management). No server-only
// imports here so client components can use these freely (mirrors chat-shared).

import type {
  Checklist,
  ChecklistItem,
  KanbanColumn,
  Label,
  PriorityLevel,
  Profile,
  Project,
  Task,
  TaskComment,
} from "@/lib/supabase/types";

export type TaskWithRelations = Task & {
  task_assignees: { user_id: string; profiles: Profile | null }[];
  task_labels: { label_id: string; labels: Label | null }[];
};

export type ChecklistWithItems = Checklist & {
  checklist_items: ChecklistItem[];
};

export type TaskDetail = TaskWithRelations & {
  task_comments: (TaskComment & { profiles: Profile | null })[];
  checklists: ChecklistWithItems[];
  task_watchers: { user_id: string }[];
};

export type ProjectWithMembers = Project & {
  project_members: { user_id: string; profiles: Profile | null }[];
};

export type BoardColumn = KanbanColumn & { tasks: TaskWithRelations[] };

export const PRIORITY_META: Record<
  PriorityLevel,
  { label: string; color: string; dot: string }
> = {
  none: { label: "None", color: "text-muted", dot: "bg-muted/40" },
  low: { label: "Low", color: "text-sky-500", dot: "bg-sky-500" },
  medium: { label: "Medium", color: "text-amber-500", dot: "bg-amber-500" },
  high: { label: "High", color: "text-orange-500", dot: "bg-orange-500" },
  urgent: { label: "Urgent", color: "text-red-500", dot: "bg-red-500" },
};

export const PRIORITY_ORDER: PriorityLevel[] = [
  "urgent",
  "high",
  "medium",
  "low",
  "none",
];

// Group flat tasks into their board columns, ordered by column position then
// task position. Tasks with no column fall into the first column.
export function buildBoard(
  columns: KanbanColumn[],
  tasks: TaskWithRelations[],
): BoardColumn[] {
  const sorted = [...columns].sort((a, b) => a.position - b.position);
  const byColumn = new Map<string, TaskWithRelations[]>();
  for (const col of sorted) byColumn.set(col.id, []);

  const fallback = sorted[0]?.id;
  for (const t of tasks) {
    const key = t.column_id && byColumn.has(t.column_id) ? t.column_id : fallback;
    if (key) byColumn.get(key)!.push(t);
  }
  for (const list of byColumn.values()) {
    list.sort((a, b) => a.position - b.position);
  }
  return sorted.map((col) => ({ ...col, tasks: byColumn.get(col.id) ?? [] }));
}

export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
