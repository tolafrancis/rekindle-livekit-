# Mobile app build plan — Play Store (APK/AAB) & App Store (iOS)

**Status:** planned, not started.
**Approach:** wrap the existing Vite + React SPAs with **Capacitor** (least disruption — the apps already build to a static `dist/`).
**Last updated:** 2026-07-18

---

## 1. Why Capacitor

Both apps are Vite SPAs that already produce a self-contained `dist/`:

| App | Source | Current hosting |
| --- | --- | --- |
| Consumer (ReKindle) | `apps/rekindle` | Hostinger, **manual** upload |
| Ministry | `apps/ministry` | Cloudflare Pages, **auto**-deploys from `main` |

Capacitor loads that same `dist/` inside a native shell, so routing, UI and Supabase calls work unchanged. What does **not** carry over is anything relying on a **service worker** or a **browser origin** — which is exactly where the real work is (push, auth redirects, deep links).

> Alternative for Android-only, fast: a **TWA** via Bubblewrap ships the existing PWA to Play in ~an hour. It does not solve iOS, and Apple rejects thin web wrappers — so it's a stopgap, not the plan.

---

## ⚠️ Phase 0 — Decisions & accounts (before any code)

### The blocking decision: Apple IAP vs Stripe

The app sells subscriptions through **Stripe** (`SubscriptionManager.tsx`, `create-billing-portal`, `cancel-subscription`, tier gating via `entitlements.caps.*`). Apple **guideline 3.1.1** requires in-app purchase for digital content. A Stripe paywall inside the iOS app is the single most likely rejection.

Options:
1. **Add IAP** for iOS (and Play Billing for Android) — most work, fully compliant.
2. **Ship read-only**: no purchase UI in-app; users subscribe on the web. Compliant, but hurts conversion.
3. **Android first** (Play is more lenient than Apple, though similar rules exist), defer iOS.

**Resolve this first — it can force a product rethink, and everything else is mechanical by comparison.**

### Other Phase 0 calls
- **Two listings or one?** Consumer + Ministry are separate apps → likely two listings, two bundle IDs (e.g. `com.rekindlebc.app`, `com.rekindlebc.ministry`).
- **Accounts:** Apple Developer ($99/yr, allow days for approval), Google Play ($25 one-off).
- **Ship order:** recommend **Ministry first** — smaller surface, fewer paid features, and it already auto-deploys.

---

## Phase 1 — Capacitor scaffold

```bash
npm i @capacitor/core @capacitor/cli
npx cap init            # per app; webDir: 'dist'
npx cap add android
npx cap add ios
npm run build && npx cap sync
```

Codebase-specific work:
- **Disable the offline service worker when native.** `apps/rekindle/public/sw.js` caches the app shell; in a native build the assets are already local, so it only reintroduces the stale-bundle class of bug this project has hit repeatedly. Guard its registration behind `Capacitor.isNativePlatform()`.
- `apps/rekindle/public/.htaccess` and `apps/ministry/public/_redirects` become irrelevant (no server routing).
- Keep `dist` as the single build output so `cap sync` stays trivial.

**Gate:** debug APK installs on a device; app loads; client-side routing works with no network.

---

## Phase 2 — Media permissions (LiveKit) ← highest risk

Live broadcasts and interactive meetings run on **LiveKit** (`packages/live`, `useDailyRoom.ts`, `LiveKitRoomWrapper.ts`, `VITE_LIVEKIT_URL=wss://livekit.rekindlebc.com`). WebRTC inside a WebView is where wrapper apps most often fail.

- **iOS** `Info.plist`: `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`.
- **Android** manifest: `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `FOREGROUND_SERVICE` (+ a foreground service if broadcasting should survive backgrounding).
- Re-verify the join-muted flow (`enableMediaAfterJoin` was removed in favour of joining muted) behaves the same natively.

**Gate on a real device, both platforms:** host a broadcast; join a meeting; camera toggles on the **first** tap; **guest** join works (anonymous `livekit-token` path).

---

## Phase 3 — Auth & deep links

- **Supabase auth:** register a custom scheme (`rekindle://`) and/or App Links / Universal Links in **Auth → Redirect URLs**, or OAuth + magic links break in the shell.
- **Deep links to wire:** `/channels/:id` (guest broadcast watch), `/ministry/:ministryId/meeting/:meetingId` and `/channel/:channelId/meeting/:meetingId` (guest meeting join), `/join/:slug`, `/kiosk/:slug`.
- Use `@capacitor/browser` for genuinely external links so they don't hijack the app WebView.

> ⚠️ **White-label collision.** Universal Links require an `apple-app-site-association` file per domain, and App Links a `assetlinks.json` per domain. Arbitrary tenant custom domains (see `docs/white-label-custom-domain-plan.md`) therefore **cannot** all deep-link into the app. Expect to route app deep links through one canonical domain, and treat custom domains as web-only.

**Gate:** sign-in completes and returns to the app; a shared channel/meeting link opens **in-app**, including for a logged-out guest.

---

## Phase 4 — Push notifications (a rewrite, not a port)

Today push is **web push**: `firebase-messaging-sw.js` + VAPID key + `usePushNotifications.ts`. **Service workers don't exist in the native shell**, so this must be replaced.

- Swap to `@capacitor/firebase-messaging`.
- Android: `google-services.json`. iOS: **APNs auth key** + `GoogleService-Info.plist` + Push Notifications capability.
- `push_tokens` survives — but write `platform` as `android`/`ios` instead of `web` (the table's unique constraint is on `device_token`, so re-homing works as-is).
- The `send-push-notification` edge function largely survives (FCM v1 sends to native tokens too), **but** it currently sends a **data-only** payload so `firebase-messaging-sw.js` can render it. Native needs a `notification` block to display while backgrounded — add it per-platform without breaking the web path.
- Re-test the flows already built: `channel_followers` on go-live (trigger `0159` + push), and `process-daily-reminders`.

**Gate:** channel-live and daily-reminder pushes arrive on both platforms, foreground and background, **exactly once** (this project has had a duplicate-notification bug before).

---

## Phase 5 — Billing

Implement the Phase 0 decision. Keep **`entitlements.caps`** as the single source of truth so IAP, Play Billing and Stripe all just resolve to the same entitlement flags — no parallel gating logic.

---

## Phase 6 — Store compliance

- Icons + splash via `@capacitor/assets` (source art exists: `apps/rekindle/public/favicon.png` 512×512, plus the generated `icon-192.png`).
- Screenshots per device class; store listing copy.
- Privacy policy — already served at `/privacy` (`PrivacyPolicyPage.tsx`); needs a public URL for both stores.
- Play **Data safety** form + Apple **privacy nutrition labels**: declare camera, microphone, contacts-free, push tokens, analytics.
- **In-app account deletion** — *Apple mandates this* and the app does not currently have it. Treat as a build item, not paperwork.
- Age rating; export-compliance (encryption) answers.

---

## Phase 7 — Release pipeline

- Android keystore + Play App Signing; iOS certificates/provisioning profiles.
- Ship to **internal testing** (Play) and **TestFlight** first.
- Version scheme: keep `versionCode`/`build` monotonic, independent of the web deploy.
- Consider **Capacitor live updates** for JS-only fixes — valuable here, since web fixes currently ship several times a day and store review would otherwise gate each one. (Note Apple's rules: live updates must not materially change app behaviour.)

---

## Effort & risk

| Phase | Effort | Risk |
| --- | --- | --- |
| 0 Decisions | low effort | **highest** — can force a product rethink |
| 1 Scaffold | low | low |
| 2 LiveKit media | medium | **high** — WebRTC in WebView |
| 3 Auth + deep links | medium | medium — white-label domains don't deep-link |
| 4 Push rewrite | medium | **high** — full replacement of the web-push path |
| 5 Billing | high (if IAP) | high |
| 6 Compliance | medium | medium — account deletion is a build item |
| 7 Pipeline | medium | low |

**Bulk of the work is Phases 1–4. Things actually break in Phase 2 and Phase 4. Phase 0 gates everything.**

---

## Open questions
1. IAP, web-only purchases, or Android-first? (blocks Phase 5, shapes Phase 0)
2. One listing or two (consumer + ministry)?
3. Which canonical domain owns app deep links, given white-label tenant domains?
4. Is the kiosk mode (`MinistryKiosk`, `/kiosk/:slug`) intended as a native tablet experience? If so it deserves its own screen-wake/lock-task treatment.
