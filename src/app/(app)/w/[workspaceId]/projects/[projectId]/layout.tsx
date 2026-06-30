import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject, PRIORITY_META } from "@/lib/projects";
import { ProjectViewTabs } from "./project-view-tabs";

export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<"/w/[workspaceId]/projects/[projectId]">) {
  const { workspaceId, projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();

  const priority = PRIORITY_META[project.priority];
  const base = `/w/${workspaceId}/projects/${projectId}`;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-surface px-6 pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href={`/w/${workspaceId}/projects`}
                className="text-sm text-muted hover:text-foreground"
              >
                Projects
              </Link>
              <span className="text-muted">/</span>
              <h1 className="truncate text-lg font-semibold text-foreground">
                {project.name}
              </h1>
            </div>
            {project.description && (
              <p className="mt-0.5 truncate text-sm text-muted">
                {project.description}
              </p>
            )}
          </div>
          <span
            className={`flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium ${priority.color}`}
          >
            <span className={`h-2 w-2 rounded-full ${priority.dot}`} />
            {priority.label}
          </span>
        </div>
        <ProjectViewTabs base={base} />
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
