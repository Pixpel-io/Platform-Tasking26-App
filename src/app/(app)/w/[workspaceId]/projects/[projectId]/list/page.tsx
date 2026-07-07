import { redirect } from "next/navigation";

// The table view moved to the project root; keep old /list links working.
export default async function ProjectListPage({
  params,
}: PageProps<"/w/[workspaceId]/projects/[projectId]/list">) {
  const { workspaceId, projectId } = await params;
  redirect(`/w/${workspaceId}/projects/${projectId}`);
}
