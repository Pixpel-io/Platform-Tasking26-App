// Skeleton for the Tasks view - mirrors MondayTable: filter toolbar row,
// table header, then pill-celled rows. (The breadcrumb + tabs come from the
// segment layout, which stays mounted, so only the content area shimmers.)
export default function Loading() {
  const grid =
    "grid grid-cols-[minmax(200px,1fr)_130px_110px_110px_110px_120px] items-center max-lg:grid-cols-[minmax(160px,1fr)_110px_100px]";

  return (
    <div className="overflow-y-auto p-4 sm:p-6">
      {/* Toolbar: search box + filter chips left, progress right */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="h-8 w-44 shimmer rounded-lg bg-surface-2 sm:w-56" />
        {[16, 14, 16, 20].map((w, i) => (
          <span
            key={i}
            className={`h-8 shimmer rounded-lg bg-surface-2 ${i > 1 ? "max-sm:hidden" : ""}`}
            style={{ width: `${w * 4}px` }}
          />
        ))}
        <span className="ml-auto flex items-center gap-2 max-sm:hidden">
          <span className="h-1.5 w-24 shimmer rounded-full bg-surface-2" />
          <span className="h-4 w-14 shimmer rounded bg-surface-2" />
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        {/* Header row */}
        <div className={`${grid} border-b border-border bg-surface-2/40`}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className={`px-3 py-2 ${i > 0 ? "border-l border-border/60" : ""} ${
                i > 2 ? "max-lg:hidden" : ""
              }`}
            >
              <span className="block h-3.5 w-12 shimmer rounded bg-surface-2" />
            </span>
          ))}
        </div>

        {/* Task rows: title cell + colored pill cells */}
        {[0, 1, 2, 3, 4, 5, 6].map((row) => (
          <div
            key={row}
            className={`${grid} border-b border-border/60 bg-surface last:border-b-0`}
          >
            <span className="flex items-center gap-2.5 px-3 py-2">
              <span className="h-4.5 w-4.5 shrink-0 shimmer rounded-full bg-surface-2" />
              <span
                className="h-4 shimmer rounded bg-surface-2"
                style={{ width: `${[70, 45, 60, 35, 55, 40, 65][row]}%` }}
              />
            </span>
            {[1, 2].map((i) => (
              <span key={i} className="border-l border-border/60 px-1 py-1">
                <span className="block h-7 shimmer rounded-sm bg-surface-2" />
              </span>
            ))}
            {[3, 4].map((i) => (
              <span
                key={i}
                className="border-l border-border/60 px-1 py-1 max-lg:hidden"
              >
                <span className="block h-7 shimmer rounded-sm bg-surface-2" />
              </span>
            ))}
            <span className="flex items-center border-l border-border/60 px-3 py-1 max-lg:hidden">
              <span className="flex -space-x-1.5">
                {[0, 1].map((i) => (
                  <span
                    key={i}
                    className="h-6 w-6 shimmer rounded-full border-2 border-surface bg-surface-2"
                  />
                ))}
              </span>
            </span>
          </div>
        ))}

        {/* Add-task row */}
        <div className="flex items-center gap-2 border-t border-border bg-surface px-3 py-2">
          <span className="h-4 w-4 shimmer rounded bg-surface-2" />
          <span className="h-4 w-24 shimmer rounded bg-surface-2" />
        </div>
      </div>
    </div>
  );
}
