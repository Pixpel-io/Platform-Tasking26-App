export default function WorkspaceRouteLoading() {
  return (
    <div className="flex h-full min-h-0 animate-pulse flex-col bg-background" aria-label="Loading page">
      <div className="flex h-20 shrink-0 items-center gap-3 border-b border-border/60 px-5 lg:px-7">
        <span className="h-11 w-11 rounded-2xl bg-surface-2" />
        <span className="h-5 w-36 rounded-lg bg-surface-2" />
      </div>
      <div className="grid min-h-0 flex-1 gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:p-8">
        <div className="space-y-3">
          <div className="h-24 rounded-2xl border border-border/40 bg-surface/65" />
          <div className="h-16 rounded-2xl border border-border/40 bg-surface/50" />
          <div className="h-16 rounded-2xl border border-border/40 bg-surface/50" />
          <div className="h-16 rounded-2xl border border-border/40 bg-surface/50" />
        </div>
        <div className="hidden rounded-2xl border border-border/40 bg-surface/50 lg:block" />
      </div>
    </div>
  );
}
