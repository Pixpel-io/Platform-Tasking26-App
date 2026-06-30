import { redirect } from "next/navigation";
import { getMyWorkspaces } from "@/lib/auth";

export default async function HomePage() {
  const workspaces = await getMyWorkspaces();
  // (app)/layout already redirects to /onboarding when there are none.
  redirect(`/w/${workspaces[0].workspace_id}`);
}
