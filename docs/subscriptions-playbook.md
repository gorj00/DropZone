# Android subscriptions playbook

How a Google Play subscription app should behave in every subscription state, worked out and tested on DropZone (October 2026). Stack: Google Play Billing through the RevenueCat SDK, our own backend as the source of truth for the app, one entitlement (`pro`) and several plans that differ only in billing period.

## 1. Architecture

- **One user id everywhere:** the RevenueCat `appUserID` is the backend user id. Configure the SDK with it after sign-in, call `logIn` when the account changes and `logOut` on sign-out.
- **The backend decides what the app shows.** The app never trusts its own SDK state for access, only for "the purchase went through".
- **REST is the truth, webhooks are triggers.** On every RevenueCat webhook event the backend re-reads the subscriber from the RevenueCat REST API (v1, secret key) and stores that state. It uses the event payload only when REST is down, and only if the event isn't older than the last applied one.
  - Process each event id once (store them).
  - `TRANSFER` refreshes both sides.
- **Refresh paths on the app side:**
  - **Every app start:** `POST /billing/refresh`, subscribers included. This is the only reliable way to notice lifetime grants, promo codes or changes made outside the app, because RevenueCat may not send a webhook for those.
  - **After a purchase:** refresh, then a retry loop (0, 2, 5, 10 s) until the backend confirms.
  - **Around the expiry:** the session reloads `/me` shortly after `proExpiresAt`. The backend also re-asks RevenueCat on `/me` when the expiry is within an hour or up to 7 days past, at most every 10 minutes.
  - **Daily reconcile job:** refreshes users whose expiry is within the next day or the last 3 days.
- **Renewal leeway:** keep PRO for 6 h after `proExpiresAt` while the subscription renews, because a renewal can arrive late. Give no leeway after a cancellation, refund or expiry.
- **User fields the app needs:**
  - `pro`, `trial`, `proExpiresAt`, `willRenew`
  - `proProductId`: the part before `:` is the Play subscription id.
  - `billingIssue`, `billingHold`, `proEndPending`
  - `pendingPlanId`, `pendingPlanAt`

## 2. Play Console setup

- **One subscription per period** (`pro_weekly`, `pro_monthly`, `pro_yearly`), each with one auto-renewing base plan. Use RevenueCat ids `pro_x:base` attached to the `pro` entitlement and the default offering.
- **Grace periods:** weekly 3 days, monthly 7, yearly 14. Account hold "Calculate automatically" (grace plus hold up to 60 days).
- **Resubscribe:** Allow.
- **Customer base plan changes:** the console default ("Charge at next billing date"). The app overrides it per switch (see 5).
- **Pause: Disabled** (Monetization setup → Subscription settings). It's on by default. Turn it off unless the app handles paused states.
- **Real-time developer notifications:** the Pub/Sub topic RevenueCat creates, with all notification types.
- **License testers:** set them in Play Console and upload a build to a testing track once. Test purchases then work, even in a sideloaded debug build with the same package name.

## 3. Buying

| Case | Behavior |
|---|---|
| Purchase succeeds | Full-screen loader "Confirming with Google Play…" from tap until the backend confirms. Then "Welcome to PRO" and close. |
| Backend still says Free after a confirmed purchase | Trust the SDK (`entitlements.active.pro`): show success and keep syncing in the background. |
| User closes the Play sheet | Nothing happens, no message. |
| Pending payment (slow card / cash) | "Purchase received. PRO turns on as soon as Google Play confirms it." Keep the sync loop. |
| Already subscribed (`PRODUCT_ALREADY_PURCHASED`) | Refresh from the backend. If subscribed, it's done. Otherwise say the subscription belongs to another account. |
| Purchase belongs to another app account (`RECEIPT_ALREADY_IN_USE` etc.) | "This subscription belongs to another account. Sign in with that account to use it." (transfer behavior: keep with original App User ID) |
| Declined payment (`PURCHASE_NOT_ALLOWED`, code 3) | "The payment didn't go through. Check your payment method in Google Play and try again." Never show the SDK's generic "not allowed" text. |
| Prices fail to load (offline) | "Couldn't load prices · Retry", and the buy button is disabled. No fallback prices in the native app. |
| Purchase acknowledgement | RevenueCat acknowledges it. Unacknowledged purchases are refunded by Google after 3 days. |

## 4. Trial

- An app-managed trial (no store trial, no card) starts once per account, at the end of onboarding.
- **Buying uses up the trial.** Once a user has ever subscribed, the trial is never active again, even if the original trial window hasn't run out when the subscription ends. Rule: `trialActive = trialEndsAt > now && !hasEverSubscribed`.
- Reminders: "trial ending" within 2 days of the end, and "trial ended" once afterwards (push plus in-app). The trial-ended screen offers "See plans" or "Continue with Free".

## 5. Plan changes (tiers by billing period)

- **Order the plans** weekly < monthly < yearly. A switch to a longer plan is an "upgrade" and a switch to a shorter plan a "downgrade". Every pair works the same way, so test one of each direction by hand and all orderings in unit tests.
- **Longer plan: switch now.** Use `CHARGE_FULL_PRICE`: the full price of the new plan is charged today, and the unused time of the old plan is added on top.
  - Note before buying: "Switches now. Google Play charges <price> today and adds your unused <old> days on top."
  - `CHARGE_PRORATED_PRICE` doesn't fit: Google only allows it when the price per unit of time goes up, and longer plans are cheaper per month.
- **Shorter plan: switch at renewal.** Use `DEFERRED`.
  - Note before buying: "Switches when your <old> plan renews on <date>. You keep <old> until then."
  - After buying: "Your plan switches to <new> on <date>."
- **Always pass `oldProductIdentifier`** (the subscription id before `:`). Without it Google creates a second, parallel subscription.
- **Recording a scheduled switch:**
  - Google marks the old subscription as not renewing, so a scheduled switch looks exactly like a cancellation in RevenueCat ("Ends · Resubscribe").
  - The app therefore reports the switch to the backend (`POST /billing/pending-switch {productId}`). The backend stores the plan and the current expiry.
  - It drops the record when the product changes to that plan, or one day after the stored date passes without a switch.
  - It doesn't depend on `willRenew`.
- **While a switch is scheduled:**
  - The next plan gets a "NEXT" badge. Note: "Your plan switches to <new> on <date> when your <old> plan renews. To keep <old>, cancel the change in Google Play."
  - Plan tiles are disabled and there's no Switch button, only "You're PRO" and "Manage in Google Play". Google refuses a second change anyway ("We are unable to change your subscription plan").
  - Settings shows "Switches to <new> on <date>" instead of "Renews" or "Ends".
- **Google refuses changes** while a renewal is being processed (transient "PG-GEMF-02") and on a cancelled subscription. Retry away from the renewal moment.
- **Settings:** tapping the plan opens the in-app plan screen, never Google Play directly. The plan screen has "Manage in Google Play" and "Restore purchases" at the bottom.

## 6. Renewal problems

| State | What Google does | What the app shows |
|---|---|---|
| Grace period | Payment failed, access continues (3/7/14 days) | `pro: true`, `billingIssue: true`. Banner on Today and Settings: "Payment problem — fix it in Google Play to keep PRO", linking to the Play subscription page. Push and in-app notice once. |
| Account hold | Grace is over, still unpaid: access off, the subscription is **not** cancelled. It comes back by itself when the payment is fixed | `pro: false`, `billingHold: true`. Banner: "PRO is on hold — fix your payment in Google Play to get it back". The ended screen becomes "Your PRO is on hold" with "Fix payment in Google Play" instead of "See plans". The notice is "PRO is on hold" (not "subscription ended"), with the Play link. |
| Recovered | The payment goes through, and the same subscription continues | "Welcome back to PRO", and the hold and banner clear. |
| Hold runs out | Google cancels | Same as an expiry (7). |

Detecting a hold from RevenueCat REST: the entitlement is present, the store still renews (no unsubscribe, not refunded), a billing issue has been detected, access has expired, and it's within 60 days of the expiry. RevenueCat may send `EXPIRATION` when the hold starts, so work it out from REST, not from the event type.

## 7. Cancel, expiry, resubscribe

- **Cancel in Google Play:** `willRenew: false`. Settings shows "Ends <date> · Resubscribe" and PRO stays until the end. It takes seconds to a minute to arrive (Google → RevenueCat → webhook → app refresh). That delay is normal and can't be removed.
- **Un-cancel ("Resubscribe" in Google Play) before the end:** back to "Renews <date>".
- **Expiry:** a one-time "Your PRO subscription ended" screen (shown by the route guard on the next navigation or app start). It has "See plans" and "Continue with Free", and "Continue with Free" acknowledges it.
  - The push and in-app notice link to that screen, not straight to the plans.
- **Downgrade effects:** PRO settings stay stored but aren't applied. Shared content is hidden from others until the user resubscribes. Free fallbacks are added and removed again when PRO comes back.
- **Resubscribe after the end:** "Welcome back to PRO", and everything PRO comes back.
- **Refund, revoke or chargeback** (Play Console Order management, or the bank): access ends immediately with no leeway, plus the ended screen and notice.

## 8. Lifetime / promotional access

- **Grant:** RevenueCat → customer → Entitlements → Grant → `pro` → Lifetime. **Revoke** is on the same page.
- **RevenueCat quirk:** a "lifetime" grant is stored with a date about 200 years out (for example 2226) and product `rc_promo_<entitlement>_lifetime`. Recognize lifetime by `rc_promo` + `_lifetime` and treat it as having no end date and no renewal. Settings shows "DropZone PRO · Active".
- **Existing Play subscription:** a grant doesn't stop Google billing. On first detecting a lifetime grant, the backend cancels every renewing Play subscription of that user through RevenueCat (`POST /v1/subscribers/{id}/subscriptions/{store_transaction_id}/cancel`, no refund).
  - It then sends a one-time push plus in-app message: "You've got PRO for life! We cancelled your Google Play subscription, so you won't be charged again."
  - Users without a subscription get "You've got PRO for life! Every PRO feature is yours, for good."
  - If a cancel fails: send nothing, release the claim and retry at the next check. Mark "noticed" only after success, and clear the mark if the grant is revoked.
- **Detection:** the backend sees grants through the app-start refresh. That's why the start check must also run for users who already have PRO. Push banners don't show while the app is open, so most users see the in-app message.
- RevenueCat shows test purchases only with **Sandbox data** switched on in the dashboard.

## 9. Other

- **Restore purchases:** a safety net Google expects. It says "PRO restored" or "No subscription found on this Google Play account". With backend sync it rarely matters, so it's covered by unit tests only.
- **Promo codes (Play Console → Promo codes):** redeemed in the Play Store. The app picks them up at the next start through the start check.
- **Account deletion while subscribed:** warn "Deleting your account does not cancel a Google Play subscription", link to Google Play, and delete the RevenueCat customer.
- **Price changes:** Google emails the user. The app shows nothing yet (open item).
- **Pause:** disabled in Play Console. If it's ever enabled, handle `SUBSCRIPTION_PAUSED` like a hold that the user chose.

## 10. Testing

- **License tester renewals:** weekly and monthly every 5 minutes, yearly every 30 minutes, at most 6 renewals.
- **Test cards:**
  - "always approves", "always declines", "approves, then charges back" (to Google this is a refund, so test 7 with it).
  - The slow cards may not be offered to every account.
  - The test card on an existing subscription can't always be changed.
- **Grace period and account hold by hand:** Google's **Play Billing Lab** app moves a test subscription into grace (about 5 min) or hold (about 10 min) and restores it.
- **Refund or revoke a test order:** Play Console → Manage account → **Order management** (account level, not per app) → order → Refund, tick revoke.
- **Don't switch plans at a renewal moment:** with 5-minute test renewals it's easy to collide with one, and you get a transient Google error.
- **A scheduled switch made before the backend could record it can't be re-scheduled.** Google refuses a second change. Wait for it to apply, or revoke the order and start again.
- **Automated tests to have:**
  - Backend: every lifecycle event, grace, hold and recovery, hold expiry, refund, transfer, the trial not returning after purchase, the scheduled switch (record, clear on change, clear after the date, kept while "not renewing"), a lifetime grant with and without a subscription, and a failed cancel retried.
  - App: switch ordering and replacement modes, the scheduled toast, the NEXT badge and block, the hold and payment banners, the ended and hold screens, the declined-payment message, the loader, the start check for subscribers, and the notification links.
