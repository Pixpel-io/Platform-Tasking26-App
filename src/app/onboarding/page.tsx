import { requireUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { CreateWorkspaceForm } from "./create-workspace-form";

export default async function OnboardingPage() {
  await requireUser();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-foreground">
            Create your workspace
          </h1>
          <p className="text-sm text-muted">
            A workspace is where your team chats and runs projects.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <CreateWorkspaceForm />
        </div>
      </div>
    </div>
  );
}
