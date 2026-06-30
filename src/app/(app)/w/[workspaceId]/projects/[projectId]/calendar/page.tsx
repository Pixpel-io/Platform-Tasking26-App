import { getTasks, PRIORITY_META } from "@/lib/projects";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function ProjectCalendarPage({
  params,
}: PageProps<"/w/[workspaceId]/projects/[projectId]/calendar">) {
  const { projectId } = await params;
  const tasks = await getTasks(projectId);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Bucket tasks with a due date into day-of-month.
  const byDay = new Map<number, typeof tasks>();
  for (const t of tasks) {
    if (!t.due_date) continue;
    const d = new Date(t.due_date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(t);
    }
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = first.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="overflow-y-auto p-6">
      <h2 className="mb-4 text-lg font-semibold text-foreground">{monthLabel}</h2>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="bg-surface-2/40 px-2 py-1.5 text-center text-xs font-semibold uppercase text-muted"
          >
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          const dayTasks = day ? byDay.get(day) ?? [] : [];
          const isToday = day === now.getDate();
          return (
            <div
              key={i}
              className={`min-h-24 bg-surface p-1.5 ${day ? "" : "opacity-40"}`}
            >
              {day && (
                <>
                  <span
                    className={`text-xs ${
                      isToday
                        ? "grid h-5 w-5 place-items-center rounded-full bg-primary font-semibold text-primary-foreground"
                        : "text-muted"
                    }`}
                  >
                    {day}
                  </span>
                  <div className="mt-1 space-y-1">
                    {dayTasks.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-foreground"
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_META[t.priority].dot}`}
                        />
                        <span className="truncate">{t.title}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
