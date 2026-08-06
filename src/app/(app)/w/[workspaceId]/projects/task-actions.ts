"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import type { PriorityLevel } from "@/lib/supabase/types";
import { isS3Path, S3_PATH_PREFIX } from "@/lib/s3-shared";

type Result = { error?: string };
const OWNED_S3_PATH_RE = /^s3:uploads\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/i;

// Same shape as chat's PendingAttachment (chat-actions.ts): the client has
// already uploaded each file to storage and hands us the metadata + storage
// path to persist against the freshly-created comment row.
export type PendingCommentAttachment = {
  storagePath: string;
  thumbPath?: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  kind: "file" | "image" | "video" | "voice";
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
};

// -- Create ------------------------------------------------------------------

export async function createTask(args: {
  projectId: string;
  columnId: string | null;
  title: string;
  priority?: PriorityLevel;
  dueDate?: string | null;
  assigneeIds?: string[];
}): Promise<Result & { id?: string }> {
  const user = await requireUser();
  const title = args.title.trim();
  if (!title) return { error: "Task title is required." };

  const supabase = await createClient();

  // Append to the end of the target column.
  let position = 0;
  if (args.columnId) {
    const { data: last } = await supabase
      .from("tasks")
      .select("position")
      .eq("column_id", args.columnId)
      .is("deleted_at", null)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    position = (last?.position ?? 0) + 1024;
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      project_id: args.projectId,
      column_id: args.columnId,
      title,
      priority: args.priority ?? "none",
      due_date: args.dueDate ?? null,
      position,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (args.assigneeIds && args.assigneeIds.length > 0) {
    // The task_assignees_seat_member trigger (0035) seats each assignee into
    // project_members, so their "assigned you a task" notification opens the
    // board instead of a 404.
    await supabase.from("task_assignees").insert(
      args.assigneeIds.map((uid) => ({ task_id: task.id, user_id: uid })),
    );
  }

  revalidatePath(`/w/[workspaceId]/projects/${args.projectId}`, "page");
  return { id: task.id };
}

// -- Move (Kanban drag / position change) ------------------------------------

export async function moveTask(
  taskId: string,
  columnId: string,
  position: number,
): Promise<Result> {
  await requireUser();
  const supabase = await createClient();

  // Moving into a column flagged is_done auto-completes; leaving clears it.
  const { data: col } = await supabase
    .from("kanban_columns")
    .select("is_done")
    .eq("id", columnId)
    .single();

  const { error } = await supabase
    .from("tasks")
    .update({
      column_id: columnId,
      position,
      completed_at: col?.is_done ? new Date().toISOString() : null,
    })
    .eq("id", taskId);

  if (error) return { error: error.message };
  return {};
}

// -- Generic field updates ---------------------------------------------------

export async function updateTask(
  taskId: string,
  patch: {
    title?: string;
    description?: string | null;
    priority?: PriorityLevel;
    startDate?: string | null;
    dueDate?: string | null;
    timeEstimateMinutes?: number | null;
    sqaStatus?: "pending" | "in_testing" | "done";
  },
): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({
      title: patch.title,
      description: patch.description,
      priority: patch.priority,
      start_date: patch.startDate,
      due_date: patch.dueDate,
      time_estimate_minutes: patch.timeEstimateMinutes,
      sqa_status: patch.sqaStatus,
    })
    .eq("id", taskId);
  if (error) return { error: error.message };
  return {};
}

export async function setTaskCompleted(
  taskId: string,
  completed: boolean,
): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", taskId)
    .select("id, project_id, projects(workspace_id)");
  if (error) return { error: error.message };
  // Same cache story as deleteTask: the board reconciles live via realtime, but
  // the dashboard's "My work" list is a server render with no subscription and
  // filters out completed tasks. Without invalidation it kept serving the
  // pre-toggle segment, so a task marked done on the board still showed up on
  // the dashboard until a manual reload. "My work" aggregates across every
  // workspace, so invalidate the dashboard page pattern for all of them.
  const row = data?.[0] as unknown as
    | { project_id: string; projects: { workspace_id: string } | null }
    | undefined;
  if (row?.projects?.workspace_id) {
    revalidatePath(
      `/w/${row.projects.workspace_id}/projects/${row.project_id}`,
    );
  }
  revalidatePath("/w/[workspaceId]", "page");
  return {};
}

export async function deleteTask(taskId: string): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", taskId)
    .select("id, project_id, projects(workspace_id)");
  if (error) return { error: error.message };
  // RLS silently filters rows the caller can't update - without this check a
  // denied delete would look like a success and the task would reappear on
  // refresh.
  if (!data || data.length === 0) {
    return { error: "You don't have permission to delete this task." };
  }
  // Drop the cached board + dashboard payloads so the deleted task doesn't
  // linger in Next's router cache: the board reconciles live via realtime, but
  // the dashboard's "My work" list is a server render with no subscription, so
  // it kept serving the stale (pre-delete) segment on navigation/reload until
  // its path was invalidated. "My work" aggregates across every workspace, so
  // invalidate the dashboard page pattern for all of them.
  const row = data[0] as unknown as {
    project_id: string;
    projects: { workspace_id: string } | null;
  };
  if (row.projects?.workspace_id) {
    revalidatePath(
      `/w/${row.projects.workspace_id}/projects/${row.project_id}`,
    );
  }
  revalidatePath("/w/[workspaceId]", "page");
  return {};
}

// -- Assignees ---------------------------------------------------------------

export async function toggleAssignee(
  taskId: string,
  userId: string,
): Promise<Result> {
  await requireUser();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("task_assignees")
    .select("task_id")
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("task_assignees")
      .delete()
      .eq("task_id", taskId)
      .eq("user_id", userId);
  } else {
    // The picker offers every workspace member; seat them into the board
    // first so they can actually see the task they're assigned to.
    const { data: task } = await supabase
      .from("tasks")
      .select("project_id")
      .eq("id", taskId)
      .single();
    if (task) {
      const { error: seatError } = await supabase.rpc(
        "ensure_project_member",
        { p_project_id: task.project_id, p_user_id: userId },
      );
      if (seatError) return { error: seatError.message };
    }
    const { error } = await supabase
      .from("task_assignees")
      .insert({ task_id: taskId, user_id: userId });
    if (error) return { error: error.message };
  }
  return {};
}

// -- Labels ------------------------------------------------------------------

export async function toggleTaskLabel(
  taskId: string,
  labelId: string,
): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("task_labels")
    .select("task_id")
    .eq("task_id", taskId)
    .eq("label_id", labelId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("task_labels")
      .delete()
      .eq("task_id", taskId)
      .eq("label_id", labelId);
  } else {
    const { error } = await supabase
      .from("task_labels")
      .insert({ task_id: taskId, label_id: labelId });
    if (error) return { error: error.message };
  }
  return {};
}

// -- Task-level attachments --------------------------------------------------
// Same shape as PendingCommentAttachment minus the video/image-specific extras
// task_attachments doesn't persist (thumb, dimensions, duration, kind).
export type PendingTaskAttachment = {
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

// Attach one or more already-uploaded files to a task's own attachment set
// (distinct from task_comment_attachments, which live under a comment).
export async function addTaskAttachments(
  taskId: string,
  attachments: PendingTaskAttachment[],
): Promise<Result> {
  const user = await requireUser();
  if (!attachments.length) return {};
  const supabase = await createClient();
  const { data: taskRow } = await supabase
    .from("tasks")
    .select("projects(workspace_id)")
    .eq("id", taskId)
    .single();
  const workspaceId = (taskRow as { projects: { workspace_id: string } | null } | null)
    ?.projects?.workspace_id;
  if (
    !workspaceId ||
    attachments.some(
      (attachment) =>
        isS3Path(attachment.storagePath) &&
        (!OWNED_S3_PATH_RE.test(attachment.storagePath) ||
          !attachment.storagePath.startsWith(
            `${S3_PATH_PREFIX}uploads/${workspaceId}/${user.id}/`,
          )),
    )
  ) {
    return { error: "One or more attachments are not owned by this workspace." };
  }
  const { error } = await supabase.from("task_attachments").insert(
    attachments.map((a) => ({
      task_id: taskId,
      storage_path: a.storagePath,
      file_name: a.fileName,
      mime_type: a.mimeType,
      size_bytes: a.sizeBytes,
      uploaded_by: user.id,
    })),
  );
  if (error) return { error: error.message };
  return {};
}

export async function deleteTaskAttachment(attachmentId: string): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  // RLS: uploader OR project/workspace admin can delete.
  const { error } = await supabase
    .from("task_attachments")
    .delete()
    .eq("id", attachmentId);
  if (error) return { error: error.message };
  return {};
}

// -- Comments ----------------------------------------------------------------

export async function addComment(
  taskId: string,
  body: string,
  attachments: PendingCommentAttachment[] = [],
): Promise<Result> {
  const user = await requireUser();
  const trimmed = body.trim();
  // A comment must have text OR at least one attachment - a totally empty
  // update is meaningless in the feed.
  if (!trimmed && attachments.length === 0) {
    return { error: "Add a message or attach a file." };
  }
  const supabase = await createClient();
  const { data: taskForWorkspace } = await supabase
    .from("tasks")
    .select("projects(workspace_id)")
    .eq("id", taskId)
    .single();
  const workspaceId = (taskForWorkspace as { projects: { workspace_id: string } | null } | null)
    ?.projects?.workspace_id;
  if (
    !workspaceId ||
    attachments.some(
      (attachment) =>
        isS3Path(attachment.storagePath) &&
        (!OWNED_S3_PATH_RE.test(attachment.storagePath) ||
          !attachment.storagePath.startsWith(
            `${S3_PATH_PREFIX}uploads/${workspaceId}/${user.id}/`,
          )),
    )
  ) {
    return { error: "One or more attachments are not owned by this workspace." };
  }
  const { data: inserted, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, user_id: user.id, body: trimmed })
    .select("id")
    .single();
  if (error || !inserted) return { error: error?.message ?? "insert failed" };

  if (attachments.length > 0) {
    const { error: attachErr } = await supabase
      .from("task_comment_attachments")
      .insert(
        attachments.map((a) => ({
          comment_id: inserted.id,
          storage_path: a.storagePath,
          thumb_path: a.thumbPath ?? null,
          file_name: a.fileName,
          mime_type: a.mimeType,
          size_bytes: a.sizeBytes,
          kind: a.kind,
          width: a.width ?? null,
          height: a.height ?? null,
          duration_ms: a.durationMs ?? null,
        })),
      );
    // If attachments fail we DON'T roll back the comment - the text update
    // still delivers - but surface the error so the client can retry the
    // upload rather than pretending everything worked.
    if (attachErr) return { error: attachErr.message };
  }

  // Comment isn't covered by the task trigger; log it explicitly.
  const { data: task } = await supabase
    .from("tasks")
    .select("project_id, projects(workspace_id)")
    .eq("id", taskId)
    .single();
  const row = task as
    | { project_id: string; projects: { workspace_id: string } | null }
    | null;
  if (row?.projects?.workspace_id) {
    await supabase.from("activity_logs").insert({
      workspace_id: row.projects.workspace_id,
      project_id: row.project_id,
      task_id: taskId,
      actor_id: user.id,
      verb: "task.commented",
    });
  }
  return {};
}

export async function deleteComment(commentId: string): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("task_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", commentId);
  if (error) return { error: error.message };
  return {};
}

// -- Checklists --------------------------------------------------------------

export async function addChecklist(
  taskId: string,
  title: string,
): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("checklists")
    .insert({ task_id: taskId, title: title.trim() || "Checklist" });
  if (error) return { error: error.message };
  return {};
}

export async function addChecklistItem(
  checklistId: string,
  content: string,
): Promise<Result> {
  await requireUser();
  const trimmed = content.trim();
  if (!trimmed) return { error: "Item is empty." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("checklist_items")
    .insert({ checklist_id: checklistId, content: trimmed });
  if (error) return { error: error.message };
  return {};
}

export async function toggleChecklistItem(
  itemId: string,
  isDone: boolean,
): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("checklist_items")
    .update({ is_done: isDone })
    .eq("id", itemId);
  if (error) return { error: error.message };
  return {};
}

export async function deleteChecklistItem(itemId: string): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("checklist_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) return { error: error.message };
  return {};
}

// -- Time tracking -----------------------------------------------------------

export async function logTime(
  taskId: string,
  durationMinutes: number,
  note?: string,
): Promise<Result> {
  const user = await requireUser();
  if (!durationMinutes || durationMinutes <= 0) {
    return { error: "Duration must be greater than zero." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("task_time_entries").insert({
    task_id: taskId,
    user_id: user.id,
    duration_minutes: Math.round(durationMinutes),
    note: note?.trim() || null,
  });
  if (error) return { error: error.message };
  return {};
}

// Add a status column to a project's board (any project member; RLS-gated).
export async function createColumn(
  projectId: string,
  name: string,
): Promise<Result & { id?: string }> {
  await requireUser();
  const trimmed = name.trim();
  if (trimmed.length < 2) return { error: "Status name must be at least 2 characters." };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("kanban_columns")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("kanban_columns")
    .insert({
      project_id: projectId,
      name: trimmed,
      position: (last?.position ?? 0) + 1024,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}
