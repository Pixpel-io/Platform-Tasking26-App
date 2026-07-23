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
//   6. Bump ANDROID_APK_META.version + size, commit, push.

export const ANDROID_APK_URL =
  'https://github.com/Pixpel-io/Platform-Tasking26-App/releases/download/mobile-v1.0.1/tasking-app.apk';

// Displayed size + release info on the download page. Optional — keep
// updated for polish, but the page still works if these are missing.
export const ANDROID_APK_META = {
  version: '1.0.1',
  size: '~108 MB',
  minAndroid: 'Android 6.0+',
};
