import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

// Platform-level Super Admin helpers. Authority comes from the app_admins
// email allowlist (managed from the /admin dashboard, enforced by RLS).

export async function isSuperAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_super_admin");
  return data === true;
}

// For server components/actions that must only run for super admins.
export async function requireSuperAdmin() {
  const user = await requireUser();
  if (!(await isSuperAdmin())) {
    throw new Error("Super admin access required");
  }
  return user;
}

export async function canCreateWorkspace(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("can_create_workspace");
  return data === true;
}
