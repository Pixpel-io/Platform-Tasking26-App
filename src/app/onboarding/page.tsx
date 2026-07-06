import { getProfile, requireUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/app/(auth)/actions";
import { CreateWorkspaceForm } from "./create-workspace-form";

export default async function OnboardingPage() {
  await requireUser();
  const profile = await getProfile();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <ThemeToggle />
        <form action={signOut}>
          <button
            type="submit"
            className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted transition-colors hover:border-danger/40 hover:text-danger"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Sign out
          </button>
        </form>
      </div>

      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-foreground">
            Create your workspace
          </h1>
          <p className="text-sm text-muted">
            A workspace is your company&apos;s private space. It holds your
            whole team, all conversations, and every project - completely
            separate from other workspaces.
          </p>
        </div>

        {profile?.email && (
          <p className="text-center text-xs text-muted">
            Signed in as{" "}
            <span className="font-medium text-foreground">{profile.email}</span>
            {" - "}not you? Use Sign out (top right) to switch accounts.
          </p>
        )}

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <CreateWorkspaceForm />
        </div>
        <p className="text-center text-xs text-muted/80">
          Inside your workspace you can create groups - smaller chat rooms
          where specific members discuss one topic.
        </p>
      </div>
    </div>
  );
}
