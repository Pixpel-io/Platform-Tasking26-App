import { getBoard, getProjectMembers } from "@/lib/projects";
import { KanbanBoard } from "./kanban-board";

export default async function ProjectBoardPage({
  params,
}: PageProps<"/w/[workspaceId]/projects/[projectId]">) {
  const { projectId } = await params;
  const [board, members] = await Promise.all([
    getBoard(projectId),
    getProjectMembers(projectId),
  ]);

  return (
    <KanbanBoard projectId={projectId} initialBoard={board} members={members} />
  );
}
