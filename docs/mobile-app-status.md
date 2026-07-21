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
| 1 | Capacitor scaffold (Android) | ✅ **Code done** ·  device boot verified |
| 2 | LiveKit media permissions | ✅ **Code done** ·  device media test verified |
| 3 | Auth & deep links | ⬜ Not started |
| 4 | Push notifications (rewrite) | ⬜ Not started |
| 5 | Billing | ⏸ **Deferred** (no IAP in v1) |
| 6 | Store compliance | ⬜ Not started |
| 7 | Release pipeline | ⬜ Not started |

> "Code done · unverified" means the code is committed and both apps build, but
> it has **not** been run on a real device yet — that requires a local Android
> toolchain that isn't installed on this machine (see Blockers).

---

## ✅ Done

### Phase 0 — Decisions (commit `deb22f5`)
- **No in-app purchase in v1.** Free tier is fully usable, so the apps sidestep Apple guideline 3.1.1. Subscriptions stay on the web. Phase 5 is off the critical path.
- **Two listings:** `com.rekindlebc.app` (ReKindle), `com.rekindlebc.ministry`.
- **Ministry ships first** (smaller surface, already auto-deploys).

### Phase 1 — Capacitor scaffold (commit `8c0410a`)
- `@capacitor/core` + `cli` + `android` in the ministry workspace; `apps/ministry/capacitor.config.ts` (appId, `webDir: dist`, mixed-content off).
- Android native project committed under `apps/ministry/android/`. Build artifacts, copied web assets, **and keystores** are git-ignored (keystore ignore enabled deliberately).
- Scripts: `npm run mobile:sync`, `npm run mobile:android`.
- **Phase 0 mandate implemented:** `packages/features/src/platform.ts` (`isNativeApp()`/`canShowPurchaseUI()`, detected via the `window.Capacitor` global so the consumer web app has zero Capacitor dependency). Billing icon + `/settings/billing` route + the MinistrySpace upgrade banner are all hidden in native builds.

### Phase 2 — Media permissions (commit `187279d`)
- Android manifest: `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `ACCESS_NETWORK_STATE`, `FOREGROUND_SERVICE(+CAMERA/MICROPHONE)`, `WAKE_LOCK`, `POST_NOTIFICATIONS`; camera/mic as `uses-feature required=false`.
- `capacitor.config.ts`: `androidScheme`/`iosScheme` pinned to `https` (getUserMedia needs a secure context, else camera/mic silently die).
- `apps/ministry/ios-setup.md`: the iOS `Info.plist` keys, capabilities, and device test gate captured for when a Mac is available.

Both apps build green throughout.

---

## ⏳ Verification owed (not code — needs a device)

These gates are **not met yet** and are the user's step:

- [ ] **Phase 1 boot:** app launches on an Android device/emulator, sign-in screen shows, navigation works, **no Billing icon**.
- [ ] **Phase 2 media (real device, not emulator):** host a broadcast (camera+mic publish); join a meeting; **camera turns on at the first tap**; a signed-out **guest** can watch a shared link; audio routes to speaker.

Run: `cd apps/ministry` → `npm run mobile:android` (opens Android Studio → ▶ Run).

---

## ⬜ Remaining work

### Phase 3 — Auth & deep links
- Register a custom scheme + **App Links (Android)** / **Universal Links (iOS)**; add them to **Supabase Auth → Redirect URLs** or OAuth/magic-link sign-in breaks in the shell.
- Wire deep links: `/channels/:id`, `/ministry/:id/meeting/:id`, `/channel/:id/meeting/:id`, `/join/:slug`, `/kiosk/:slug`.
- ⚠️ **White-label limit:** association files are per-domain, so arbitrary tenant custom domains can't deep-link — app links route through one canonical domain (proposed `app.rekindlebc.com`).

### Phase 4 — Push notifications (a rewrite, highest-risk)
- Current push is **web push** (`firebase-messaging-sw.js` + VAPID) — no native equivalent. Swap to `@capacitor/firebase-messaging`.
- Android `google-services.json`; iOS **APNs auth key** + `GoogleService-Info.plist` + Push capability.
- `push_tokens` survives (set `platform` to `android`/`ios`); `send-push-notification` mostly survives but its **data-only** payload needs a `notification` block for native background display — must not double-fire web push (this project has shipped a duplicate-notification bug before).

### Phase 6 — Store compliance
- Icons/splash (`@capacitor/assets`), screenshots, Play **Data safety** + Apple privacy labels (declare camera/mic/push).
- ⚠️ **In-app account deletion — does not exist today** (only prose in `PrivacyPolicy.tsx`/`TermsOfService.tsx`). Apple mandates it: **a build item before iOS submission.**

### Phase 7 — Release pipeline
- Android keystore + Play App Signing; iOS certs/provisioning.
- Internal testing (Play) / TestFlight first. Consider Capacitor live updates for JS-only fixes.

---

## 🚧 Blockers / owner actions

| Blocker | Needed for | Notes |
| --- | --- | --- |
| **Android Studio + JDK + SDK not installed** | building/running any APK, Phase 1–2 verification | ~30–60 min install; bundles JDK+SDK |
| **No Mac** | *all* iOS work (scaffold, Info.plist, build) | `cap add ios` + Xcode are macOS-only; or use a cloud-Mac CI |
| **Apple Developer account** ($99/yr) | iOS signing/submission | long pole — approval can take days; **start now** |
| **Google Play account** ($25) | Play submission | one-off |
| **In-app account deletion** | iOS submission (Phase 6) | must be built |
| Confirm canonical deep-link domain | Phase 3 | proposed `app.rekindlebc.com` |

---

## Guardrail (unchanged)

The wrap is additive — Capacitor consumes the same `dist/`, so web deploys are unaffected. Native work stays on this branch, `main` stays deployable, and native behaviour is gated behind `isNativeApp()` rather than replacing web paths. The two places native work can still reach web — the push payload (Phase 4) and Supabase Auth redirect config (Phase 3) — are called out in their phases.
