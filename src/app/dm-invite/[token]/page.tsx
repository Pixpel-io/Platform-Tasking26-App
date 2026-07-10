import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOutToDmInvite } from "@/app/(auth)/actions";
import { AcceptDmInviteButton } from "./accept-button";

// Personal DM invitation landing page. Token-keyed preview (SECURITY DEFINER)
// so signed-out or wrong-account visitors see what this is instead of a
// misleading "invalid link".
export default async function DmInvitePage({
  params,
}: PageProps<"/dm-invite/[token]">) {
  const { token } = await params;
  const user = await getSessionUser();
  const supabase = await createClient();

  const { data } = await supabase.rpc("dm_invite_preview", { p_token: token });
  const invite = data?.[0] ?? null;

  const expired = invite?.expired ?? false;
  const usable = invite && invite.status === "pending" && !expired;

  // Not signed in → bounce to login/signup, then return here.
  if (usable && !user) {
    redirect(
      `/login?redirectedFrom=${encodeURIComponent(`/dm-invite/${token}`)}`,
    );
  }

  const emailMismatch =
    usable && user && user.email?.toLowerCase() !== invite.email.toLowerCase();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
        <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <svg
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </span>
        <h1 className="text-xl font-semibold text-foreground">
          {invite && usable
            ? `${invite.inviter_name} wants to message you`
            : "Direct message invitation"}
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
            <form action={signOutToDmInvite.bind(null, token)} className="mt-6">
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
              Accepting connects you and{" "}
              <strong className="text-foreground">{invite.inviter_name}</strong>{" "}
              so you can message each other directly. No workspaces, boards or
              groups are shared.
            </p>
            <div className="mt-6">
              <AcceptDmInviteButton token={token} />
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
