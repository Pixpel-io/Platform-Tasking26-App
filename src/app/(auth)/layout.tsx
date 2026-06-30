import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        {/* Animated gradient base */}
        <div className="absolute inset-0 -z-10 bg-linear-to-br from-primary via-indigo-600 to-violet-700" />
        {/* Drifting aurora orbs */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 animate-[aurora-drift_18s_ease-in-out_infinite] rounded-full bg-white/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 animate-[aurora-drift_24s_ease-in-out_infinite_reverse] rounded-full bg-violet-400/30 blur-3xl" />
        <div className="pointer-events-none absolute bottom-24 right-16 h-56 w-56 animate-float-slow rounded-full bg-sky-300/20 blur-3xl" />
        {/* Subtle grid overlay for texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <Link
          href="/"
          className="relative text-xl font-bold tracking-tight transition-opacity hover:opacity-80"
        >
          Tasking
        </Link>
        <div className="relative space-y-4">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Where conversations and work live together.
          </h1>
          <p className="max-w-md text-white/80">
            Chat in groups and DMs, run projects on Kanban, lists, and
            calendars — all in real time, for your whole team.
          </p>
        </div>
        <p className="relative text-sm text-white/60">
          Slack-style messaging · ClickUp-style projects
        </p>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center bg-background p-6">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
