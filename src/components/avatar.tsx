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

  // Deterministic accent per person so name fallbacks read as distinct.
  const palette = [
    "bg-indigo-500/15 text-indigo-500",
    "bg-violet-500/15 text-violet-500",
    "bg-sky-500/15 text-sky-500",
    "bg-emerald-500/15 text-emerald-500",
    "bg-amber-500/15 text-amber-600",
    "bg-rose-500/15 text-rose-500",
    "bg-cyan-500/15 text-cyan-500",
    "bg-fuchsia-500/15 text-fuchsia-500",
  ];
  const seed = name ?? email ?? "?";
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const tone = palette[Math.abs(hash) % palette.length];

  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold ${
        avatarUrl ? "bg-surface-2" : tone
      } ${sizes[size]} ${className}`}
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
