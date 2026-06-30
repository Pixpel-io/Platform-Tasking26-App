// Board-shaped placeholder for the project detail view while its data loads.
export default function Loading() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-surface px-6 pt-4">
        <div className="flex items-center gap-2">
          <span className="h-5 w-16 shimmer rounded bg-surface-2" />
          <span className="text-muted">/</span>
          <span className="h-5 w-40 shimmer rounded bg-surface-2" />
        </div>
        <div className="mt-4 flex gap-4 pb-3">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-4 w-16 shimmer rounded bg-surface-2" />
          ))}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-6">
        {[0, 1, 2, 3].map((col) => (
          <div key={col} className="w-72 shrink-0 space-y-3">
            <span className="block h-4 w-24 shimmer rounded bg-surface-2" />
            {[0, 1, 2].map((card) => (
              <div
                key={card}
                className="h-24 shimmer rounded-xl border border-border bg-surface-2"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
