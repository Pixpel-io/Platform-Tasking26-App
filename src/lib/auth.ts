import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Workspace, WorkspaceMember } from "@/lib/supabase/types";

// Memoized for the duration of a single render pass.
export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const requireUser = cache(async () => {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
});

export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return data;
});

export type MembershipWithWorkspace = WorkspaceMember & {
  workspaces: Workspace | null;
};

// All workspaces the current user belongs to (newest first).
export const getMyWorkspaces = cache(async (): Promise<
  MembershipWithWorkspace[]
> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("workspace_members")
    .select("*, workspaces(*)")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  return (data as MembershipWithWorkspace[] | null) ?? [];
});
