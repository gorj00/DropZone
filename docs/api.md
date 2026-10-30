# DropZone API contract (v1)

Base URL: `/api/v1`. JSON, camelCase. Dates `YYYY-MM-DD`, timestamps ISO-8601 UTC.
Auth: `Authorization: Bearer <jwt>` (app JWT issued by the backend). All endpoints require auth except `/auth/*`, `/webhooks/*`, `/config`, `/actuator/health` and the scheduler endpoints `/internal/jobs/*` (outside `/api/v1`, Google OIDC instead of the app JWT, see Jobs).
Tokens: HS256 with `iss=dropzone`, `aud=dropzone-app`, `sub` = user id, `ver` = the user's token version, valid 7 days (no e-mail inside). A token gets 401 when its signature, issuer, audience or expiry is wrong, when the account was deleted, or after `POST /me/sign-out-everywhere`. Sliding renewal: when the token is older than 1 day, `GET /me` returns a fresh token in the response header `X-Auth-Token` (exposed to CORS); the app replaces its stored token with it.
Errors: `{ "status": 403, "code": "PRO_REQUIRED" | "NOT_FOUND" | "VALIDATION" | "FORBIDDEN" | "CONFLICT" | "SUSPENDED" | "RATE_LIMITED", "message": "..." }`.
`PRO_REQUIRED` (HTTP 402) whenever a free user calls a PRO-only feature.
`SUSPENDED` (HTTP 403) on every call of a suspended account except `GET /me` (returns `suspended: true`), `GET /me/export` and `DELETE /me`; the app shows a suspended screen (sign out, delete account).
Rate limits: over budget → 429 `{ "status": 429, "code": "RATE_LIMITED", "message": "Slow down a little — try again in a few minutes." }` with a `Retry-After` header (seconds); show the message. Budgets (token buckets in the app server, per instance; per signed-in user unless noted): `POST /auth/*` 10 per minute per client IP, `POST /uploads` 30 per hour, `POST /feed/{id}/comments` 30 per 10 minutes, `POST /social/requests` and `POST /social/invite/{code}/accept` together 20 per day, user search (`GET` and `POST /social/search` together) 60 per hour, photo search (`GET` and `POST /photos/search` together) 20 per hour, `POST /reports` 20 per day, `POST /feed/{id}/hype` 120 per 10 minutes. Behind Cloud Run the client IP is taken from `X-Forwarded-For`.
Search terms: user search, the handle check and photo search also accept the term in a POST body (`POST /social/search { q }`, `POST /users/handle-available { handle }`, `POST /photos/search { q }`), so the typed text never appears in request URLs or request logs. The GET forms keep working for older app builds; new builds use POST.
Paging: `GET /feed` and `GET /notifications` take `cursor` (opaque) and return the next one in the response header `X-Next-Cursor` (exposed to CORS); no header = the real end. A page is shorter than `limit` only at the end. `before=<iso>` still works (older app) but can skip items with equal timestamps.
Request limits: JSON bodies max 64 KB (413 `VALIDATION`), wrong `Content-Type` 415, non-multipart call to `/uploads` 400.
Photo URLs (`avatarUrl`, quest/weigh-in/milestone `photoUrl`, transformation `beforeUrl`/`afterUrl`, `rewardImageUrl`) must be a `POST /uploads` URL of the caller: `<public base>/uploads/<myUserId>/<uuid>.jpg|png`, either plain or as the signed link the API returned (the query is dropped and the rest checked; 400 otherwise). `rewardImageUrl` may also be `https://images.unsplash.com/...`. A quest or milestone proof photo can't reuse a photo already attached to another proof (400 "This photo was already used for another proof"; a withdrawn proof's photo may be used again). Own uploads that are no longer referenced after a replace or delete are removed from storage at once (no recovery).
Private photos: the upload bucket is private. Every photo of our bucket in any response (avatars, proofs, posts, before/after, rewards, logs, notifications' actors, admin views, `GET /me/export`, the `POST /uploads` result) is a V4 signed GET link: `https://storage.googleapis.com/<bucket>/uploads/...?X-Goog-Algorithm=...&X-Goog-Signature=...`, valid for at least 12 hours (signed at the start of the hour, expires 13 hours later), and the same link is returned for the same photo for the whole hour, so the app can cache images by URL. Re-fetch the data (not the link) to get a fresh link; never store links longer than the data they came with. Send links back unchanged. Unsplash and Google profile photos are not touched. Local fake-gcs (`GCS_ENDPOINT` set) returns plain links.

Naming: the API keeps its original names. In the app, a goal **checkpoint** is shown as a **Milestone reward** ("Milestone 2"), the **squad** area is **Community**, and **squadCheck** is shown as **Friends check**. Server texts (feed titles, summaries, errors) use the app wording, e.g. "Cleared milestone 2", "Friends check · 1/3".

## Enums
- Path: `LOSE` | `GAIN`
- Metric: `WEIGHT` | `STRENGTH` | `SIZE` (LOSE always `WEIGHT`)
- Theme: `NEON` | `STEALTH`
- UnlockMode: `WHOLE_DAY` | `MINUTES` (MINUTES = PRO)
- Verification: `AI` | `COMMUNITY` (COMMUNITY = PRO). `AI` = on-device ML Kit result sent by the app.
- CheckpointStatus: `LOCKED` | `ACTIVE` | `PENDING_VERIFICATION` | `CLEARED`
- QuestGroup: `BURN_FUEL` | `BEAT_BINGE` | `BUILD_FUEL` | `RECOVERY`
- ProofType: `PHOTO` | `AUTO` | `REPS` | `CHECKIN` | `LOG` | `NONE` (NONE = no proof, the user just marks it complete; behaves like CHECKIN)
- AutoSource: `STEPS` | `SLEEP`
- Exercise: `SQUAT` | `PUSHUP` (REPS quest completions)
- QuestStatus: `TODO` | `PENDING` | `DONE`
- FeedScope: `FRIENDS` | `EVERYONE` | `TO_VERIFY`
- ProofStatus: `PENDING` | `VERIFIED` | `REJECTED` (removed by a moderator or its post deleted while pending; never verifiable, counted or listed) | `WITHDRAWN` (the owner withdrew it while pending; same as REJECTED for everyone else)
- CheckAudience: `FRIENDS` | `EVERYONE` — who sees and verifies a Friends-check quest proof
- ModerationState: `UNDER_REVIEW` (hidden after reports or the image check until a moderator decides) | `REMOVED` (removed by a moderator); only the owner sees it
- FeedType: `QUEST_PROOF` | `CHECKPOINT_PROOF` | `CHECKPOINT_CLEARED` | `TRANSFORMATION`
- TransformationLayout: `SPLIT` | `SLIDESHOW`; PostVisibility: `PRIVATE` | `FRIENDS` | `EVERYONE` (before/after sets and milestones)
- NotificationType: `COMMENT` | `COMMENT_LIKE` | `HYPE` | `VERIFY` | `PROOF_VERIFIED` | `FRIEND_REQUEST` | `FRIEND_ACCEPTED` | `PROOF_REJECTED` (a moderator removed my pending proof; `proofId` set) | `ADMIN_REPORT` (admins only: first report of an item or an auto-hide) | `TRIAL_ENDING` | `TRIAL_ENDED` (open `/paywall`) | `BILLING_ISSUE` (open the Play subscription page, see Subscription lifecycle) | `PRO_ENDED` (open `/paywall`) | `PRO_BACK`. The billing and trial types have no actor, post or proof.
- Platform: `ANDROID` | `IOS` | `WEB`
- ReportTarget: `POST` | `COMMENT` | `USER`
- HiddenReason: `FRIENDS_ONLY` | `UNDER_REVIEW` | `REMOVED`
- Period: `WEEK` | `MONTH` | `HALF_YEAR`
- WeightUnit: `KG` | `LB`; LengthUnit: `CM` | `IN` — display preferences only. Every value in the API stays metric (kg, cm); the app converts for display and input.

## Models
```ts
User { id, email, displayName, handle, avatarUrl|null, theme, path|null, pro: boolean, proExpiresAt|null,
  unlockMode, minutesPerQuest: number (default 30), publicByDefault: boolean, defaultVerification,
  slipUpTracking: boolean (display preference only, see Stats & slip-ups), lockedApps: string[] (android package names), onboarded: boolean,
  streak: number, bestStreak: number, inviteCode: string, timezone: string (IANA, default UTC),
  trial: boolean (PRO only because of the trial), trialEndsAt: ISO|null (null until onboarding is finished: "no trial yet"; onboarding still
  accepts the PRO choices then and starts the 7-day trial), weightUnit: WeightUnit (default KG),
  lengthUnit: LengthUnit (default CM), admin: boolean (Google-linked account whose email is listed in ADMIN_EMAILS), bio: string|null (max 150),
  trialEndPending: boolean (trial over, never subscribed, "Continue with Free" not chosen yet: show the trial-ended screen),
  consentRequired: boolean (stored terms/privacy versions differ from the current ones, or the 18+ confirmation isn't stored yet; show the accept screen),
  suspended: boolean (suspended by a moderator or automatically after 4 moderator removals: every other call returns 403 SUSPENDED),
  willRenew: boolean (active subscription that renews: "Renews <proExpiresAt>"; false while subscribed = cancelled: "Ends <proExpiresAt> · Resubscribe"),
  proProductId: string|null (store product of the last subscription, e.g. "dropzone_pro:monthly"; the part before ":" is the Play subscription id),
  billingIssue: boolean (Google Play couldn't charge; PRO stays until the grace end in proExpiresAt: show "Fix your payment in Google Play"),
  billingHold: boolean (account hold: the grace period ran out and Google Play still couldn't charge; PRO is off but the subscription isn't cancelled, so fixing the payment in Google Play brings PRO back without a new purchase; at most 60 days after proExpiresAt),
  proEndPending: boolean (a subscription ended and the user hasn't seen the "Your PRO subscription ended" screen yet; outside the trial only),
  skipRestDays: boolean (default false; Settings only: days with nothing scheduled don't break the streak),
  hiddenFromSearch: boolean (default false: "Hide me from search"; nobody finds me in user search, invite links still work),
  hiddenFromLeaderboards: boolean (default false: "Hide me from leaderboards"; I'm left out of friends' boards and see my own place only in `me`),
  verifyRequestPushes: boolean (default true: VERIFY_REQUEST pushes when friends need a verify; the TO_VERIFY list and chip are unaffected),
  shareStats: boolean (default false: my data may be used for anonymised statistics; EU users opt in on the consent screen or in Settings, other users get true with the consent) }
  // email is stored lower-cased and follows the verified Google e-mail on every sign-in
AppConfig { minVersionCode: number, termsVersion: string, privacyVersion: string, termsUrl|null, privacyUrl|null, deleteAccountUrl|null }
UserSummary { id, displayName, handle, avatarUrl|null, path|null, bio|null }
HandleCheck { handle (normalized: trimmed, lowercase, leading @ removed), valid: boolean, available: boolean, message|null }
Goal { id, path, metric, metricLabel|null, unit: 'kg'|'cm', startValue, goalValue, currentValue,
  progressValue (abs delta achieved), totalValue (abs delta total), checkpoints: Checkpoint[],
  reached: boolean (the final milestone is CLEARED: show the "Goal reached" screen and offer POST /goal) }
PastGoal { id, path, metric, metricLabel|null, unit, startValue, goalValue, endValue (currentValue when it ended),
  startedAt, endedAt|null (null for goals ended before this field existed), reachedAt|null (final milestone cleared), reached: boolean,
  milestones: number, milestonesCleared: number }
Checkpoint { id, index (1..n), targetValue, deltaToEarn (abs delta from start), rewardTitle|null, rewardImageUrl|null,
  rewardImageCredit: { name, link } | null (Unsplash photographer, only with an Unsplash rewardImageUrl),
  visibility: PostVisibility (PRIVATE = only me, AI check only; FRIENDS / EVERYONE = who sees the posts and who may verify),
  isPublic (kept for older builds: visibility == EVERYONE), verification, deadline|null, status, clearedAt|null, proofId|null,
  verifiedCount, requiredVerifications (3 for COMMUNITY, 0 for AI),
  overdue: boolean (deadline is before the owner's today and the milestone isn't CLEARED: show the "Overdue" tag),
  aiChecked: boolean (the attached proof passed the AI check: say "AI verified" only then, else "Photo proof"),
  moderation: ModerationState|null (its post is under review or was removed: show the "Reported" flag and turn the share switch off) }
  // verification is the effective one: COMMUNITY only while the owner is PRO and the milestone isn't PRIVATE (a stored COMMUNITY reads AI
  // after PRO ends and comes back with PRO); once a proof is attached it says how that proof is verified
QuestType { code, path, name, icon, group, proof, free: boolean, autoSource|null, target|null, multiSlot: boolean, defaultDays: number[], defaultPerDay: number }  // code is unique per path; multiSlot = may repeat during the day (HEALTHY_MEAL, PROTEIN_MEAL, EXTRA_MEAL)
  // defaultDays / defaultPerDay: what a new user quest of this type gets when no settings are sent (onboarding, PUT /quests, free fallback): WEIGH_IN [1] (Monday only), multiSlot quests 3 a day, others every day and once. target is the default goal (CAMERA_REPS 20 squats)
UserQuest { id, code|null, name, icon, group, proof, autoSource|null, target|null, custom: boolean,
  days: number[] (1=Mon..7=Sun), squadCheck: boolean, perDay: number (1..20, >1 only when multiSlot), multiSlot: boolean,
  checkAudience: CheckAudience (default FRIENDS; who sees and verifies its Friends-check proofs) }
QuestSettings { code, days?: number[], perDay?: number, target?: number }
TodayQuest { quest: UserQuest, status, progress|null, target|null, completionId|null, proofId|null,
  verifiedCount, requiredVerifications, summary|null (text without numbers+units: "AI verified" only when the photo passed the AI check, else
  "Photo proof"; "Friends verified", "AI-checked after no verification", "Photo proof after no verification", …), value: number|null (kg,
  for weigh-in and log quests; the app formats it in the user's unit), slot: number (1-based), slots: number }
  // a quest with perDay N appears N times (slot 1..N); every slot is its own quest for doneCount/totalCount and the unlock
Today { date, quests: TodayQuest[], doneCount (DONE slots only), totalCount, unlocked: boolean, unlockedUntil|null,
  minutesEarned: number, streak, friendsCleared: { count, total, avatars: string[] } | null (null for free) }
  // a PENDING Friends-check slot counts for unlocked / unlockedUntil / minutesEarned, but not for doneCount or the streak until it is verified
  // unlocked is true only while the unlock still runs (unlockedUntil, or the end of that day for MINUTES, is after the server time):
  // a past day always reads unlocked: false, its counts and unlockedUntil stay as they were
  // after PRO ends, a day cleared while PRO reads unlocked: true until local midnight even when the free quests shown aren't done
Proof { id, kind: 'QUEST'|'CHECKPOINT', photoUrl, value|null, mlLabels: string[], mlText|null,
  status: ProofStatus, verifiedCount, requiredVerifications, createdAt }
FeedItem { id, type, user: UserSummary, createdAt, photoUrl|null, title, subtitle|null, deltaValue|null,
  value: number|null (raw weight in `unit` for weigh-in/log quest proofs; viewer formats it), unit|null,
  proofId|null, verification: { required, count, verifiedByMe: boolean, canVerify: boolean } | null,
  hypeCount, hypedByMe, commentCount, transformation: TransformationView|null (TRANSFORMATION posts),
  hidden: boolean (auto-hidden after reports; only the author still sees it),
  aiChecked: boolean (the server's AI check of the proof passed, see AI check; show the AI CHECKED chip only then), isPublic: boolean,
  moderation: ModerationState|null (only on my own posts: "Reported" flag, share switch off) }
  // hypeCount and commentCount leave out people the viewer blocked or who blocked the viewer
TransformationView { layout, beforeUrl, afterUrl, beforeCaption|null, afterCaption|null }
Transformation { id, beforeUrl, afterUrl, beforeCaption|null, afterCaption|null, layout, visibility, createdAt, updatedAt,
  feedItemId|null (set once published), commentCount, hypeCount, removedByModerator: boolean (can't be shared again),
  moderation: ModerationState|null (UNDER_REVIEW while its post is hidden, REMOVED once removed by a moderator) }
Comment { id, feedItemId, user: UserSummary, body, createdAt, mine: boolean, likeCount: number, likedByMe: boolean,
  canDelete: boolean (comment author or post owner) }
DailyLog { id (completionId), day: 'YYYY-MM-DD', quest: UserQuest, status: QuestStatus, slot, slots, value|null (metric: kg for weigh-ins and lift logs, steps, sleep minutes), reps|null, summary|null, createdAt, photoUrl|null, proofId|null, verifiedCount, requiredVerifications, feedItemId|null }
DailyLogDetail { log: DailyLog, mlLabels: string[], mlText|null, proofStatus: ProofStatus|null, verifiers: UserSummary[] }
DayLogs { date, doneCount, totalCount, logs: DailyLog[] }
Notification { id, type, actor: UserSummary|null, feedItemId|null, proofId|null, commentId|null, text|null, read: boolean, createdAt }
ReportedItem { targetType, targetId, reportCount, hidden, reasons: string[], lastReportedAt, author: UserSummary|null,
  preview, photoUrl|null, feedItemId|null }
  // USER rows: author = the reported user, preview = "Name (@handle) · bio", photoUrl = avatar, hidden = suspended, feedItemId null
ReportEntry { targetType, targetId, reporter: UserSummary|null (null = the automatic image check), reason|null, createdAt }
AdminUser { user: UserSummary, email, createdAt, suspended: boolean, suspendedAt|null, strikes: number,
  reports: ReportEntry[] (reports about the user, their posts and their comments, newest first) }
AdminPost { id, type, user: UserSummary|null, createdAt, title, subtitle|null, photoUrl|null, photos: string[] (every photo: post, before, after, proof),
  transformation: TransformationView|null, hidden, isPublic, proofId|null, proofStatus: ProofStatus|null, mlLabels: string[], mlText|null }
AdminComment { id, user: UserSummary|null, body, createdAt, hidden }
AdminReport { targetType, targetId, reportCount, hidden, reports: ReportEntry[], post: AdminPost|null (the post, or the commented post),
  comment: AdminComment|null, user: AdminUser|null }
LeaderboardEntry { rank, user: UserSummary, delta (signed: negative = moved the wrong way), unit, percent: number|null (signed change in % of the starting value, one decimal; GAIN boards rank by it) }
Leaderboard { period, path, metric, unit, endsAt, entries: LeaderboardEntry[] (top 10), me: LeaderboardEntry|null (the viewer, only when outside the top 10, or always when I set hiddenFromLeaderboards) }
StatsDay { date, questLevel: 0..4, slipUps: number, future: boolean }
Stats { month: 'YYYY-MM', days: StatsDay[], clearedPct, bestStreak, questsDone, slipUpCount,
  slipUpChangePct|null, cleanDays, topSlipUps: { type, name, count }[] }
  // cleanDays = days of the month (since sign-up, up to today) that were cleared (all quests done) with no slip-up, counted only while
  // slipUpTracking is on (0 when it is off); a user with no activity has 0. bestStreak follows the skipRestDays setting.
SlipUpType { code, name, icon, custom: boolean }
SlipUp { id, type, name, icon, occurredAt, note|null }  // name/icon of the (possibly custom) type
FriendRequest { id, from: UserSummary, to: UserSummary, createdAt }
InviteResult { user: UserSummary (the link owner), relation: 'REQUESTED' (a friend request to the owner is pending) | 'FRIEND' (already friends, or the owner had asked me and the invite accepted it) }
Relation = 'SELF' | 'FRIEND' | 'REQUESTED' | 'INCOMING' | 'NONE'
ProofView { id, kind: 'QUEST'|'CHECKPOINT', status: ProofStatus, owner: UserSummary, relation: Relation,
  visible: boolean, post: FeedItem | null, reason: HiddenReason|null,
  moderation: ModerationState|null (owner only), useAiFrom: ISO|null (owner only, pending Friends/community proof: when "Use AI check" unlocks) }
  // post.id is null when the owner views a proof that has no feed item (no hype then)
  // reason (only when not visible): FRIENDS_ONLY = friends-only post and I'm not a friend (offer Add friend); UNDER_REVIEW = hidden by
  // reports; REMOVED = rejected, deleted, never shared or otherwise unavailable (no Add friend)
Measurement { id, metric, day: 'YYYY-MM-DD', value, createdAt }  // metric value (kg or cm)
People { count, users: UserSummary[] (max 5) }
CheckpointSocial { hypes: People, alsoChasing: People }
```

## Endpoints

### Auth
- `POST /auth/google` `{ idToken }` → `{ token, user: User }` — backend verifies the Google ID token (audience = configured client ids) and upserts the user. 401 when the token is invalid or the Google e-mail is not verified. The account is matched by Google subject; the e-mail is used only to link an account that has no Google subject yet; an e-mail already linked to another Google account → 409 "This account is already linked to another Google account" (no token). New accounts take the Google name (cut to 80 characters; names starting with "DropZone" fall back to the e-mail name) and the Google picture; later sign-ins never change name or photo, but refresh the stored e-mail.
- `POST /auth/dev` `{ email, displayName }` → `{ token, user }` — only when `DEV_LOGIN=true` (local only; off by default, 404 otherwise; the prod profile refuses to start with it on).

### Config (no auth)
- `GET /config` → AppConfig — `minVersionCode` (block older builds with an "Update in Google Play" screen), current terms/privacy versions and document links (null until set). A stale `Authorization` header is ignored here.

### Me
- `GET /me` → User (may carry the `X-Auth-Token` response header, see Tokens). When `pro` and `proExpiresAt` is within the next hour or passed in the last 7 days, the backend first asks RevenueCat (at most every 10 minutes per user), so a missed renewal heals on app start/resume. It also records that the user opened the app (`last_seen_at`, at most once a day; drives the inactive-account rule in Data retention).
- `GET /me/export` → 200 JSON file (`Content-Disposition: attachment; filename="dropzone-export-YYYY-MM-DD.json"`) with everything I own: `{ exportedAt, profile (all profile fields and settings, email, plan, trial, consent and age-confirmation times), goals[] (all goals, active and old, each with milestones[] and their proof), quests[] (incl. inactive), completions[] (with proof: photo, ML labels/text, status), days[] (done/total per day), weighIns[], measurements[], slipUps[], customSlipUpTypes[], posts[], comments[] (mine), transformations[], friends: { friends, incomingRequests, outgoingRequests, blocked } (UserSummary + since), notifications[], hypes[] (posts I hyped), commentLikes[], reports[] (reports I made), devices[] (platform + updatedAt, no tokens) }`. Photo links are signed links like everywhere else (see Private photos), so they open for at least 12 hours after the download. Free, also allowed for suspended accounts. Settings: "Download my data".
- `PATCH /me` `{ displayName?, handle?, bio?, theme?, unlockMode?, minutesPerQuest?, publicByDefault?, defaultVerification?, slipUpTracking?, skipRestDays?, hiddenFromSearch?, hiddenFromLeaderboards?, verifyRequestPushes?, shareStats?, region?, timezone?, weightUnit?, lengthUnit?, avatarUrl?, trialEndAcknowledged?: true, proEndAcknowledged?: true }` → User (MINUTES / COMMUNITY / publicByDefault=true need PRO). `skipRestDays` (free, Settings only) recomputes `streak` at once. `hiddenFromSearch`, `hiddenFromLeaderboards` and `verifyRequestPushes` are free privacy and push switches (see User). `trialEndAcknowledged` ("Continue with Free" on the trial-ended screen) clears `trialEndPending`; `proEndAcknowledged` (same choice on the PRO-ended screen) clears `proEndPending` until the next time a subscription ends. `displayName` can't be blank or start with "DropZone" (400); `handle` must match `^[a-z0-9._]{3,20}$`, must not be reserved (`dropzone`, `admin`, `administrator`, `support`, `official`, `moderator`, `mod`, `help`, `staff`, `team`, `system`, `root`; 400 "This handle is reserved") and must be unique (409 "Handle is taken"); `bio` max 150 chars, empty string clears it. `avatarUrl` must be one of my own uploads (see Photo URLs, else 400); empty string removes the photo (app falls back to initials); the replaced photo is deleted from storage. Free feature. The app's first onboarding step saves name, handle and bio through this endpoint before `POST /onboarding`.
- `DELETE /me` → 204 — deletes the account: all uploads under `uploads/{myUserId}/`, the RevenueCat customer (when the REST key is set) and every row of the user (goals, proofs, posts, comments, likes, hypes, friends, notifications, reports, blocks). The token stops working (401). The app then signs out locally and tells the user to cancel a Google Play subscription in Google Play (deleting the account does not stop billing).
- `POST /me/sign-out-everywhere` → 204 — every token issued so far (all devices, including this one) gets 401 and every push token of the account is removed; the app signs out locally.
- `POST /me/consent` `{ termsVersion, privacyVersion, ageConfirmed: true, shareStats?, region? }` → User — records acceptance (versions + time) and the self-declared "I'm 18 or older" (`age_confirmed_at`). `ageConfirmed` missing or false → 400 "Confirm that you're 18 or older"; both versions must equal the current versions from `GET /config`, else 409 (reload and accept again). `User.consentRequired` turns false only once both are stored (accounts that accepted before the age question see the screen once more). `shareStats` stores the anonymised-statistics choice with its time (`share_stats_at`). `region` `{ source: SIM|NETWORK|PHONE_REGION|TIME_ZONE, value, eu }` records how the app decided whether to offer the EU choice (the first available of SIM country, network country, phone region, time zone) and when (`region_at`); the app also sends it with `PATCH /me` when the Settings switch changes. Both are in `GET /me/export`.
- `POST /users/handle-available` `{ handle }` → HandleCheck — live check while typing; your own current handle counts as available; reserved handles are `valid: false`. (`GET /users/handle-available?handle=` still works for older builds.)
- `PUT /me/push-token` `{ token, platform?: Platform (default ANDROID) }` → 204 — registers this device's FCM token for me. A token belongs to one account: registering it moves it from any other account (shared phone). One user can have several tokens (several devices); every push goes to all of them. Call it after every sign-in and when FCM rotates the token.
- `DELETE /me/push-token` `{ token }` → 204 — removes this device's token (only if it is mine; no error otherwise). The app calls it on sign-out **before** dropping the JWT. Allowed for suspended accounts too.
- `PUT /me/locked-apps` `{ packages: string[] }` → User (free: only `com.instagram.android`)
- `POST /billing/refresh` → User (backend asks RevenueCat REST API for entitlement `pro`: expiry incl. grace period, product, will-renew, billing issue; when RevenueCat fails or takes longer than 5 s the stored state is returned)

### Onboarding
- `POST /onboarding` `{ path, metric, metricLabel?, unit, startValue, goalValue, checkpoints (2..10), questCodes: string[], lockedApps: string[], unlockMode, questSettings?: QuestSettings[], weightUnit?, lengthUnit? }` → `{ user: User, goal: Goal }` (values always in kg/cm; units default KG/CM)
  - creates goal + evenly spaced checkpoints, active quests, sets `onboarded=true`. A new account's 7-day trial starts here (`trialEndsAt` = now + 7 days when it is still null; existing trials are not changed), before the PRO checks, so the PRO choices (more quests, other apps, MINUTES) are accepted; a failed onboarding starts nothing. Free (trial over): max 3 free quest codes, only Instagram, WHOLE_DAY. A quest without `questSettings` (or without `days` / `perDay` in them) gets the catalog `defaultDays` / `defaultPerDay`.
  - Milestones are at least 0.2 kg (WEIGHT, STRENGTH) / 0.5 cm (SIZE) apart, also from the start: when `checkpoints` doesn't fit, fewer checkpoints are created (read the count from the response). A goal closer to the start than two gaps (0.4 kg / 1.0 cm) → 400 "goalValue must be at least 0.4 kg away from startValue".
  - 409 when the user is already onboarded (only one active goal per user, also enforced by the database).
  - `unit` must match the metric: WEIGHT and STRENGTH → `kg`, SIZE → `cm` (400). Values per metric (start, goal, checkpoint targets, progress and proof values, 400 otherwise): WEIGHT 20–350 kg, STRENGTH 1–500 kg, SIZE 5–250 cm. `questCodes` max 50, `lockedApps` max 20.

### Goal & checkpoints
- `GET /goal` → Goal (404 if none). `reached: true` once the final milestone is CLEARED.
- `POST /goal` `{ goalValue, checkpoints (2..10), metric?, metricLabel?, unit?, startValue? }` → Goal — starts the next goal after the current one is reached (409 "Reach your current goal before you start a new one" before that; 409 "Finish onboarding first" without onboarding). Defaults: the current goal's metric and label, `unit` of the metric, `startValue` = the current goal's `currentValue` (required when the metric changes, 400). Same rules as onboarding (path stays the user's path, LOSE = WEIGHT only, direction, metric ranges, min distance; fewer milestones when they don't fit). The new milestones get the Settings defaults (see `POST /goal/apply-defaults`) when PRO, else PRIVATE + AI. The old goal stays stored (inactive, `endedAt` set) and shows in `GET /goals/history`; quests, streak and settings don't change. Free.
- `GET /goals/history` → PastGoal[] — my previous (inactive) goals, newest first. Free.
- `POST /goal/apply-defaults` → `{ count }` — applies the Settings defaults to every milestone of the active goal that isn't reached or submitted yet (ACTIVE / LOCKED) and returns how many changed. Default visibility: `publicByDefault` → EVERYONE, else `defaultVerification` COMMUNITY → FRIENDS, else PRIVATE; verification = `defaultVerification` (AI for PRIVATE). FRIENDS / EVERYONE need PRO (402). App: after changing "Public milestone rewards" or "Verification" in Settings ask "Apply to your N remaining milestones?" (N = ACTIVE + LOCKED milestones in `GET /goal`) and call this on yes.
- `GET /goal/history` → `{ start: 'YYYY-MM-DD', points: { day, value }[] }` (PRO) — entries of the active goal from its start day (user's zone) to today, oldest first, one per day: WEIGHT = that day's weigh-in, STRENGTH/SIZE = the best measurement of the day (LOSE lowest, GAIN highest). Values metric.
- `PATCH /goal` `{ startValue?, goalValue? }` → Goal — edit the active goal. Values within the metric range (see Onboarding, 400). `goalValue` always editable; `startValue` only while no checkpoint is CLEARED (409). Direction must hold (LOSE: goal < start; GAIN: goal > start, 400). Checkpoints that are CLEARED or PENDING_VERIFICATION keep their targets; the rest are re-spread evenly between the last of those (or the start) and the new goal (last one = goal, others rounded to 0.1). The new goal must be beyond that last done checkpoint (400) and far enough for the open checkpoints to stay 0.2 kg / 0.5 cm apart (400 "Milestones must be at least 0.2 kg apart: …"); 409 when every checkpoint is done. If no measurement moved `currentValue` away from the old start, it follows the new start. The number of checkpoints never changes.
- `POST /goal/progress` `{ value, date? }` → Goal — logs a measurement for a non-WEIGHT goal (409 for WEIGHT: use weigh-ins; value within the metric range, 400). `date` (default today) must be yesterday, today or tomorrow in the user's zone (400 "Date must be yesterday, today or tomorrow"). STRENGTH keeps the best lift as currentValue; SIZE takes the value only when it is the newest entry (no later day logged). Checkpoints still clear only via proof. The app asks the user after a LOG quest ("Beat a lift") when the goal is GAIN + STRENGTH.
- `GET /measurements` → Measurement[] — my last 60 measurements of the active goal's metric, newest first (404 without a goal). Use it to find a wrong entry. For WEIGHT goals there is one row per day (the day's weigh-in, or the start value on the goal's first day).
- `DELETE /measurements/{id}` → 204 — deletes my own measurement (404 otherwise). A WEIGHT row also deletes that day's weigh-in (same as `DELETE /weigh-ins/{day}`). currentValue is recomputed: WEIGHT/SIZE = the latest-dated remaining value, STRENGTH = the best remaining lift, the start value when nothing is left.
- `GET /checkpoints/{id}/social` → CheckpointSocial (PRO, own checkpoint). `hypes`: who hyped this checkpoint's feed items (newest first, not me, without blocked or suspended people). `alsoChasing`: friends on the same path whose active goal has a FRIENDS or EVERYONE checkpoint with the same index that is ACTIVE or PENDING_VERIFICATION (PRIVATE milestones never show; friends who are not PRO are left out until they resubscribe).
- `PATCH /checkpoints/{id}` `{ rewardTitle?, rewardImageUrl?, rewardImageCredit?, visibility?, isPublic?, verification?, deadline?, targetValue? }` → Checkpoint — `rewardImageUrl` (max 1024) must be my own upload or an `https://images.unsplash.com/` photo when it changes (400); `null`/empty clears it; a replaced own upload is deleted from storage. `rewardImageCredit` `{ name (max 120), link (https://unsplash.com/…) } | null`: send it with an Unsplash `rewardImageUrl` (the `credit` from photo search); 400 when the reward photo isn't from Unsplash or the link isn't an unsplash.com https link. Changing or removing `rewardImageUrl` clears the credit (send both together). `visibility` (PRIVATE | FRIENDS | EVERYONE, else 400) also updates the milestone's posts and proofs: EVERYONE = public posts, FRIENDS = friends-only posts, PRIVATE = only I see its posts (friends and strangers lose them from feeds, share links and verification). Widening (to FRIENDS or EVERYONE, or FRIENDS → EVERYONE) needs PRO (402) and is refused with 409 while the milestone's post is under review or was removed (`moderation`); narrowing is always allowed. PRIVATE while a community proof is waiting → 409 "A proof of this milestone is waiting for verification. Withdraw it before you make the milestone private." Older builds may still send `isPublic`: true = EVERYONE, false = FRIENDS when the (requested) verification is COMMUNITY, else PRIVATE; sending the current value changes nothing. `verification` is compared with the shown (effective) value, so sending the shown value back changes nothing; a different value only for ACTIVE/LOCKED checkpoints (409), COMMUNITY needs PRO (402) and a FRIENDS or EVERYONE milestone (400 "Community verification needs a milestone shared with friends or everyone"); making a COMMUNITY milestone PRIVATE switches it to AI. `targetValue` (metric, within the metric range) only for ACTIVE/LOCKED checkpoints (409 otherwise). LOSE: below the previous checkpoint (or start) and above the next; GAIN: above the previous and below the next; at least 0.2 kg / 0.5 cm from both (400 with the allowed range). Editing the last checkpoint's target = editing the goal target (`PATCH /goal` rules, open checkpoints re-spread). `deadline` (`YYYY-MM-DD` or null) drives `overdue` and the deadline reminder push (see Jobs); changing it re-arms the reminder.
- `POST /checkpoints/{id}/proof` `{ photoUrl, value, mlLabels? (max 30 × 60 chars), mlText? (max 2000) }` → Checkpoint — `photoUrl` must be my own upload not used by another proof (400); `value` within the metric range (400). 409 when the checkpoint isn't ACTIVE (of two parallel submits one gets 409).
  - "Meets the target" (LOSE: value <= target, GAIN: value >= target) allows half the display step of the user's unit: 0.05 kg, 0.05 lb (0.0227 kg), 0.05 cm or 0.05 in (0.127 cm), so entering the target exactly as shown in lb/in clears it.
  - A WEIGHT proof is saved as today's weigh-in only when there is no weigh-in today yet (it never overwrites one). STRENGTH/SIZE proofs add a measurement.
  - AI (also COMMUNITY while the owner isn't PRO or the milestone is PRIVATE, no 402): meets target → CLEARED (+ feed item CHECKPOINT_CLEARED when FRIENDS / EVERYONE and PRO: friends-only for FRIENDS, public for EVERYONE), else 409. That post never shows the scale photo: its `photoUrl` is the reward photo when it is my own upload, else null. `GET /proofs/{id}` of an AI proof shows no scale photo to anyone but the owner.
  - COMMUNITY (owner PRO, milestone FRIENDS or EVERYONE): creates Proof + feed item CHECKPOINT_PROOF (public for EVERYONE, friends only for FRIENDS; the scale photo is shown to verifiers), status PENDING_VERIFICATION; CLEARED after 3 verifies (that CHECKPOINT_CLEARED post keeps the proof photo). The owner can withdraw it or switch it to the AI check after 48 h (see Feed).
  - The proof's `aiChecked` is decided by the server from `mlLabels` / `mlText` (see AI check); the milestone clears either way (values stay freely editable, no tolerance against the photo).

### Uploads
- `POST /uploads` multipart `file` (jpeg/png, max 10 MB, max 4096 px per side) → `{ url }` (signed link for display, see Private photos; send it back unchanged in the next request). The server re-encodes the image (JPEG quality 0.9, PNG stays PNG): EXIF/GPS and other metadata are removed and the EXIF orientation is applied to the pixels. Objects are stored with `Cache-Control: private, max-age=3600` (older objects: `public, max-age=3600`). 400 for other files, unreadable or too large images.

### Photo search (Unsplash proxy, reward photos)
- `POST /photos/search` `{ q }` (or the older `GET /photos/search?q=`) → `{ id, url, thumb, credit: { name, link } | null }[]` (max 12, squarish, safe content). `q` trimmed, 1–100 chars (400). Results are cached per normalised query (trimmed, lower-case, single spaces) for 1 hour. Errors: 429 `PHOTO_SEARCH_LIMIT` (Unsplash hourly limit), 503 `PHOTO_SEARCH_OFF` (no or rejected key), 502 `PHOTO_SEARCH_FAILED`; `message` is shown to the user.
- `POST /photos/{id}/download` → 204. Call when a picked photo is saved (Unsplash download tracking); failures are ignored.

### Quests
- `GET /quests/catalog` → QuestType[] (both paths; client filters by path)
- `GET /quests` → UserQuest[]
- `PUT /quests` `{ codes: string[], settings?: QuestSettings[] }` → UserQuest[] (replaces catalog quests; custom ones kept; kept quests keep their days/perDay unless settings change them; newly added ones start with the catalog `defaultDays` / `defaultPerDay` unless settings say otherwise)
- `POST /quests/custom` `{ name, icon, proof, group, days, squadCheck, checkAudience? }` → UserQuest (PRO). `proof`: PHOTO, REPS, CHECKIN or NONE (AUTO is rejected with 400). `days` 1..7 without nulls (400). `squadCheck: true` only with PHOTO (400 "Friends check works only for photo quests") and, with `checkAudience` FRIENDS (default), only with at least 3 friends (400 "You need at least 3 friends for Friends check, or choose Everyone").
- `PATCH /quests/{id}` `{ squadCheck?, checkAudience?, days?, perDay?, target? }` → UserQuest — catalog and custom quests; turning squad check (Friends check) on needs PRO and a PHOTO quest (400 "Friends check works only for photo quests"); turning it on with FRIENDS, or switching an active Friends check to FRIENDS, needs at least 3 friends (not blocked or suspended; 400 "You need at least 3 friends for Friends check, or choose Everyone"); EVERYONE has no minimum. `checkAudience` decides who sees and verifies the proofs: FRIENDS = friends only, EVERYONE = public post any PRO user can verify. The Settings switch "Public milestone rewards" (`publicByDefault`) no longer affects quest proofs. Existing quests start as FRIENDS; `days` (non-empty, 1..7, no nulls) and `perDay` (1..20; >1 only when the quest's `multiSlot` is true, else 400 "<name> can't repeat during the day") are free. `target` is the user's own daily goal for AUTO and REPS quests only (400 otherwise): steps 1,000..50,000 (Steps, Rest-day walk), sleep 240..720 minutes (Sleep; the quest is renamed "Sleep X h"), reps 5..200 squats (Camera reps and custom REPS quests; push-ups need half, rounded up; the app offers Easy 10, Medium 20, Hard 40 or a custom number). Defaults: Steps 8,000, Sleep 480, Rest-day walk 4,000, reps 20. Today progress, completion and the auto sync use the user's target. `target` is also accepted in onboarding `questSettings` and `PUT /quests` `settings`. Kept while `PUT /quests` keeps the quest.
- `DELETE /quests/{id}` → 204
- `PUT /quests`, `POST /quests/custom`, `PATCH /quests/{id}` and `DELETE /quests/{id}` recompute today's stored day result (streak, stats), so it always matches `GET /today`.

### Today
- `GET /today?date=YYYY-MM-DD` → Today (date defaults to user's today; any date can be read). `unlocked` is false for a day that is over (see the Today model).
- `POST /quests/{userQuestId}/complete` `{ date, photoUrl?, value?, reps?, exercise?, mlLabels?, mlText?, slot? }` → TodayQuest (slot defaults to the first open slot; each meal gets its own proof / Friends check)
  - `date` (default today) must be yesterday, today or tomorrow in the user's zone (400 "Date must be yesterday, today or tomorrow").
  - Idempotent: a repeated request for a slot that is already done (double tap, second device) returns the stored completion with 200 (same `completionId`). A user's completions run one at a time, so parallel requests never lose the day result.
  - squadCheck && PRO && a photo was sent → Proof needs 3 verifies, status PENDING (feed item QUEST_PROOF, friends-only or public per `checkAudience`); else DONE (a weigh-in sent without a photo completes DONE without Friends check). A PENDING slot already unlocks the day (see Today) but counts for `doneCount` and the streak only once verified. The owner can withdraw it or switch it to the AI check after 48 h (see Feed); nothing happens automatically.
  - AI check: the server decides `aiChecked` from `mlLabels` / `mlText` (see AI check under Rules); the summary says "AI verified" only then, otherwise "Photo proof". Values stay freely editable (no tolerance check against the photo).
  - AUTO quests: app sends `value` (steps / sleep minutes); DONE when value >= target.
  - REPS quests: app sends `reps` of one camera session and `exercise` (`SQUAT` | `PUSHUP`, default `SQUAT`; anything else 400). DONE when that session reaches the target: reps >= target for squats, reps >= ceil(target / 2) for push-ups (sessions are not added up). While TODO, `progress` is the best session so far; `target` is always the squat target.
  - Limits (400): `photoUrl` my own upload not used by another proof, `mlText` max 2000, `mlLabels` max 30 × 60 chars, `value` 0–100,000 (steps), sleep max 1,080 minutes, weigh-in 20–350 kg, LOG quests max 500 kg, `reps` 0–500.
- `POST /weigh-ins` `{ date, value (20–350 kg), photoUrl? (my own upload), mlText? (max 2000) }` → `{ id, date, value }` — `date` (default today) must be yesterday, today or tomorrow (400). One weigh-in per day (a second one replaces the day's value). Goal currentValue follows only when this is the newest weigh-in (no later day logged). Completes that day's weigh-in quest. Checkpoints are cleared only via proof.
- `DELETE /weigh-ins/{day}` → 204 — deletes my weigh-in of that day (404 when there is none) and its photo; currentValue becomes the latest-dated remaining weight (or the start). The day's weigh-in quest stays done but loses its `value`. The app should confirm first.

### Social (PRO; `GET /social/requests` is free)
- `GET /social/friends` → UserSummary[]
- `POST /social/search` `{ q }` → UserSummary[] (`GET /social/search?q=` still works for older builds) — at most 10 people whose handle starts with `q` (a leading `@` is ignored) or whose display name equals `q` (case-insensitive); exact handle first, then by handle. Fewer than 3 characters → `[]`. Leaves out me, blocked and suspended people and users with `hiddenFromSearch`.
- `GET /social/requests` → `{ incoming: FriendRequest[], outgoing: FriendRequest[] }` — also for free users (read-only: show who asked with "Go PRO to accept")
- `POST /social/requests` `{ userId }` → FriendRequest
- `POST /social/requests/{id}/accept` → UserSummary (PRO, 402 for free users)
- `DELETE /social/requests/{id}` → 204 (decline / cancel)
- `DELETE /social/friends/{userId}` → 204
- `GET /social/invite` → `{ code, url }` (url = `https://dropzone.mobi/invite/{code}`, app link `dropzone://invite/{code}`)
- `POST /social/invite/{code}/accept` → InviteResult — sends a friend request from me to the link owner (who accepts it like any request; in-app `FRIEND_REQUEST` + push), `relation: REQUESTED`. Repeats don't send another one. Already friends → `FRIEND`. When the owner had already sent me a request, the invite accepts it at once (`FRIEND`, the owner gets `FRIEND_ACCEPTED`). 404 for an unknown code, a suspended owner or a block either way; 400 for my own code; PRO (402).

### Feed (PRO)
- `GET /feed?scope=FRIENDS|EVERYONE|TO_VERIFY&cursor=<X-Next-Cursor>&limit=20` → FeedItem[] (+ header `X-Next-Cursor`, see Paging; `before=<iso>` still accepted). Newest first. Posts of blocked or suspended people, posts hidden by reports (except my own) and every post (all feed types) of authors who are no longer PRO are left out; the author still sees their own, and everything shows again when they resubscribe. `TO_VERIFY` = exactly the proofs I can verify now: friends' pending proofs + public pending proofs, not hidden, not from blocked/suspended or non-PRO people, not rejected, not mine, not already verified by me.
- `GET /feed/pending-count` → `{ count }` — the size of the `TO_VERIFY` list (same rules); open that list when the "N to verify" chip is tapped.
- `GET /proofs/{id}` → ProofView (PRO, 402 otherwise; the owner can always view their own). Others see a proof only through its post when they can see that post (public, or friends-only and I'm a friend; not hidden); a proof without a post is visible to the owner only; a proof of an owner who is no longer PRO is visible to the owner only (`reason: REMOVED` for others, `GET /feed/{id}` 404, verify 404, hype and comments 404). Otherwise `visible: false`, `post: null`, `reason` says why, plus owner + relation. 404 when the proof doesn't exist or the owner blocked me / I blocked them. Share links: `https://dropzone.mobi/p/{proofId}`, app link `dropzone://p/{proofId}`.
- `POST /proofs/{id}/verify` → FeedItem (no reject; can't verify own (403); friends-only proof of a non-friend → 403; once per user; 404 when the proof is REJECTED or WITHDRAWN or its post isn't visible to me, e.g. hidden by reports; parallel verifies are counted one at a time, so exactly one of them completes the proof)
- `POST /proofs/{id}/withdraw` → ProofView — owner only (404 for anyone else), any time while the proof is PENDING (409 otherwise). Status WITHDRAWN, its posts (with comments, hypes, notifications, reports) are deleted, the quest slot goes back to TODO / the milestone back to ACTIVE, no notification. The same photo may be sent again. Re-fetch Today / Goal. No PRO needed.
- `POST /proofs/{id}/use-ai` → ProofView — owner only (404), for a PENDING proof that needs verifies (409 otherwise) once it is 48 h old (`ProofView.useAiFrom`; 409 "You can switch to the AI check 48 hours after you submitted the proof" before). It completes like an AI proof: status VERIFIED, `requiredVerifications` 0; quest slot DONE with summary "AI-checked after no verification" (or "Photo proof after no verification" when the AI check didn't pass), milestone CLEARED (+ CHECKPOINT_CLEARED post for FRIENDS / EVERYONE). Verifies already given stay stored. No PRO needed.
- `POST /feed/{id}/hype` → FeedItem (toggle; parallel taps never fail). The first hype notifies the author (in-app `HYPE` + push); un-hype removes that notification and hyping again doesn't notify or push again.
- `GET /feed/{id}` → FeedItem (404 when the viewer can't see it; the author can open their own without PRO)
- `PATCH /feed/{id}` `{ isPublic: boolean }` → FeedItem — my own post only (403 when I can see someone else's post, 404 otherwise); making it public needs PRO (402) and is refused with 409 while the post has a `moderation` state ("This post was reported and is under review. You can share it again once a moderator restores it." / "This post was removed by a moderator and can't be shared again"). Proof posts: also sets the proof and its other posts; milestone posts set the milestone's visibility (true → EVERYONE, false → FRIENDS when it was EVERYONE, like `PATCH /checkpoints/{id}`). Before-after posts: true → EVERYONE, false → FRIENDS; 409 when the set was removed by a moderator.
- `DELETE /feed/{id}` → 204 — my own post only (same errors). Deletes the post with its comments, hypes, notifications and reports. A proof that is still pending is cancelled (REJECTED): its quest slot goes back to TODO or its milestone back to ACTIVE (submit again with a new photo). A before-after set goes back to PRIVATE.

### Transformations (before / after)
- `GET /transformations` → Transformation[] (mine, newest first)
- `POST /transformations` `{ beforeUrl, afterUrl, beforeCaption?, afterCaption?, layout?: SPLIT, visibility?: PRIVATE }` → Transformation. FRIENDS / EVERYONE need PRO. Both URLs must be my own uploads (400).
- `PATCH /transformations/{id}` (same fields, all optional; empty caption clears it) → Transformation. A changed URL must be my own upload; the replaced photo is deleted from storage. Sending the current URL again is accepted. A set removed by a moderator (`removedByModerator`) stays PRIVATE: FRIENDS / EVERYONE → 409. While its post is under review (`moderation: UNDER_REVIEW`) widening the visibility (PRIVATE → FRIENDS / EVERYONE, FRIENDS → EVERYONE) → 409; narrowing works. Changing a photo or caption makes a post that an admin restored hideable by reports again.
- `DELETE /transformations/{id}` → 204 (also deletes its post, comments, hypes and both photos)
- Publishing (FRIENDS / EVERYONE) creates one TRANSFORMATION feed item (photoUrl = after photo). Going back to PRIVATE keeps the item (comments survive) but hides it. Sets of users who are no longer PRO stay stored but are hidden from others.

### Comments
- `GET /feed/{id}/comments` → Comment[] (oldest first; whoever can see the post; PRO unless it is your own post)
- `POST /feed/{id}/comments` `{ body }` (≤500 chars, PRO) → Comment. Notifies the post owner in-app (`COMMENT`) and with a `COMMENT` push (`{ feedItemId, commentId }`, open `/post/{feedItemId}`); only the post owner gets a push (earlier commenters don't), never for comments on my own post or between people who blocked each other.
- `DELETE /comments/{id}` → 204 for the comment author and for the owner of the post it is under (`Comment.canDelete`); 403 for anyone else
- `POST /comments/{id}/like` → Comment (toggle; PRO; own comments can be liked too). Liking notifies the comment author in-app (`COMMENT_LIKE`, no push); unliking removes that notification. 404 when the post or comment isn't visible to you.
- `GET /logs?date=YYYY-MM-DD` → DayLogs (your own quest completions for that day in the order they were logged, including pending and partly done ones; date defaults to your today)
- `GET /logs/{completionId}` → DailyLogDetail (own logs only, 404 otherwise). If the proof has a feed post, `log.feedItemId` points to it for hypes and comments.

### Notifications (in-app)
- `GET /notifications?cursor=<X-Next-Cursor>&limit=30` → Notification[] (+ header `X-Next-Cursor`, see Paging; `before=<iso>` still accepted) — comments, hypes, verifies, proof verified / rejected, friend requests / accepts, admin reports. Notifications from blocked or suspended people are left out. A cancelled, declined or blocked friend request removes its `FRIEND_REQUEST` notification.
- `GET /notifications/unread-count` → `{ count }` (same rules as the list)
- `POST /notifications/read` `{ ids?: string[] }` → 204 (no ids = mark all read)

### Moderation
- `POST /reports` `{ targetType: POST|COMMENT|USER, targetId, reason? }` → 204 (can't report your own post / comment or yourself, 400; repeats are ignored). Posts and comments must be visible to the reporter (404 otherwise); USER takes a user id (404 when unknown). 3 reports from different accounts that are at least 3 days old (`MIN_REPORTER_AGE`) auto-hide the post / comment until an admin reviews it; users are never auto-hidden. One report with reason `Nudity` (the app's key) or "Nudity or sexual content" from such an account hides a post with a photo at once ("Hidden after a nudity report"). A restored post is never auto-hidden again until it is edited. The first report of an item, every auto-hide and every image-check hide notify all admins (in-app `ADMIN_REPORT` + push).
- Image check: when a post becomes visible to everyone (quest proofs with `checkAudience: EVERYONE`, milestone posts of an EVERYONE milestone incl. its reward photo, a milestone or post switched to EVERYONE, a before-after set created or switched to EVERYONE or getting a new photo while EVERYONE), each of its own photos is read from the bucket and sent to Google Cloud Vision SafeSearch. `adult` or `racy` LIKELY / VERY_LIKELY hides the post (`hidden`, owner sees `moderation: UNDER_REVIEW`; no verify-request push), adds a report without a reporter (reason "Image check: adult <likelihood>, racy <likelihood>") to the admin queue and notifies the admins ("Hidden by the image check: …"). When Vision fails the post is published and a warning is logged. Posts an admin restored are not checked again. The request waits for the check (usually under a second).
- `POST /blocks/{userId}` → 204 (also removes the friendship, pending requests and their notifications), `DELETE /blocks/{userId}` → 204, `GET /blocks` → UserSummary[]. Blocking hides each other's posts, comments, notifications, hypes and search results both ways and leaves each other out of all counts (unread, to verify, hypes, comments) and faces; the blocked user can't comment on, verify or see the blocker's posts.
- Admin only (Google-linked account listed in `ADMIN_EMAILS`, else 403; no PRO needed):
  - `GET /admin/reports` → ReportedItem[] (posts, comments and users)
  - `GET /admin/reports/{POST|COMMENT|USER}/{id}` → AdminReport — full content even when hidden: every photo (before and after), captions, proof ML data, the comment with its post, or the user's profile (404 when the item is gone)
  - `POST /admin/reports/{type}/{id}/restore` → 204 (unhide, clear reports, never auto-hide again until the content is edited; for USER: dismiss the reports)
  - `POST /admin/reports/{type}/{id}/remove` → 204 — POST: deletes the post and its photo files (post photo, proof photo, before and after); a pending proof is rejected (quest slot back to TODO / milestone back to ACTIVE, owner notified with `PROOF_REJECTED`); a before-after set goes back to PRIVATE and is marked `removedByModerator`; the post's proof is marked removed, so the owner's milestone, proof view and other posts of that proof show `moderation: REMOVED` and can't be made public again (409). COMMENT: deletes the comment. USER: resets the profile (see below). Each removal adds a strike to the author.
  - `GET /admin/users/{id}` → AdminUser
  - `POST /admin/users/{id}/reset-profile` → AdminUser — name "DropZone user", handle `user` + 8 digits, bio and avatar removed (avatar file deleted)
  - `POST /admin/users/{id}/suspend` / `unsuspend` → AdminUser (400 for yourself). A suspended account gets 403 `SUSPENDED` on everything but `GET /me` and `DELETE /me`, and its content (posts, proofs, comments, hypes, profile in search, friends lists and requests, leaderboard) is hidden from everyone else. Automatic suspension: the 4th moderator removal (strike) of a user's posts, comments or profile suspends the account and sends the push `ACCOUNT_SUSPENDED`; every later removal while unsuspended suspends again.

### Leaderboard (PRO)
- `GET /leaderboard?period=WEEK|MONTH|HALF_YEAR` → Leaderboard — friends + me with the same path (and metric for GAIN), without blocked or suspended people and without friends who are not PRO (they come back when they resubscribe); LOSE ranks by kg dropped, GAIN by percent change (`percent`; `delta` keeps the gain in the goal unit), top 10. People with `hiddenFromLeaderboards` are left out of everyone else's board. `delta` = change from the last entry before the period (or the first one in it) to the latest one in it, signed (a gain on a LOSE board is negative). Only people with at least one entry in the period are ranked. Equal deltas (GAIN: equal percents) share a rank (1, 2, 2, 4; same rank sorted by name). Implausible jumps are ignored: a weight entry more than 3 kg per week (at least one week) away from the previous accepted entry, a strength/size entry more than 30 % away. `me` = my entry when I'm outside the top 10. With `hiddenFromLeaderboards` I am never in `entries` (the others are ranked without me) and `me` always holds my entry with the rank I would have. When nobody else qualifies, `entries` holds only me (or nothing when I have no entry either): show the "Add friends" state.

### Stats & slip-ups (PRO)
- `GET /stats?month=YYYY-MM` → Stats
- `GET /slip-ups/types` → SlipUpType[] (built-in + my custom ones; any signed-in user)
- `POST /slip-ups/types` `{ name, icon }` → SlipUpType (PRO; max 20; name unique per user; code generated)
- `DELETE /slip-ups/types/{code}` → 204 (own custom types only; hidden, past slip-ups keep their name)
- `POST /slip-ups` `{ type, occurredAt?, note? }` → SlipUp
- `GET /slip-ups?date=YYYY-MM-DD` → SlipUp[] — my slip-ups on that day in my timezone (default today), newest first; listing/removing my own data needs no PRO
- `DELETE /slip-ups/{id}` → 204 (own only, 404 otherwise); stats and heat maps are computed live, so they update right away
- `User.slipUpTracking` is a display preference only: the app hides the slip-up UI when it is off, but the API still accepts, lists, deletes and counts slip-ups (`slipUpCount`, `topSlipUps`, heat map). The only server effect: `cleanDays` is 0 while it is off. Nobody should rely on it to block slip-ups.

### Webhooks
- `POST /webhooks/revenuecat` header `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>` — RevenueCat event for `app_user_id` = User.id. 401 when the secret is wrong or not configured. Each event id is processed once (repeats are no-ops) and logged in `billing_events` with its environment (sandbox events are applied too). For every event except `TEST` the backend reads the subscriber from the RevenueCat REST API and stores that state; only when REST is not configured or fails is the event payload applied, and then only if it is not older (`event_timestamp_ms`) than the last applied event. `TRANSFER` refreshes both sides over REST.

## Push notifications (FCM data: `{ type, ... }`)
`DAILY_REMINDER` (`{ date, remaining }`), `VERIFY_REQUEST` (`{ proofId, feedItemId, count }`: a friend posted a proof that needs verifies; sent only to friends who are PRO and have `verifyRequestPushes` on, at most one per friend every 3 hours: proofs posted meanwhile get no push of their own; the push says "<Name> needs a verify" when 1 proof waits for that friend, "<N> proofs need your verify" when more do, `count` = friends' proofs waiting for that friend, ids = the newest proof: open the post when count is 1, the TO_VERIFY list otherwise; none for a post hidden by the image check), `VERIFIED` (your proof got a verify / completed), `HYPE` (once per person and post), `FRIEND_REQUEST`, `FRIEND_ACCEPTED`, `PROOF_REJECTED` (`{ proofId }`, a moderator removed your pending proof), `ADMIN_REPORT` (`{ targetType, targetId }`, admins only), `TRIAL_ENDING`, `TRIAL_ENDED` (`{ link: "/paywall" }`), `BILLING_ISSUE` (`{ link: <Play subscription URL> }`), `PRO_ENDED` (`{ link: "/paywall" }`), `PRO_BACK`, `DEADLINE_REMINDER` (`{ checkpointId, link: "/journey/<checkpointId>" }`, title "Milestone N is due in 3 days / tomorrow / today"), `ACCOUNT_DELETION` (no data; "Your DropZone account will be deleted soon": opening the app keeps the account), `COMMENT` (`{ feedItemId, commentId }`, someone commented on my post; open `/post/{feedItemId}`), `ACCOUNT_SUSPENDED` (no data; "Your DropZone account is suspended" after the 4th moderator removal; the app shows the suspended screen from `GET /me`). `link` is either an app route (starts with `/`) or an https URL to open outside the app. The trial, billing and PRO pushes also create the in-app notification of the same type; `DEADLINE_REMINDER`, `ACCOUNT_DELETION` and `ACCOUNT_SUSPENDED` are push only (no in-app notification); `COMMENT` also has the in-app `COMMENT` notification.
Android channel (`android.notification.channel_id`): `reminders` (DAILY_REMINDER, TRIAL_ENDING, TRIAL_ENDED, DEADLINE_REMINDER), `community` (VERIFY_REQUEST, VERIFIED, HYPE, FRIEND_REQUEST, FRIEND_ACCEPTED, PROOF_REJECTED, ADMIN_REPORT, COMMENT), `account` (BILLING_ISSUE, PRO_ENDED, PRO_BACK, ACCOUNT_DELETION, ACCOUNT_SUSPENDED). A token that FCM reports as unregistered (or invalid) is deleted.

## Jobs
`POST /internal/jobs/{name}` (outside `/api/v1`) → 200 `{ job, counts: { <name>: number }, ms }`, called by Cloud Scheduler with a Google OIDC ID token in `Authorization: Bearer`. The token must be signed by Google, issuer `https://accounts.google.com` (or `accounts.google.com`), audience = `JOBS_AUDIENCE`, verified e-mail = `JOBS_INVOKER` (the scheduler's service account). Missing, invalid or expired token, wrong issuer or audience, or an app JWT → 401; wrong or unverified e-mail → 403; `JOBS_AUDIENCE` / `JOBS_INVOKER` not set → 403; unknown job → 404; a job that fails → 500 (Cloud Scheduler retries). The app JWT is never read on `/internal/**`. Every job is idempotent (claims in the database), handles each user in its own small transaction, sends pushes after it, and logs one summary line `job=<name> <counts> ms=<n>`.
- `daily-reminders` (hourly): `DAILY_REMINDER` at 18:00 local to users with unfinished quests, once per local day.
- `trial-reminders` (hourly): trial-ending notice once within 2 days of the end, trial-ended notice once in the 3 days after the end (not after "Continue with Free" or a purchase); 9:00–21:00 local.
- `deadline-reminders` (hourly): `DEADLINE_REMINDER` for milestones of the active goal that are ACTIVE or LOCKED and whose deadline is 0–3 days ahead in the owner's zone, 9:00–21:00 local, once per milestone and deadline (a new deadline re-arms it); only users with a push token.
- `billing-reconcile` (daily): RevenueCat refresh of subscriptions whose `proExpiresAt` is within the next day or the last 3 days.
- `upload-sweep` (daily): deletes objects under `uploads/` older than 2 days that no row references.
- `inactive-accounts` (daily): accounts that haven't opened the app (`GET /me`) for 24 months minus 30 days get one `ACCOUNT_DELETION` push; accounts inactive for 24 months whose warning is at least 30 days old are deleted like `DELETE /me` (uploads, RevenueCat customer, all rows). Accounts with a running subscription are skipped. Opening the app again cancels the warning.
- `notification-retention` (daily): deletes in-app notifications older than 180 days.
With `JOBS_IN_PROCESS=true` (default; local docker and tests) the same jobs also run in-process: the hourly ones at minute 0 (`dropzone.jobs.hourly-cron`), the daily ones at 03:30 UTC (`dropzone.jobs.daily-cron`). Cloud Run sets `JOBS_IN_PROCESS=false` and uses Cloud Scheduler.

## Data retention
- Inactive accounts: deleted after 24 months without opening the app, after a push warning 30 days before (job `inactive-accounts`). Existing accounts count from the day this rule shipped.
- In-app notifications: kept 180 days (job `notification-retention`).
- Unreferenced uploads: deleted after 2 days (job `upload-sweep`); replaced or deleted photos go at once.

## Rules
- Trial: every new account gets `trialEndsAt` = end of onboarding + 7 days once (no card, no store trial); before onboarding it is null and `POST /onboarding` accepts the PRO choices. Accounts created before this rule keep their sign-up trial. A deleted account that signs up again is a new account and gets a trial again. `pro` = active subscription OR trial not ended. Billing refresh / webhooks never touch the trial.
- Subscription lifecycle: `pro` = subscription active, or within 6 h after `proExpiresAt` while `willRenew` (renewal in flight; no leeway after a cancellation, refund or expiry). Billing issue: PRO until the Play grace end (`proExpiresAt` moves to it), `billingIssue: true`, in-app + push `BILLING_ISSUE` once; the banner links to `https://play.google.com/store/account/subscriptions?sku=<proProductId before ":">&package=com.dropzone.app`. Account hold (store still renewing, billing issue, access expired, within 60 days of the expiry): `pro` false, `billingHold` true, in-app + push `BILLING_ISSUE` "PRO is on hold" with the Play link instead of `PRO_ENDED`; the payment fix arrives as a renewal and brings PRO back (`PRO_BACK`). Expiry or refund: in-app + push `PRO_ENDED` once, `proEndPending` until acknowledged. Purchase after that: in-app + push `PRO_BACK`. Trial end (never subscribed): in-app + push `TRIAL_ENDED` from the hourly job, `trialEndPending` until acknowledged.
- Downgrade (trial or subscription ended): PRO settings stay stored and come back on re-subscribe, but are not applied: `/today` only schedules free catalog quests (if none are active, the path's free quests are added and removed again when PRO comes back, unless the user picked or edited them in the meantime), completing other quests → 402, `lockedApps` in User only lists Instagram, `unlockMode` reads WHOLE_DAY, COMMUNITY milestones read and clear as AI until PRO is back. Every post of the user (all feed types), their proofs, their "also chasing" row and their leaderboard row are hidden from everyone else until they resubscribe (the user still sees their own).
- PRO ending mid-day: a day that was cleared while the user was PRO stays cleared (stored result, streak) and today stays unlocked until local midnight; free quests added because PRO ended start tomorrow. A day cleared without PRO follows schedule changes at once.
- Free: 3 free quests of the chosen path, Instagram lock only, WHOLE_DAY unlock, private goal, AI verification only, no social/feed/leaderboard/stats/slip-ups/custom quests (incoming friend requests can be listed, not accepted).
- Streak: a day counts when all scheduled quests are DONE. By default a day with nothing scheduled (no quest on that weekday, or a stored 0/0 day) breaks the streak; with `skipRestDays: true` such days are skipped (they neither count nor break it), a missed scheduled day still breaks it. Quests can be logged only for yesterday, today or tomorrow.
- Unlock: WHOLE_DAY → unlocked until local midnight when all quest slots are DONE or PENDING (a Friends-check proof waiting for verifies counts; a day with no scheduled quests is unlocked all day); MINUTES → `minutesPerQuest` per DONE or PENDING quest. The streak and `doneCount` count DONE only. A day that is over is never reported as unlocked. The 18:00 daily reminder also treats PENDING slots as done.
- AI check: the server decides `aiChecked` (stored on the proof) from the `mlLabels` / `mlText` the app sends; only `aiChecked` proofs say "AI verified" / show the AI chip, others say "Photo proof". Photo quests need one label from the quest's list (case-insensitive, `rules/AiCheck`): meals (HEALTHY_MEAL, PROTEIN_MEAL, EXTRA_MEAL) Food, Dish, Cuisine, Meal, Vegetable, Fruit, Salad, Recipe, Breakfast, Lunch, Dinner, Produce, Baked goods, Meat, Fast food, …; GYM Gym, Exercise, Muscle, Physical fitness, Weight training, Sports equipment, …; BIKE, HIKE, SWIM, SPORTS, MOBILITY, MOVIE_NIGHT, HANGOUT have their own lists; NEW_HOBBY and custom quests are never AI-checked. Weigh-ins and WEIGHT milestones pass when the OCR text holds a scale reading (a number from 20 to 800) or a label is scale-like (Weighing scale, Scale, Bathroom scale, Measuring instrument, Gauge); STRENGTH milestones use the gym list, SIZE milestones tape/body labels (Tape measure, Measuring tape, Ruler, Waist, …). A proof without a photo is never AI-checked. Numbers stay freely editable: no tolerance check. Proofs stored before this rule read `aiChecked: false` and their "AI verified" summaries became "Photo proof".
- Milestone visibility: PRIVATE (only me; AI check only), FRIENDS (friends see the posts and may verify), EVERYONE (public posts, any PRO user may verify). FRIENDS and EVERYONE are PRO. Existing milestones were migrated: public → EVERYONE, private with COMMUNITY verification → FRIENDS, the rest → PRIVATE.
- Free quest codes: LOSE `WEIGH_IN`, `HEALTHY_MEAL`, `STEPS`; GAIN `WEIGH_IN`, `PROTEIN_MEAL`, `GYM`.

## Quest catalog (seed)
`multiSlot` (may repeat during the day, `perDay` > 1): HEALTHY_MEAL, PROTEIN_MEAL, EXTRA_MEAL.
Catalog rule: catalog fields (name, icon, group, proof, auto source, default target) are copied into `user_quests` when a user picks a quest, and nothing re-syncs them later. Every catalog change therefore ships a Flyway migration that updates `quest_types` and the matching active user quests (`update user_quests set … where quest_type_id = … and active and not custom`), leaving values the user chose (days, perDay, own target) alone.

| path | code | name | icon | group | proof | free | auto/target |
|---|---|---|---|---|---|---|---|
| LOSE | WEIGH_IN | Weigh-in | scale | BURN_FUEL | PHOTO | yes | |
| LOSE | HEALTHY_MEAL | Healthy meal | meal | BURN_FUEL | PHOTO | yes | |
| LOSE | STEPS | Steps | steps | BURN_FUEL | AUTO | yes | STEPS 8000 |
| LOSE | CAMERA_REPS | Camera reps | reps | BURN_FUEL | REPS | | 20 |
| LOSE | GYM | Gym | gym | BURN_FUEL | PHOTO | | |
| LOSE | BIKE | Bike ride | bike | BURN_FUEL | PHOTO | | |
| LOSE | HIKE | Hike | hike | BURN_FUEL | PHOTO | | |
| LOSE | SPORTS | Sports | ball | BURN_FUEL | PHOTO | | |
| LOSE | SWIM | Swim | swim | BURN_FUEL | PHOTO | | |
| LOSE | NEW_HOBBY | New hobby | palette | BEAT_BINGE | PHOTO | | |
| LOSE | MOVIE_NIGHT | Movie night | film | BEAT_BINGE | PHOTO | | |
| LOSE | HANGOUT | Hangout | users | BEAT_BINGE | PHOTO | | |
| GAIN | WEIGH_IN | Weigh-in | scale | BUILD_FUEL | PHOTO | yes | |
| GAIN | PROTEIN_MEAL | Protein meal | protein | BUILD_FUEL | PHOTO | yes | |
| GAIN | GYM | Gym session | gym | BUILD_FUEL | PHOTO | yes | |
| GAIN | EXTRA_MEAL | Extra meal | meal | BUILD_FUEL | PHOTO | | |
| GAIN | BEAT_A_LIFT | Beat a lift | trend | BUILD_FUEL | LOG | | |
| GAIN | CAMERA_REPS | Camera reps | reps | BUILD_FUEL | REPS | | 20 |
| GAIN | WATER | Water 3 L | drop | BUILD_FUEL | CHECKIN | | |
| GAIN | STEPS | Steps | steps | BUILD_FUEL | AUTO | | STEPS 8000 |
| GAIN | SPORTS | Sports | ball | BUILD_FUEL | PHOTO | | |
| GAIN | SLEEP | Sleep 8 h | moon | RECOVERY | AUTO | | SLEEP 480 |
| GAIN | MOBILITY | Mobility | yoga | RECOVERY | PHOTO | | |
| GAIN | REST_WALK | Rest-day walk | hike | RECOVERY | AUTO | | STEPS 4000 |

## Slip-up types (seed)
LATE_SNACK "Late snack" moon · SUGARY_DRINK "Sugary drink" cup · FAST_FOOD "Fast food" burger · ALCOHOL "Alcohol" wine · TAKEAWAY "Takeaway" bag · SWEETS "Sweets binge" candy · DOOM_SCROLL "Doom-scrolling" phone

## Config (env vars)
`DB_URL`, `DB_USER`, `DB_PASSWORD`, `DB_POOL_SIZE` (Hikari max pool, default 5), `JWT_SECRET` (required, no default, at least 32 bytes), `GOOGLE_CLIENT_IDS` (comma separated; web + android client ids),
`GCS_BUCKET`, `GCS_ENDPOINT` (local emulator), `GCS_PUBLIC_BASE_URL`, `FIREBASE_CREDENTIALS` (path to service account json for FCM, or `adc`; push is only logged (type + user id) when empty),
`REVENUECAT_WEBHOOK_SECRET` (no default; webhooks get 401 until set), `REVENUECAT_API_KEY` (secret key for REST), `DEV_LOGIN` (default false; true only in docker-compose),
`ADMIN_EMAILS` (comma separated emails that can review reports), `MIN_REPORTER_AGE` (default `3d`: reports from younger accounts don't count toward auto-hide), `IMAGE_CHECK` (default `true`: Cloud Vision SafeSearch on photos that become public), `UNSPLASH_ACCESS_KEY` (photo search off when empty), `CORS_ORIGINS`,
`TERMS_VERSION` / `PRIVACY_VERSION` (default `1`), `TERMS_URL` / `PRIVACY_URL` / `DELETE_ACCOUNT_URL` (default empty), `MIN_VERSION_CODE` (default 1),
`JOBS_IN_PROCESS` (default `true`: run the jobs in-process on a schedule; Cloud Run sets `false`), `JOBS_AUDIENCE` (OIDC audience Cloud Scheduler puts in its token, e.g. the service URL + `/internal/jobs`; job endpoints answer 403 while empty), `JOBS_INVOKER` (e-mail of the Cloud Scheduler service account; 403 while empty).

Photo signing: with `GCS_ENDPOINT` empty the backend signs photo links (V4) with the runtime service account through the IAM Credentials `signBlob` API (application default credentials on Cloud Run): the account needs `roles/iam.serviceAccountTokenCreator` on itself and the IAM Credentials API must be on. When signing fails (e.g. the IAM role is still missing) the plain link is returned, signing pauses for a minute and a warning is logged at most every 5 minutes. Signed links are cached per instance for the hour (at most 20,000).

Image check: Cloud Vision `images:annotate` (SAFE_SEARCH_DETECTION) is called over REST with the application default credentials (Cloud Run: the runtime service account; scope cloud-vision); the Vision API must be enabled in the project. The photo bytes are read from the bucket with the storage client (photos over 4 MB are scaled to 1600 px first), so it works with a private bucket. Timeouts 3 s connect / 8 s read; without credentials the check is skipped (published, warning) and the credentials are retried after 5 minutes.

Profile `prod` (`SPRING_PROFILES_ACTIVE=prod`): JSON console logs with a `severity` field, CORS default `https://localhost` only, no storage defaults. Startup fails when `DEV_LOGIN` is on, `JWT_SECRET` or `REVENUECAT_WEBHOOK_SECRET` is blank or the dev value, `GCS_ENDPOINT` is set, `GCS_BUCKET`/`GCS_PUBLIC_BASE_URL` is missing, `GCS_PUBLIC_BASE_URL` isn't `https://storage.googleapis.com/<GCS_BUCKET>` (where signed links point), the storage URL, `DB_URL` or a CORS origin (other than `https://localhost`) points to localhost, `JOBS_AUDIENCE` or `JOBS_INVOKER` is empty, or Firebase messaging is not configured or fails to start.

Database: user search uses B-tree indexes on `lower(handle) text_pattern_ops` (prefix) and `lower(display_name)` (exact name) (migration V81); the older `pg_trgm` GIN indexes (migration V62) stay. The migration creates the extension only when the server offers it and the migration user may create it (Cloud SQL: a `cloudsqlsuperuser` member can); otherwise it skips the extension and the indexes with a notice and search still works without them. Check with `select * from pg_extension where extname = 'pg_trgm'`.
