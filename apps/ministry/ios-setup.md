# iOS setup — Rekindle (Capacitor)

The `ios/` platform is **not scaffolded in this repo** because it can only be
generated and built on **macOS with Xcode**. Everything below is what to do the
first time you run it on a Mac, so the Phase 2 media work isn't rediscovered.

See `docs/mobile-app-build-plan.md` for the full phase plan.

---

## 1. Scaffold (on macOS)

```bash
cd apps/ministry
npm i @capacitor/ios
npm run build
npx cap add ios
npx cap sync ios
npx cap open ios
```

`capacitor.config.ts` is already shared — `appId com.rekindlebc.ministry`,
`webDir: dist`, and `iosScheme: 'https'` (required: `getUserMedia` only works in
a secure context, so LiveKit silently fails over `http`).

---

## 2. Info.plist — REQUIRED for LiveKit (Phase 2)

Without these two keys the app **crashes** the moment it asks for camera or mic —
iOS terminates the process rather than showing a prompt. Add to
`ios/App/App/Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>Rekindle uses your camera so you can appear in live broadcasts and interactive meetings.</string>

<key>NSMicrophoneUsageDescription</key>
<string>Rekindle uses your microphone so you can speak in live broadcasts and interactive meetings.</string>
```

Write them for a human: App Review rejects vague strings like "needs camera".

### Background audio (optional, recommended for broadcasts)
So audio keeps flowing when the host backgrounds the app mid-stream — Xcode →
Signing & Capabilities → **Background Modes** → check **Audio, AirPlay, and
Picture in Picture**. This adds:

```xml
<key>UIBackgroundModes</key>
<array><string>audio</string></array>
```

Only enable it if broadcasts genuinely need to survive backgrounding — Review
asks you to justify background modes.

---

## 3. Capabilities

| Capability | Phase | Why |
| --- | --- | --- |
| Push Notifications | 4 | APNs; also add the APNs auth key in Firebase |
| Associated Domains | 3 | Universal Links (`applinks:app.rekindlebc.com`) |
| Background Modes → Audio | 2 (optional) | broadcast audio while backgrounded |

---

## 4. Phase 2 test gate (real device — the simulator has no camera)

- [ ] Host a live broadcast — camera + mic publish
- [ ] Join an interactive meeting as a member
- [ ] Camera toggles ON at the **first** tap (this regressed on web before —
      the room joins muted by design, so the first toggle must work)
- [ ] A **guest** (signed out) can watch a broadcast via a shared link
- [ ] Audio routes to the speaker, not the earpiece
- [ ] Permission prompts show the strings above, and denying them degrades
      gracefully instead of crashing

---

## 5. Known gotchas

- **Simulator has no camera.** Media testing must be on a physical device.
- **`getUserMedia` needs the secure context** — never change `iosScheme` off `https`.
- WKWebView historically restricted WebRTC; iOS 14.3+ is required. Set the
  deployment target accordingly.
