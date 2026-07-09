import { getBoard } from "@/lib/projects";
import { getWorkspaceMembersForChat } from "@/lib/chat";
import { MondayTable } from "./monday-table";

export default async function ProjectTasksPage({
  params,
}: PageProps<"/w/[workspaceId]/projects/[projectId]">) {
  const { workspaceId, projectId } = await params;
  // People picker offers every workspace member (not just current board
  // members) - assigning someone auto-seats them into the board.
  const [board, members] = await Promise.all([
    getBoard(projectId),
    getWorkspaceMembersForChat(workspaceId),
  ]);

  return (
    <MondayTable projectId={projectId} initialBoard={board} members={members} />
  );
}
