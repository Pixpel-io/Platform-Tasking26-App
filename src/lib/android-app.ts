// Central config for the Android app download link. The APK itself is
// hosted on GitHub Releases (git blocks files over 100 MB, so the binary
// can't live in this repo). GitHub returns a proper Content-Disposition
// header on the download URL so the browser force-downloads it just like
// a same-origin file — the anchor's `download` attribute is redundant
// but harmless.
//
// To refresh distribution after a new mobile build:
//   1. cd ../tasking-app && eas build --profile preview --platform android
//   2. eas build:list --platform=android --limit=1 --json
//      → artifacts.applicationArchiveUrl
//   3. curl -L -o /tmp/tasking-app.apk <url>
//   4. GitHub → Pixpel-io/Platform-Tasking26-App → Releases → Draft a new
//      release. Tag `mobile-vX.Y.Z`, attach the .apk from step 3, publish.
//   5. Copy the release asset URL and paste it below.
//   6. Bump ANDROID_APK_META.version + releasedAt + whatsNew, commit, push.

export const ANDROID_APK_URL =
  'https://github.com/Pixpel-io/Platform-Tasking26-App/releases/download/mobile-v1.0.8/tasking-app.apk';

// Displayed size + release info on the download page. Keep updated when a
// new build lands so users see a fresh "Released N days ago" and a
// changelog they can trust.
//
//   version:    Semver — matches the GitHub Release tag (mobile-v<version>)
//   releasedAt: ISO-8601 UTC — used to compute relative time on the page
//   size:       Human-readable APK size shown next to the CTA
//   minAndroid: Minimum Android version the APK targets
//   whatsNew:   Short bullet-list of user-visible changes in THIS release.
//               Rendered as a collapsible "What's new" panel on /download.
export const ANDROID_APK_META = {
  version: '1.0.8',
  releasedAt: '2026-08-01T06:00:00Z',
  size: '~117 MB',
  minAndroid: 'Android 6.0+',
  whatsNew: [
    'Notifications screen refreshed — proper rounded filter pills (the previous vertically-stretched look is gone), solid accent fill on the active tab, and an accent stripe on every unread row for a WhatsApp-fast unread scan',
    'Header now shows an "N unread of M" subline and a compact "Read all" pill with a check-check icon',
    'Notification rows: bigger avatars, hairline dividers between items, right-aligned time on the context line, bold title on unread',
    'Theme flips now reach every last chip — color-tone maps for notification icons, dashboard activity, task priority, projects, and calendar were resolving at import time and would keep the pre-flip palette; converted to render-time lookups so a dark/light toggle updates the whole tree consistently',
  ],
} as const;

// "Released N minutes/hours/days/weeks/months ago" — used on /download
// so visitors can tell at a glance whether the build is fresh.
export function getReleaseAge(referenceIso: string, now: Date = new Date()): {
  label: string;
  isRecent: boolean; // true when release ≤ 14 days old — surfaces a "NEW" badge
} {
  const then = new Date(referenceIso).getTime();
  const diffMs = Math.max(0, now.getTime() - then);

  const MIN = 60_000;
  const HR = 60 * MIN;
  const DAY = 24 * HR;
  const WEEK = 7 * DAY;
  const MONTH = 30 * DAY;

  let label: string;
  if (diffMs < MIN) label = 'Just released';
  else if (diffMs < HR)
    label = `${Math.floor(diffMs / MIN)} minute${Math.floor(diffMs / MIN) === 1 ? '' : 's'} ago`;
  else if (diffMs < DAY)
    label = `${Math.floor(diffMs / HR)} hour${Math.floor(diffMs / HR) === 1 ? '' : 's'} ago`;
  else if (diffMs < WEEK)
    label = `${Math.floor(diffMs / DAY)} day${Math.floor(diffMs / DAY) === 1 ? '' : 's'} ago`;
  else if (diffMs < MONTH)
    label = `${Math.floor(diffMs / WEEK)} week${Math.floor(diffMs / WEEK) === 1 ? '' : 's'} ago`;
  else
    label = `${Math.floor(diffMs / MONTH)} month${Math.floor(diffMs / MONTH) === 1 ? '' : 's'} ago`;

  return { label, isRecent: diffMs <= 14 * DAY };
}
