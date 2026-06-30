// Instant placeholder for the dashboard so navigation feels immediate instead
// of freezing on the previous screen while server queries run.
export default function Loading() {
  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-5xl p-6 sm:p-8">
        <div className="mb-8 space-y-2">
          <span className="block h-8 w-64 shimmer rounded bg-surface-2" />
          <span className="block h-4 w-80 shimmer rounded bg-surface-2" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 shimmer rounded-xl border border-border bg-surface-2"
            />
          ))}
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="h-64 shimmer rounded-xl border border-border bg-surface-2 lg:col-span-2" />
          <div className="h-64 shimmer rounded-xl border border-border bg-surface-2" />
        </div>
      </div>
    </div>
  );
}
