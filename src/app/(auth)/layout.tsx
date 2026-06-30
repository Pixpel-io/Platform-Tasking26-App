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
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Tasking
        </Link>
        <div className="space-y-4">
          <h1 className="text-3xl font-semibold leading-tight">
            Where conversations and work live together.
          </h1>
          <p className="max-w-md text-primary-foreground/80">
            Chat in groups and DMs, run projects on Kanban, lists, and
            calendars — all in real time, for your whole team.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/60">
          Slack-style messaging · ClickUp-style projects
        </p>
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 right-12 h-72 w-72 rounded-full bg-black/10 blur-2xl" />
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
