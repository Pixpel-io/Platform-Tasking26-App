"use client";

import { useState } from "react";
import Link from "next/link";
import type { CrossWorkspaceTask } from "@/lib/projects";

// Short due-date chip ("Overdue", "Today", "Mar 5") for the cross-workspace
// task list. dateOnly is a YYYY-MM-DD string (no time component).
function dueLabel(dateOnly: string | null): { text: string; chip: string } {
  if (!dateOnly)
    return { text: "No due date", chip: "bg-surface-2 text-muted" };
  const today = new Date().toISOString().slice(0, 10);
  if (dateOnly < today)
    return { text: "Overdue", chip: "bg-danger/10 text-danger" };
  if (dateOnly === today)
    return { text: "Today", chip: "bg-amber-500/10 text-amber-500" };
  const d = new Date(`${dateOnly}T00:00:00`);
  return {
    text: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    chip: "bg-surface-2 text-muted",
  };
}

export type WorkspaceGroup = {
  id: string;
  name: string;
  accent: string | undefined;
  unread: number;
  open: number;
  overdue: number;
  tasks: CrossWorkspaceTask[];
};

// One collapsible workspace card on the dashboard's cross-workspace overview.
// The header toggles the task list open/closed, like a minimizable group.
export function WorkspaceGroupCard({
  group: g,
  isCurrent,
}: {
  group: WorkspaceGroup;
  isCurrent: boolean;
}) {
  const [open, setOpen] = useState(true);
  const hasTasks = g.tasks.length > 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div
        className="flex items-center gap-3 border-b border-border/70 px-4 py-3"
        style={{
          backgroundImage: `linear-gradient(to right, ${g.accent}14, transparent)`,
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={!hasTasks}
          aria-expanded={hasTasks ? open : undefined}
          aria-label={open ? "Collapse workspace" : "Expand workspace"}
          className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-default disabled:opacity-0"
        >
          <svg
            className={`h-4 w-4 transition-transform duration-200 ${
              open ? "rotate-90" : ""
            }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
        <Link
          href={`/w/${g.id}`}
          prefetch={true}
          aria-label={`Open ${g.name}`}
          title={`Open ${g.name}`}
          className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-sm font-semibold text-white shadow-sm transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-md"
          style={{ backgroundColor: g.accent }}
        >
          {g.name.charAt(0).toUpperCase()}
        </Link>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">
              {g.name}
            </span>
            {isCurrent && (
              <span className="hidden shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary sm:inline-block">
                current workspace
              </span>
            )}
          </span>
          <span className="block text-xs text-muted">
            {g.open === 0
              ? "No open tasks for you"
              : `${g.open} open task${g.open === 1 ? "" : "s"}`}
            {g.overdue > 0 && (
              <span className="font-medium text-danger"> · {g.overdue} overdue</span>
            )}
          </span>
        </span>
        {g.unread > 0 && (
          <Link
            href={`/w/${g.id}/notifications`}
            aria-label={`${g.unread} unread`}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-danger/10 px-2 py-1 text-xs font-semibold text-danger transition-colors hover:bg-danger/20 sm:px-2.5"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span>{g.unread > 99 ? "99+" : g.unread}</span>
            <span className="hidden sm:inline">unread</span>
          </Link>
        )}
      </div>

      {open && hasTasks && (
        <ul className="divide-y divide-border/50">
          {g.tasks.slice(0, 4).map((t) => {
            const due = dueLabel(t.due_date);
            return (
              <li key={t.id}>
                <Link
                  href={`/w/${t.workspace_id}/projects/${t.project_id}`}
                  className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-primary/5"
                >
                  <svg
                    className="h-4 w-4 shrink-0 text-muted"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground group-hover:text-primary">
                      {t.title}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {t.project_name}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${due.chip}`}
                  >
                    {due.text}
                  </span>
                  <svg
                    className="h-4 w-4 shrink-0 text-muted opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100 group-hover:text-primary"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </Link>
              </li>
            );
          })}
          {g.tasks.length > 4 && (
            <li>
              <Link
                href={`/w/${g.id}/projects`}
                className="block px-4 py-2 text-xs font-medium text-muted transition-colors hover:bg-primary/5 hover:text-primary"
              >
                View all {g.tasks.length} tasks →
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
