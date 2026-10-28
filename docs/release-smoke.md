# Release smoke test

Run before every Play upload, on a real phone (Android 13 or newer) with a Play license tester account. Use the exact build that goes to Play: R8 shrinking is on for release, so a debug build does not prove the release works.

## Build

1. `cd frontend && npm run android:bump` (add `-- 1.2.0` to change the version name), then `npm run android:prod`.
2. `cd android && ./gradlew bundleRelease` with the `DROPZONE_UPLOAD_*` variables set. Output: `app/build/outputs/bundle/release/app-release.aab`. The build uploads the R8 mapping file to Crashlytics (needs network); the AAB also carries it for Play.
3. Upload the AAB to the internal testing track and install it from Play on the test phone. Do the checks once on a fresh install and once as an update over the previous Play version.

## Checks

| # | Do | Expect |
|---|----|--------|
| 1 | Open the app | Splash, then the welcome screen; `adb logcat -b crash` stays empty |
| 2 | Sign in with Google, finish onboarding (consent with "I'm 18 or older") | Today screen, trial started |
| 3 | Allow notifications; Settings → open notification settings | Android settings for DropZone with Daily reminders, Community, Account & billing |
| 4 | Complete a meal quest with a camera photo | Proof saved, "AI verified" for a real meal photo |
| 5 | Weigh in from a photo of a scale | Value read from the display |
| 6 | Steps quest with Health Connect | Permission dialog, then today's steps |
| 7 | Turn on the app lock (accessibility), open Instagram | DropZone lock screen; "Open DropZone" returns to the app |
| 8 | Clear all quests (unlock mode Whole day) | Instagram opens until local midnight |
| 9 | PRO, unlock mode Minutes, clear one quest | Instagram opens; Today shows the minutes left; after that much use Instagram is covered within a minute; time outside Instagram is not counted |
| 10 | Set the clock back 2 h with automatic time off, open Instagram | Locked; restore automatic time |
| 11 | Paywall → subscribe with the license tester | PRO active; "Restore purchases" works after reinstall |
| 12 | Open the feed, hype and comment on a post | Shown at once, push arrives on the other test account |
| 13 | `adb shell am crash $(adb shell pidof com.dropzone.app)`, close the "keeps stopping" dialog, open the app again | Crash in Firebase Crashlytics within a few minutes (sent on the next start), readable (deobfuscated) stack, user id only |
| 14 | Update install only | Still signed in, locked apps unchanged |

Write the version code, device, date and any failure in the release notes. Any failed row blocks the upload.
