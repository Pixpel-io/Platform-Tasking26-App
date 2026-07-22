import Link from "next/link";
import { ANDROID_APK_URL } from "@/lib/android-app";

// "Get the Android app" card. Same shape as <QrLoginCard> so the two
// phone-adjacent affordances read as a pair on the Profile page. The
// primary button is a direct download of the APK (one-click install),
// with a secondary link to /download for users who want the full
// install guide + feature strip.
export function GetAndroidAppCard() {
  return (
    <section className="mt-6 rounded-xl border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">
            Get the Android app
          </h2>
          <p className="mt-1 text-sm text-muted">
            Real-time push notifications, Monday-style boards, and full chat
            on the go. Free direct APK — no Play Store account needed.{" "}
            <Link
              href="/download"
              className="text-primary underline-offset-2 hover:underline"
            >
              Install guide
            </Link>
            .
          </p>
        </div>
        <a
          href={ANDROID_APK_URL}
          download="tasking-app.apk"
          className="flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
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
            <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
          </svg>
          Download
        </a>
      </div>
    </section>
  );
}
