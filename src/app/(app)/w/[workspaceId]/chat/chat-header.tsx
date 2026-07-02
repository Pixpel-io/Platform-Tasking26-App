export function ChatHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="relative flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface/80 px-3 shadow-sm backdrop-blur-md sm:px-5">
      {/* Accent hairline along the bottom edge for a subtle premium finish. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-linear-to-r from-transparent via-primary/50 to-transparent"
      />
      {icon && <span className="shrink-0">{icon}</span>}
      <div className="min-w-0">
        <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-xs text-muted">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="ml-auto flex items-center gap-2 lg:pr-24">
          {actions}
        </div>
      )}
    </header>
  );
}
