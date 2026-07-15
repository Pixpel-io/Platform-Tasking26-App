import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import type {
  ActivityLog,
  KanbanColumn,
  Label,
  Profile,
} from "@/lib/supabase/types";
import {
  buildBoard,
  type BoardColumn,
  type ProjectWithMembers,
  type TaskDetail,
  type TaskWithRelations,
} from "@/lib/projects-shared";

export {
  buildBoard,
  PRIORITY_META,
  PRIORITY_ORDER,
  formatDuration,
} from "@/lib/projects-shared";
export type {
  BoardColumn,
  ProjectWithMembers,
  TaskDetail,
  TaskWithRelations,
  ChecklistWithItems,
} from "@/lib/projects-shared";

const TASK_SELECT =
  "*, task_assignees(user_id, profiles(*)), task_labels(label_id, labels(*)), comment_count:task_comments(count)";

// Projects the current user can see in a workspace (member, or workspace admin).
export const getProjects = cache(
  async (workspaceId: string): Promise<ProjectWithMembers[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("projects")
      .select("*, project_members(user_id, profiles(*))")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .is("project_members.deleted_at", null)
      .order("created_at", { ascending: false });
    return (data as ProjectWithMembers[] | null) ?? [];
  },
);

export async function getProject(
  projectId: string,
): Promise<ProjectWithMembers | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("*, project_members(user_id, profiles(*))")
    .eq("id", projectId)
    .is("deleted_at", null)
    .is("project_members.deleted_at", null)
    .single();
  return (data as ProjectWithMembers | null) ?? null;
}

export async function getColumns(
  projectId: string,
): Promise<KanbanColumn[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kanban_columns")
    .select("*")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("position", { ascending: true });
  return data ?? [];
}

export async function getTasks(
  projectId: string,
): Promise<TaskWithRelations[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("project_id", projectId)
    .is("parent_id", null)
    .is("deleted_at", null)
    .order("position", { ascending: true });
  return (data as TaskWithRelations[] | null) ?? [];
}

// Columns + tasks assembled into board shape for the Kanban view.
export async function getBoard(projectId: string): Promise<BoardColumn[]> {
  const [columns, tasks] = await Promise.all([
    getColumns(projectId),
    getTasks(projectId),
  ]);
  return buildBoard(columns, tasks);
}

export async function getTaskDetail(
  taskId: string,
): Promise<TaskDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select(
      "*, task_assignees(user_id, profiles(*)), task_labels(label_id, labels(*)), task_watchers(user_id), task_comments(*, profiles(*)), checklists(*, checklist_items(*))",
    )
    .eq("id", taskId)
    .is("deleted_at", null)
    .single();
  return (data as TaskDetail | null) ?? null;
}

export const getLabels = cache(
  async (workspaceId: string): Promise<Label[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("labels")
      .select("*")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("name", { ascending: true });
    return data ?? [];
  },
);

export const getProjectMembers = cache(
  async (projectId: string): Promise<Profile[]> => {
    await requireUser();
    const supabase = await createClient();
    const { data } = await supabase
      .from("project_members")
      .select("profiles(*)")
      .eq("project_id", projectId)
      .is("deleted_at", null);
    const rows = (data as { profiles: Profile | null }[] | null) ?? [];
    return rows.map((r) => r.profiles).filter((p): p is Profile => p !== null);
  },
);

export type CrossWorkspaceTask = {
  id: string;
  title: string;
  due_date: string | null;
  project_id: string;
  project_name: string;
  workspace_id: string;
};

// Every open task assigned to the current user, across ALL workspaces they
// belong to - powers the combined dashboard overview. Assignees are seated as
// project members (0035), so RLS on tasks exposes exactly these rows. Soonest
// due first, then most recently created.
export const getMyOpenTasksAcrossWorkspaces = cache(
  async (): Promise<CrossWorkspaceTask[]> => {
    const user = await requireUser();
    const supabase = await createClient();
    const { data } = await supabase
      .from("tasks")
      .select(
        "id, title, due_date, created_at, project_id, projects!inner(name, workspace_id), task_assignees!inner(user_id)",
      )
      .eq("task_assignees.user_id", user.id)
      .is("parent_id", null)
      .is("deleted_at", null)
      .is("completed_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    const rows =
      (data as
        | {
            id: string;
            title: string;
            due_date: string | null;
            project_id: string;
            projects: { name: string; workspace_id: string } | null;
          }[]
        | null) ?? [];

    return rows
      .filter((r) => r.projects != null)
      .map((r) => ({
        id: r.id,
        title: r.title,
        due_date: r.due_date,
        project_id: r.project_id,
        project_name: r.projects!.name,
        workspace_id: r.projects!.workspace_id,
      }));
  },
);

export async function getProjectActivity(
  projectId: string,
  limit = 30,
): Promise<(ActivityLog & { profiles: Profile | null })[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activity_logs")
    .select("*, profiles:actor_id(*)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (
    (data as (ActivityLog & { profiles: Profile | null })[] | null) ?? []
  );
}

// Recent activity across every project the user can see in a workspace. RLS
// filters out projects the caller isn't a member of (or workspace admin for).
export async function getWorkspaceActivity(
  workspaceId: string,
  limit = 15,
): Promise<(ActivityLog & { profiles: Profile | null })[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activity_logs")
    .select("*, profiles:actor_id(*)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (
    (data as (ActivityLog & { profiles: Profile | null })[] | null) ?? []
  );
}
