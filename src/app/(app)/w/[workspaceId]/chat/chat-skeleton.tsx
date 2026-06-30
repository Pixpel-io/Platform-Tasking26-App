// Instant placeholder shown while a channel/DM's server data loads, so
// navigation feels immediate instead of freezing on the previous screen.
export function ChatSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-4">
        <span className="h-7 w-7 shimmer rounded-full bg-surface-2" />
        <span className="h-4 w-40 shimmer rounded bg-surface-2" />
      </header>
      <div className="flex-1 space-y-6 overflow-hidden px-4 py-6">
        {[60, 45, 70, 35, 55].map((w, i) => (
          <div key={i} className="flex gap-3">
            <span className="h-9 w-9 shrink-0 shimmer rounded-full bg-surface-2" />
            <div className="flex-1 space-y-2">
              <span className="block h-3 w-24 shimmer rounded bg-surface-2" />
              <span
                className="block h-3 shimmer rounded bg-surface-2"
                style={{ width: `${w}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
