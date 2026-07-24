import { ThemeToggle } from "@/components/theme-toggle";
import { QrSignInButton } from "./sign-in-button";

// Interstitial for QR sign-in. The scanned URL lands here WITHOUT touching
// the one-time token: camera apps and browsers prefetch scanned links for
// previews, and a direct callback URL would be consumed before the user ever
// tapped it. The token is only spent when the button below is pressed.
export default async function QrLandingPage({
  searchParams,
}: PageProps<"/qr">) {
  const params = await searchParams;
  const token = typeof params.t === "string" ? params.t : null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
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
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h3v3h-3zM21 14v.01M14 21v.01M17 17h.01M21 17v4h-4" />
          </svg>
        </span>
        <h1 className="text-xl font-semibold text-foreground">
          Sign in on this device
        </h1>

        {token ? (
          <>
            <p className="mt-3 text-sm text-muted">
              Tap the button to open Tasking signed in to your account. This
              link works once.
            </p>
            <div className="mt-6">
              <QrSignInButton token={token} />
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">
            This link is incomplete. Generate a new QR code from your profile
            and scan again.
          </p>
        )}
      </div>
    </div>
  );
}
