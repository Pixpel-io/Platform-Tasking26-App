import { getBoard, PRIORITY_META } from "@/lib/projects";

export default async function ProjectListPage({
  params,
}: PageProps<"/w/[workspaceId]/projects/[projectId]/list">) {
  const { projectId } = await params;
  const board = await getBoard(projectId);

  return (
    <div className="overflow-y-auto p-6">
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2/40 text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2.5">Task</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Priority</th>
              <th className="px-4 py-2.5">Assignees</th>
              <th className="px-4 py-2.5">Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {board.flatMap((column) =>
              column.tasks.map((task) => {
                const priority = PRIORITY_META[task.priority];
                const done = task.completed_at != null;
                const assignees = task.task_assignees
                  .map((a) => a.profiles)
                  .filter((p): p is NonNullable<typeof p> => p != null);
                return (
                  <tr key={task.id} className="bg-surface hover:bg-surface-2/40">
                    <td className="px-4 py-2.5 text-foreground">
                      <span className={done ? "line-through opacity-60" : ""}>
                        {task.title}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{column.name}</td>
                    <td className="px-4 py-2.5">
                      <span className={`flex items-center gap-1.5 ${priority.color}`}>
                        <span className={`h-2 w-2 rounded-full ${priority.dot}`} />
                        {priority.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      {assignees.length === 0
                        ? "—"
                        : assignees
                            .map((a) => a.full_name ?? a.email)
                            .join(", ")}
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      {task.due_date
                        ? new Date(task.due_date).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
        {board.every((c) => c.tasks.length === 0) && (
          <p className="bg-surface px-4 py-8 text-center text-sm text-muted">
            No tasks yet.
          </p>
        )}
      </div>
    </div>
  );
}
