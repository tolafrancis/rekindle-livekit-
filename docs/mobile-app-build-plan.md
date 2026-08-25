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

## ✅ Phase 0 — Decisions & accounts — **RESOLVED 2026-07-19**

### Billing: **no in-app purchase at first**

The apps ship with **no purchase UI**. The free tier (`subscription_tier: 'free'`) is fully usable, so each app stands alone and sidesteps Apple guideline **3.1.1** entirely. Subscriptions continue to be bought on the web via Stripe. **Phase 5 is deferred off the critical path** — revisit IAP once the apps are live and conversion data justifies it.

Context that made this viable:
- Consumer (`SubscriptionManager.tsx`) sells *individual* tiers (premium / premium_plus / family) — digital content, squarely inside the IAP rule.
- Ministry (`BillingSettings.tsx` → `ministry-checkout` → Stripe) sells *organisation* plans — B2B, far more defensible off-platform.

**Build items this creates (do NOT skip):**
- **Hide all purchase UI in native builds.** Gate `SubscriptionManager` and `BillingSettings` (and any "Upgrade" CTA, e.g. the ministry-tier upgrade banner in `MinistrySpace`) behind `!Capacitor.isNativePlatform()`. A visible Stripe paywall is the rejection risk.
- **Respect anti-steering:** do not link out to web checkout from inside the app.
- Keep `entitlements.caps` as the single source of truth — a user who subscribed on web must see their entitlements in the app.

### Listings: **two**
Separate listings, matching the two codebases/audiences:

| App | Source | Bundle ID (proposed) |
| --- | --- | --- |
| ReKindle | `apps/rekindle` | `com.rekindlebc.app` |
| Rekindle | `apps/ministry` | `com.rekindlebc.ministry` |

### Ship order: **Ministry first**
Smaller surface, fewer paid features, already auto-deploys from `main` — a lower-stakes way to prove the two risky phases (LiveKit media, push rewrite) before touching the consumer app.

### Still outstanding in Phase 0 (owner action)
- [ ] **Apple Developer account** ($99/yr — allow days for approval; this is the long pole)
- [ ] **Google Play account** ($25 one-off)
- [ ] Confirm bundle IDs above
- [ ] **Canonical deep-link domain** — proposed `app.rekindlebc.com`. Tenant white-label domains stay web-only (see Phase 3).

### Carried forward as a build item
- [ ] **In-app account deletion** — Apple-mandated and **does not exist today** (verified: "delete account" appears only as prose in `PrivacyPolicy.tsx` / `TermsOfService.tsx`). Needed before iOS submission.

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

## Phase 5 — Billing — **DEFERRED** (Phase 0 decision)

Not on the critical path: the apps ship with no purchase UI. The only billing work in v1 is **hiding** the purchase surfaces natively (see Phase 0 build items).

If IAP is added later: keep **`entitlements.caps`** as the single source of truth so IAP, Play Billing and Stripe all resolve to the same entitlement flags — no parallel gating logic.

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

| Phase | Effort | Risk | Status |
| --- | --- | --- | --- |
| 0 Decisions | low | — | ✅ **resolved** (accounts outstanding) |
| 1 Scaffold | low | low | next |
| 2 LiveKit media | medium | **high** — WebRTC in WebView | |
| 3 Auth + deep links | medium | medium — white-label domains don't deep-link | |
| 4 Push rewrite | medium | **high** — full replacement of the web-push path | |
| 5 Billing | — | — | ⏸ deferred (no IAP in v1) |
| 6 Compliance | medium | medium — account deletion is a build item | |
| 7 Pipeline | medium | low | |

**With billing deferred, the critical path is Phases 1 → 4, then 6 → 7. Things actually break in Phase 2 and Phase 4.**

---

## Guardrail: keeping the web app safe

The wrap is additive — Capacitor consumes the existing `dist/`, so web hosting is untouched. The four places native work *can* reach the web:

1. **`sw.js`** — guard registration behind `isNativePlatform()` (web keeps its offline cache).
2. **Push payload** — adding a native `notification` block must not double-fire web push (this project has already shipped a duplicate-notification bug). Branch on `push_tokens.platform`.
3. **Supabase Auth redirect URLs** — shared config; a bad edit breaks web sign-in too.
4. **Shared packages** (`packages/live`, `features`, `ui`) — consumed by both apps.

**Rule:** do native work on a branch, keep `main` deployable, and gate native behaviour behind `Capacitor.isNativePlatform()` rather than replacing web paths.

---

## Open questions
1. ~~IAP vs web-only purchases~~ → **resolved: no IAP in v1**
2. ~~One listing or two~~ → **resolved: two**
3. Canonical deep-link domain — proposed `app.rekindlebc.com`, pending confirmation.
4. Is the kiosk mode (`MinistryKiosk`, `/kiosk/:slug`) intended as a native tablet experience? If so it deserves screen-wake / lock-task treatment.
