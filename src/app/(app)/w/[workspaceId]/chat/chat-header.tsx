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
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface/80 px-5 shadow-sm backdrop-blur-md">
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
        <div className="ml-auto flex items-center gap-2 pr-24">
          {actions}
        </div>
      )}
    </header>
  );
}
