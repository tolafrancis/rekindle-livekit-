# Mobile app — build status

**Target:** ship `apps/ministry` (then `apps/rekindle`) as native apps via Capacitor.
**Approach & rationale:** see `docs/mobile-app-build-plan.md`.
**Branch:** `feat/capacitor-ministry` (not merged — `main` stays web-deployable).
**Scope so far:** Android only. iOS is untouched (needs macOS — see below).
**Last updated:** 2026-07-21

---

## Snapshot

| Phase | What | Status |
| --- | --- | --- |
| 0 | Decisions & accounts | ✅ **Done** (code); accounts outstanding |
| 1 | Capacitor scaffold (Android) | ✅ **Done & verified on-device** — both apps |
| 2 | LiveKit media permissions | ✅ **Done & verified on-device** — livestream + screen share tested working, both apps |
| — | Navigation / hardware back button | ✅ **Done & verified on-device** — Ministry, ReKindle, and nested Ministry-in-ReKindle flows all step back correctly instead of exiting the app |
| — | Mobile UI fixes (header overflow, search overlay, modal stacking) | ✅ **Done & verified on-device** — both apps |
| 3 | Auth & deep links | ⏸ **Paused** — code-side manifest work done for both apps; blocked on canonical domain + assetlinks.json hosting decision from project owner |
| 4 | Push notifications (rewrite) | ⏸ **Code done, blocked on owner** — needs google-services.json for both apps |
| 5 | Billing | ⏸ **Deferred** (no IAP in v1) |
| 6 | Store compliance | ⬜ Not started |
| 7 | Release pipeline | ⬜ Not started |

---

## ✅ Done

### Phase 0 — Decisions (commit `deb22f5`)
- **No in-app purchase in v1.** Free tier is fully usable, so the apps sidestep Apple guideline 3.1.1. Subscriptions stay on the web. Phase 5 is off the critical path.
- **Two listings:** `com.rekindlebc.app` (ReKindle), `com.rekindlebc.ministry`.
- **Ministry ships first** (smaller surface, already auto-deploys).

### Phase 1 — Capacitor scaffold (both apps)
- Ministry: `@capacitor/core` + `cli` + `android`; `apps/ministry/capacitor.config.ts` (appId, `webDir: dist`, mixed-content off).
- ReKindle: same scaffold added, appId `com.rekindlebc.app`.
- Both native Android projects committed under `apps/*/android/`. Build artifacts and keystores git-ignored.
- Fixed `gradlew` executable permissions issue (platform artifact from original scaffold machine).
- **Phase 0 mandate implemented:** billing UI hidden natively via `Capacitor.isNativePlatform()` checks.
- **Verified on real device (both apps):** app installs via `npx cap run android`, launches, shows correct UI, no billing UI visible.

### Phase 2 — Media permissions (both apps)
- Android manifest: `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `ACCESS_NETWORK_STATE`, `FOREGROUND_SERVICE(+CAMERA/MICROPHONE)`, `WAKE_LOCK`, `POST_NOTIFICATIONS`; camera/mic as `uses-feature required=false`.
- `capacitor.config.ts`: `androidScheme`/`iosScheme` pinned to `https` on both apps.
- **Verified on real device (both apps):** livestream broadcast and screen sharing tested working.

### Navigation — Android hardware back button (both apps)
Android's hardware back button doesn't natively integrate with SPA view-state the way browser back does — this required dedicated work across both apps:
- `@capacitor/app` backButton listener wired in both apps' `main.tsx`.
- **ReKindle** (`AppLayout.tsx`): tab navigation (`activeTab`) now pushes real browser history entries via a `navigateTab` wrapper, coordinated with React Router's own URL-sync effect to avoid state clobbering.
- **Ministry** (`MinistrySpace.tsx`, shared package): same treatment for tab/subtab navigation, plus a dedicated fix for the modal "Back to Rekindle" exit action, which previously used pure component state with no history entry.
- **Shared reusable hook** (`packages/features/src/hooks/useViewHistory.ts`): built after the pattern repeated across multiple components (`LiveChannels.tsx`, `MLiveChannel.tsx`) — encapsulates push/pop history syncing with a state-merge strategy so nested view-history owners (e.g. a live-channel viewer nested inside Ministry Space, nested inside the ReKindle app shell) compose correctly without clobbering each other's history state.
- **Known-fixed regression:** a temporal-dead-zone crash (`ReferenceError: Cannot access before initialization`) from a state variable used before its declaration — fixed and verified.
- Modal/dialog stacking also fixed: a shared `modal-stack.ts` util in `packages/ui` lets the back button close the topmost open dialog instead of exiting the app, applied at the shared `Dialog` component level so it covers all ~200 dialog usages app-wide.

### Phase 4 — Push notifications (code complete, blocked on Firebase config)
- Installed `@capacitor-firebase/messaging` in both apps.
- `packages/features/src/usePushNotifications.ts`: added native branches to registerPush, unregisterPush, checkPushPermission, isPushSubscribed — all gated behind `Capacitor.isNativePlatform()`, existing web code paths completely unchanged. Native tokens are written to the same `push_tokens` table with `platform: 'android'`/`'ios'` (web already writes `'web'`), respecting the existing `device_token` unique constraint.
- Foreground notification handling: since native foreground pushes don't auto-display (unlike web, which the browser handles), wired a CustomEvent bridge — `main.tsx` listens for the plugin's `notificationReceived` event and dispatches a DOM CustomEvent, which `App.tsx` catches and shows via the app's existing toast system. Notification taps (`notificationActionPerformed`) navigate via `notification.link` if present.
- Android Gradle config for Google Services was **already present** in both apps' scaffolded `build.gradle` files (Capacitor's default template) — conditionally applies the `com.google.gms.google-services` plugin only if `google-services.json` exists, so no manual Gradle edits were needed.
- Both apps build clean with these changes.

**Blocked on:** `google-services.json` for both `com.rekindlebc.app` and `com.rekindlebc.ministry`, from whichever Firebase project the existing web push setup uses (or a new one) — needed from the project owner. Once dropped into `apps/rekindle/android/app/` and `apps/ministry/android/app/` respectively, the feature should be fully functional; the edge function `send-push-notification` still needs the `notification` block addition called out in the original plan for native background display, which hasn't been touched yet.

### Mobile UI fixes (ReKindle)
- Landing page header: mobile hamburger menu added (previously overflowed/wrapped on narrow screens).
- In-app header (`AppLayout.tsx`): overflow icon row (Search/Bell/Music/Live/Account/Logout) reduced to Search + Bell + Account on mobile, rest moved into the existing Account dropdown.
- `GlobalSearch` overlay: fixed a Tailwind `z-60`/`z-70` bug (invalid arbitrary values silently produced `z-index: auto`, letting the header render on top of the search backdrop) — corrected to `z-[60]`/`z-[70]`. Also fixed the overlay not auto-closing on tab navigation, and made Search/Notifications/Account mutually exclusive so they can't visually overlap.

---

## ⬜ Remaining work

### Phase 3 — Auth & deep links (scope reduced)
**Status: paused, blocked on owner.** Android manifest intent-filters are already added to both apps (app.rekindlebc.com, https scheme) but inert until:
1. Canonical domain is confirmed and DNS/hosting is set up
2. A assetlinks.json file is hosted at https://[domain]/.well-known/assetlinks.json (needs the Android signing key SHA-256 fingerprint for both app IDs — ready to generate once domain is confirmed)
3. Product decision needed: since /channels/:id, /ministry/:id/meeting/:id, and /channel/:id/meeting/:id exist as routes in BOTH apps sharing one domain, a shared link will show an app-chooser dialog unless one app is designated to own those specific paths — needs an answer from the project owner.

App uses **email + password only** — no OAuth or magic-link sign-in currently — so the Supabase Auth redirect-URL/custom-scheme risk called out in the original plan **does not apply** in its full form. What's still needed:
- Guest deep links: `/channels/:id`, `/ministry/:id/meeting/:id`, `/channel/:id/meeting/:id`, `/join/:slug`, `/kiosk/:slug` — these should open directly in-app rather than falling back to a browser.
- ⚠️ **White-label limit still applies:** association files are per-domain, so arbitrary tenant custom domains can't deep-link — route through one canonical domain (proposed `app.rekindlebc.com`).
- If OAuth/magic-link sign-in is added later, this phase's original full scope (custom scheme + Universal/App Links registered with Supabase) will need to be revisited.

### Phase 4 — Push notifications (a rewrite, highest-risk)
- Current push is **web push** (`firebase-messaging-sw.js` + VAPID) — no native equivalent. Swap to `@capacitor/firebase-messaging`.
- Android `google-services.json`; iOS **APNs auth key** + `GoogleService-Info.plist` + Push capability.
- `push_tokens` survives (set `platform` to `android`/`ios`); `send-push-notification` mostly survives but its **data-only** payload needs a `notification` block for native background display — must not double-fire web push (this project has shipped a duplicate-notification bug before).

### Phase 6 — Store compliance
- Icons/splash (`@capacitor/assets`), screenshots, Play **Data safety** + Apple privacy labels (declare camera/mic/push).
- ⚠️ **In-app account deletion — does not exist today.** Apple mandates it: a build item before iOS submission.

### Phase 7 — Release pipeline
- Android keystore + Play App Signing; iOS certs/provisioning.
- Internal testing (Play) / TestFlight first. Consider Capacitor live updates for JS-only fixes.

---

## 🚧 Blockers / owner actions

| Blocker | Needed for | Notes |
| --- | --- | --- |
| **No Mac** | *all* iOS work (scaffold, Info.plist, build) | `cap add ios` + Xcode are macOS-only; or use a cloud-Mac CI |
| **Apple Developer account** ($99/yr) | iOS signing/submission | long pole — approval can take days |
| **Google Play account** ($25) | Play submission | one-off |
| **In-app account deletion** | iOS submission (Phase 6) | must be built |
| Confirm canonical deep-link domain | Phase 3 | proposed `app.rekindlebc.com` |
| **Regional login issue (Nigeria)** | Live users | Users report needing a VPN to log in from Nigeria — points to ISP-level IP blocking of Supabase's AWS ranges, or a Cloudflare/WAF country rule, rather than app code. Flagged separately for backend investigation. |

---

## Guardrail (unchanged)

The wrap is additive — Capacitor consumes the same `dist/`, so web deploys are unaffected. Native work stays on this branch, `main` stays deployable, and native behaviour is gated behind `isNativeApp()`/`Capacitor.isNativePlatform()` rather than replacing web paths.
