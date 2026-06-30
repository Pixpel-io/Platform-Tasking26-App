// Shared avatar: shows the user's uploaded picture when available, otherwise
// falls back to the first letter of their name/email. Used everywhere a person
// is represented so a set profile photo appears consistently across the app.
export function Avatar({
  name,
  email,
  avatarUrl,
  size = "md",
  className = "",
}: {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    xs: "h-6 w-6 text-[10px]",
    sm: "h-7 w-7 text-xs",
    md: "h-9 w-9 text-sm",
    lg: "h-10 w-10 text-base",
    xl: "h-16 w-16 text-xl",
  } as const;
  const letter =
    name?.[0]?.toUpperCase() ?? email?.[0]?.toUpperCase() ?? "?";

  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 font-semibold text-foreground ${sizes[size]} ${className}`}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name ?? email ?? "Avatar"}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        letter
      )}
    </span>
  );
}
