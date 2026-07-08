import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOutToInvite } from "@/app/(auth)/actions";
import { AcceptInviteButton } from "./accept-button";

export default async function InvitePage({
  params,
}: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const user = await getSessionUser();
  const supabase = await createClient();

  // Token-keyed preview RPC: RLS on `invites` hides the row from anyone who
  // isn't a member or the invited email, which made a wrong-account visitor
  // (e.g. signed in with a different Microsoft account) see "invalid link"
  // instead of the real problem.
  const { data } = await supabase.rpc("invite_preview", { p_token: token });
  const invite = data?.[0] ?? null;

  const workspaceName = invite?.workspace_name ?? "a workspace";
  const expired = invite?.expired ?? false;
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
          <>
            <p className="mt-3 text-sm text-danger">
              This invite was sent to <strong>{invite.email}</strong>, but
              you&apos;re signed in as <strong>{user!.email}</strong>.
            </p>
            <p className="mt-2 text-sm text-muted">
              Sign out, then sign back in with{" "}
              <strong className="text-foreground">{invite.email}</strong> to
              accept.
            </p>
            <form action={signOutToInvite.bind(null, token)} className="mt-6">
              <button
                type="submit"
                className="w-full cursor-pointer rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/30 transition-opacity hover:opacity-90"
              >
                Sign out &amp; switch account
              </button>
            </form>
          </>
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
