// Skeleton for the Calendar view - mirrors the month grid: title, weekday
// header strip, then 5 weeks of day cells with occasional task chips.
const WEEKS = 5;

// Deterministic scatter of task chips so the grid feels alive without
// Math.random() (which would break SSR hydration).
const CHIPPY = new Set([2, 5, 9, 12, 16, 19, 23, 26, 30, 33]);

export default function Loading() {
  return (
    <div className="overflow-y-auto p-6">
      <span className="mb-4 block h-6 w-40 shimmer rounded bg-surface-2" />
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
        {/* Weekday header */}
        {Array.from({ length: 7 }, (_, i) => (
          <div key={`w-${i}`} className="bg-surface-2/40 px-2 py-1.5">
            <span className="mx-auto block h-3.5 w-8 shimmer rounded bg-surface-2" />
          </div>
        ))}
        {/* Day cells */}
        {Array.from({ length: WEEKS * 7 }, (_, i) => (
          <div key={`d-${i}`} className="min-h-24 bg-surface p-1.5">
            <span className="block h-3.5 w-5 shimmer rounded bg-surface-2" />
            {CHIPPY.has(i) && (
              <span className="mt-1.5 block h-5 shimmer rounded bg-surface-2" />
            )}
            {CHIPPY.has(i - 12) && (
              <span className="mt-1 block h-5 w-3/4 shimmer rounded bg-surface-2" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
