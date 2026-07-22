import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ANDROID_APK_URL, ANDROID_APK_META } from "@/lib/android-app";

// Public landing for the Android APK. Whitelisted in
// `src/lib/supabase/proxy.ts` so unauthenticated visitors can reach it.
// Uses the same visual language as the auth brand panel + 404 hero:
// aurora background, gradient headline, floating icon tile.

export const metadata: Metadata = {
  title: "Download TasKing for Android",
  description:
    "Team chat, tasks, and boards on the go. Get the TasKing Android app — free, offline-friendly, notifications wired up.",
  openGraph: {
    title: "Download TasKing for Android",
    description:
      "Team chat, tasks, and boards on the go. Get the TasKing Android app.",
    images: [
      {
        url: "/image/taskcycle-ios-appicon-1024.png",
        width: 1024,
        height: 1024,
        alt: "TasKing",
      },
    ],
  },
};

export default function DownloadPage() {
  return (
    <div className="aurora-bg relative min-h-dvh overflow-hidden bg-background text-foreground">
      {/* Top wordmark strip — keeps brand present without a full nav bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/image/taskcycle-ios-appicon-1024.png"
            width={36}
            height={36}
            alt="TasKing"
            className="rounded-lg"
            priority
          />
          <span className="text-xl font-bold tracking-tight">
            tas<span className="text-primary">K</span>ing
          </span>
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
        >
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <main className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 pt-8 pb-24 text-center sm:pt-16">
        <span className="animate-float-slow grid h-24 w-24 place-items-center rounded-3xl bg-linear-to-br from-primary/25 to-primary/5 text-primary shadow-lg shadow-primary/10 ring-1 ring-inset ring-primary/15">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-12 w-12"
          >
            <rect x="5" y="2" width="14" height="20" rx="3" />
            <path d="M10 22h4" />
            <path d="M12 6h.01" />
          </svg>
        </span>

        <h1 className="mt-8 animate-fade-in-up text-4xl font-semibold tracking-tight sm:text-5xl">
          Take TasKing <span className="gradient-text">everywhere</span>.
        </h1>
        <p className="mt-4 max-w-xl animate-fade-in-up text-base text-muted sm:text-lg">
          Team chat, tasks, and Monday-style boards — right on your phone.
          Real-time notifications, offline drafts, one tap to your workspace.
        </p>

        {/* Primary CTA */}
        <div className="mt-10 flex flex-col items-center gap-3">
          <a
            href={ANDROID_APK_URL}
            // `download` attribute makes the browser save the .apk directly
            // instead of trying to open it. Works only because the URL is
            // same-origin (`/tasking-app.apk`). If we ever move the file to
            // an external host, we lose this and must proxy through a
            // Next.js route handler that sets Content-Disposition.
            download="tasking-app.apk"
            className="hover-glow inline-flex items-center gap-3 rounded-xl bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground shadow-md shadow-primary/30 transition-all duration-150 hover:-translate-y-px hover:opacity-95 hover:shadow-lg hover:shadow-primary/40 active:scale-[0.98]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-5 w-5"
              aria-hidden
            >
              <path d="M17.523 15.34a1 1 0 1 1-1-1.732 1 1 0 0 1 1 1.732zm-11.046 0a1 1 0 1 1-1-1.732 1 1 0 0 1 1 1.732zM17.9 9.06l1.42-2.462a.3.3 0 1 0-.52-.3l-1.44 2.494A11.05 11.05 0 0 0 12 7.75c-1.87 0-3.66.42-5.36 1.042L5.2 6.298a.3.3 0 0 0-.52.3l1.42 2.462C3.32 10.71 1.5 13.3 1.5 16.25h21c0-2.95-1.82-5.54-4.6-7.19z" />
            </svg>
            Download for Android
          </a>
          <p className="text-xs text-muted">
            {ANDROID_APK_META.version} · {ANDROID_APK_META.size} ·{" "}
            {ANDROID_APK_META.minAndroid}
          </p>
        </div>

        {/* Feature strip */}
        <div className="mt-16 grid w-full grid-cols-1 gap-4 text-left sm:grid-cols-3">
          <Feature
            title="Real-time push"
            body="Task assignments, mentions and DMs land as OS notifications with your chosen tone."
            icon={
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
            }
          />
          <Feature
            title="Monday-style boards"
            body="Same tables, cells, statuses and members as the web — every touch tuned for mobile."
            icon={
              <>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M9 4v16M15 4v16" />
              </>
            }
          />
          <Feature
            title="Full chat & DMs"
            body="Typing indicators, reactions, threads, attachments — parity with the web."
            icon={
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            }
          />
        </div>

        {/* Install guide */}
        <section className="mt-20 w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 text-left shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold">How to install</h2>
          <p className="mt-1 text-sm text-muted">
            Not on the Play Store yet — it&apos;s a direct APK. Two-minute setup.
          </p>
          <ol className="mt-5 space-y-4">
            <Step
              n={1}
              title="Tap the Download button above on your Android phone"
              body="Chrome will offer to download an .apk file. Accept."
            />
            <Step
              n={2}
              title="Allow installs from Chrome"
              body="First time only. Android prompts: Settings → Special access → Install unknown apps → Chrome → toggle on. This is standard for direct-installed apps."
            />
            <Step
              n={3}
              title="Open the file, tap Install"
              body="Takes ~10 seconds. When done, the TasKing icon appears on your home screen."
            />
            <Step
              n={4}
              title="Sign in with your workspace email"
              body="Same credentials as the web. Push notifications activate on first launch."
            />
          </ol>
        </section>

        <p className="mt-10 text-xs text-muted">
          iOS coming soon. Meanwhile{" "}
          <Link
            href="/login"
            className="text-primary underline-offset-2 hover:underline"
          >
            keep using TasKing on the web
          </Link>
          .
        </p>
      </main>
    </div>
  );
}

function Feature({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm transition-colors hover:border-primary/40">
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden
        >
          {icon}
        </svg>
      </span>
      <h3 className="mt-3 font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}

function Step({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-4">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
        {n}
      </span>
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted">{body}</p>
      </div>
    </li>
  );
}
