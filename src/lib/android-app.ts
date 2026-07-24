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
  'https://github.com/Pixpel-io/Platform-Tasking26-App/releases/download/mobile-v1.0.3/tasking-app.apk';

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
  version: '1.0.3',
  releasedAt: '2026-07-24T10:00:00Z',
  size: '~109 MB',
  minAndroid: 'Android 6.0+',
  whatsNew: [
    'Instant theme flip — dark/light toggle no longer reloads the app, all screen state preserved',
    'Time-aware greeting — 5 buckets (late night, morning, afternoon, evening, night) with rotating messages that respect your local time',
    'Animated waving hand on the Home hero, with a crescent moon at late-night hours',
    'Home DM list redesigned — larger ringed avatars, live presence subtitle (Active now · Offline · typing…), pretty-printed names for email-only contacts',
    'Chat rooms: modern polish — ringed avatars, elevated header, composer icons in soft pills, subtle send-button shadow',
    'Settings redesigned — compact horizontal appearance cards, iOS-style grouped notification sound cards with hairline dividers',
    'Task boards now show a cover-image thumbnail on rows for tasks with a picture',
    'Task detail: premium 2-up image gallery with floating delete on each tile — no more tiny 40px thumbs',
    'Full-coverage realtime on task detail — cross-device edits to title, description, attachments, assignees, labels, watchers, subtasks, checklists all reflect instantly',
    'Greeting bucket auto-transitions across midnight and other time boundaries',
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
