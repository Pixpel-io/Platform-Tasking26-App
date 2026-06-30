"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import type { PriorityLevel, ProjectStatus } from "@/lib/supabase/types";

type Result = { error?: string };

// -- Projects ----------------------------------------------------------------

export async function createProject(
  workspaceId: string,
  _prev: Result | undefined,
  formData: FormData,
): Promise<Result> {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priority = (String(formData.get("priority") ?? "none") ||
    "none") as PriorityLevel;
  const memberIds = formData
    .getAll("memberIds")
    .map((v) => String(v))
    .filter(Boolean);

  if (name.length < 2) {
    return { error: "Project name must be at least 2 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_project", {
    p_workspace_id: workspaceId,
    p_name: name,
    p_description: description || undefined,
    p_priority: priority,
    p_member_ids: memberIds,
  });

  if (error) return { error: error.message };

  revalidatePath(`/w/${workspaceId}`, "layout");
  redirect(`/w/${workspaceId}/projects/${data}`);
}

export async function updateProject(
  workspaceId: string,
  projectId: string,
  patch: {
    name?: string;
    description?: string | null;
    status?: ProjectStatus;
    priority?: PriorityLevel;
    startDate?: string | null;
    dueDate?: string | null;
  },
): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      name: patch.name,
      description: patch.description,
      status: patch.status,
      priority: patch.priority,
      start_date: patch.startDate,
      due_date: patch.dueDate,
    })
    .eq("id", projectId);
  if (error) return { error: error.message };
  revalidatePath(`/w/${workspaceId}/projects/${projectId}`);
  return {};
}

export async function addProjectMembers(
  workspaceId: string,
  projectId: string,
  memberIds: string[],
): Promise<Result> {
  await requireUser();
  if (memberIds.length === 0) return {};
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_project_members", {
    p_project_id: projectId,
    p_member_ids: memberIds,
  });
  if (error) return { error: error.message };
  revalidatePath(`/w/${workspaceId}/projects/${projectId}`);
  return {};
}

// -- Labels ------------------------------------------------------------------

export async function createLabel(
  workspaceId: string,
  name: string,
  color: string,
): Promise<Result & { id?: string }> {
  await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Label name is required." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("labels")
    .insert({ workspace_id: workspaceId, name: trimmed, color })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath(`/w/${workspaceId}`, "layout");
  return { id: data.id };
}
