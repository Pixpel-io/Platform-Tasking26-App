export function ChatHeader({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-4">
      {icon}
      <div className="min-w-0">
        <h1 className="truncate text-sm font-semibold text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-xs text-muted">{subtitle}</p>
        )}
      </div>
    </header>
  );
}
