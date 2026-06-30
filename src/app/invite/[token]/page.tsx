import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { AcceptInviteButton } from "./accept-button";

export default async function InvitePage({
  params,
}: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const user = await getSessionUser();
  const supabase = await createClient();

  const { data: invite } = await supabase
    .from("invites")
    .select("email, status, expires_at, workspace_id")
    .eq("token", token)
    .single();

  let workspaceName = "a workspace";
  if (invite) {
    const { data: ws } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", invite.workspace_id)
      .single();
    workspaceName = ws?.name ?? workspaceName;
  }

  const expired =
    invite && new Date(invite.expires_at).getTime() < Date.now();
  const usable = invite && invite.status === "pending" && !expired;

  // Not signed in → bounce to login, then return here.
  if (usable && !user) {
    redirect(`/login?redirectedFrom=${encodeURIComponent(`/invite/${token}`)}`);
  }

  const emailMismatch =
    usable && user && user.email?.toLowerCase() !== invite.email.toLowerCase();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">
          You&apos;re invited
        </h1>

        {!invite && (
          <p className="mt-3 text-sm text-muted">
            This invitation link is invalid.
          </p>
        )}

        {invite && !usable && (
          <p className="mt-3 text-sm text-muted">
            This invitation is no longer valid
            {expired ? " (it has expired)" : ""}.
          </p>
        )}

        {usable && emailMismatch && (
          <p className="mt-3 text-sm text-danger">
            This invite was sent to <strong>{invite.email}</strong>, but
            you&apos;re signed in as <strong>{user!.email}</strong>. Sign in
            with the invited email to accept.
          </p>
        )}

        {usable && !emailMismatch && (
          <>
            <p className="mt-3 text-sm text-muted">
              Join <strong className="text-foreground">{workspaceName}</strong>{" "}
              as a member.
            </p>
            <div className="mt-6">
              <AcceptInviteButton token={token} />
            </div>
          </>
        )}

        <p className="mt-6 text-sm">
          <Link href="/" className="text-primary hover:underline">
            Go to your workspaces
          </Link>
        </p>
      </div>
    </div>
  );
}
