// Generic instant placeholder for content pages (members, projects, search,
// settings, notifications). Mirrors their `mx-auto max-w-* p-8` shell so the
// switch is seamless when the real server-rendered page arrives.
export function PageSkeleton({
  maxWidth = "max-w-4xl",
  rows = 5,
}: {
  maxWidth?: string;
  rows?: number;
}) {
  return (
    <div className={`mx-auto ${maxWidth} p-8`}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2.5">
          <span className="block h-7 w-48 shimmer rounded-lg bg-surface-2" />
          <span className="block h-4 w-72 shimmer rounded bg-surface-2" />
        </div>
        <span className="hidden h-9 w-32 shrink-0 shimmer rounded-lg bg-surface-2 sm:block" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            style={{ animationDelay: `${i * 70}ms` }}
            className="flex animate-fade-in items-center gap-3 rounded-xl border border-border bg-surface p-4"
          >
            <span className="h-10 w-10 shrink-0 shimmer rounded-full bg-surface-2" />
            <div className="flex-1 space-y-2">
              <span className="block h-3.5 w-40 shimmer rounded bg-surface-2" />
              <span className="block h-3 w-64 shimmer rounded bg-surface-2" />
            </div>
            <span className="hidden h-6 w-16 shrink-0 shimmer rounded-full bg-surface-2 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
