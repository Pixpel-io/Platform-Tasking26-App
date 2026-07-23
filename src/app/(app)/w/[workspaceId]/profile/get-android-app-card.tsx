import Link from "next/link";
import {
  ANDROID_APK_URL,
  ANDROID_APK_META,
  getReleaseAge,
} from "@/lib/android-app";

// "Get the Android app" card. Same shape as <QrLoginCard> so the two
// phone-adjacent affordances read as a pair on the Profile page. The
// primary button is a direct download of the APK (one-click install),
// with a secondary link to /download for users who want the full
// install guide + feature strip. When the current build is under
// 14 days old, a small pulsing "NEW" chip appears next to the title
// so returning users know a fresh version is out.
export function GetAndroidAppCard() {
  const age = getReleaseAge(ANDROID_APK_META.releasedAt);
  return (
    <section className="mt-6 rounded-xl border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">
              Get the Android app
            </h2>
            {age.isRecent && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success ring-1 ring-inset ring-success/30">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                </span>
                New
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            Version {ANDROID_APK_META.version} · Released {age.label}. Push
            notifications, Monday-style boards, full chat on the go.{" "}
            <Link
              href="/download"
              className="text-primary underline-offset-2 hover:underline"
            >
              What&apos;s new
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
