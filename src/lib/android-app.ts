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
  'https://github.com/Pixpel-io/Platform-Tasking26-App/releases/download/mobile-v1.0.4/tasking-app.apk';

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
  version: '1.0.4',
  releasedAt: '2026-07-24T12:30:00Z',
  size: '~109 MB',
  minAndroid: 'Android 6.0+',
  whatsNew: [
    'App renamed to just "Tasking" (launcher, splash, all branding)',
    'Runtime-permission bootstrap on first sign-in — notifications, camera, microphone, and photo library prompts fire up front instead of hiding in App Info',
    'Unread badges clear the instant you tap into a DM or channel (no more 2-second wait)',
    'Cross-device read sync — reading a room on the web instantly clears the badge on mobile, and vice versa',
    'Attach a cover image while CREATING a task on the board (small image button in the add-task row)',
    'Cleotilda can act on its own UI — say "hide your floating icon" in any chat or the assistant panel and it toggles instantly',
    'New Notifications screen with filter tabs — All / Unread / I was mentioned / Assigned to me / Task updates, each with live count badges',
    'Dashboard cleaned up — Boards tile + list removed (dedicated Boards tab), workspace name and dropdown chevron sit tightly together',
    'Live "N teammates online right now" pill under the Home hero, with a pulsing green dot that updates as people connect/disconnect',
    'Compact chat composer — reduced empty space above the gesture-nav bar',
    'Performance pass — trimmed realtime refetch surface (Home, Chat reactions, Board join tables), single-pass Notification counts, filtered Notifications subscription, memoized channel-icon lookup',
    'Cleotilda command parser hardened — imperative-only patterns so narrative text no longer accidentally toggles the FAB',
    'Cached image loading in Chat — no more spinner flash when switching between DMs/groups',
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
