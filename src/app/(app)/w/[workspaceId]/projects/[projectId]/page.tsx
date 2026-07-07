import { getBoard, getProjectMembers } from "@/lib/projects";
import { MondayTable } from "./monday-table";

export default async function ProjectTasksPage({
  params,
}: PageProps<"/w/[workspaceId]/projects/[projectId]">) {
  const { projectId } = await params;
  const [board, members] = await Promise.all([
    getBoard(projectId),
    getProjectMembers(projectId),
  ]);

  return (
    <MondayTable projectId={projectId} initialBoard={board} members={members} />
  );
}
