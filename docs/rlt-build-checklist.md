# ReKindle Live Translation (RLT) — Build Checklist

Tracked checklist for the **revised** RLT build plan (Phases 1–6).
Source doc: `RLT-Build-Plan.pdf`, revised 12 Aug 2026, "Build Plan · Phases 1–6 (Revised Launch Sequence)" — supersedes the 11 Aug plan and the separate Phase 4B scope doc (the bot is no longer a post-launch addendum; it's now the Phase 1–3 core).

**What changed vs. the original plan:** launch order flipped. The system now ships **bot-first** — interactive meetings + live broadcast translation via a cloud LiveKit bot, software-only, no church hardware — as the MVP (Phases 1–3, ~7 weeks). The PA/edge-agent hardware pipeline that was originally Phases 2–4 is now **Phase 4**, positioned as a premium add-on built *after* the core product is validated in the field. Both pipelines share one DB schema created up front in Phase 1 ("Option A" migration — all tables in one shot, device-auth tables sit idle until Phase 4 needs them).

**Repos involved**
- `rekindle-livekit-` (this repo) — DB migrations/RPCs, BC dashboard routes, meeting UI, `/display` route, shared infra
- `rekindle-translation-bot` (new, separate) — Node.js LiveKit bot, Hostinger VPS — **Phase 2**
- `rekindle-translator` (new, separate) — Electron edge agent for PA integration — **Phase 4**

**Deployment (Asia-primary):** Supabase Singapore (ap-southeast-1) · Hostinger VPS Singapore (bot + app) · GitHub Releases (edge agent installers). Confirm both Supabase project region and Hostinger VPS datacenter are Singapore/Mumbai before building — flagged as an explicit Phase 1 task.

**Status key:** `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

## Active build checklist — Nigerian English STT optimization

This is the working checklist for the live speech-quality build we are doing now in the actual runtime bot repo, before any broader Phase 2/Phase 3 work expands again.

- [x] Confirm the real runtime Deepgram pipeline is in the sibling bot repo, not this monorepo
- [x] Confirm the live source-of-truth flow: speech → Deepgram STT → English transcript → GPT-4o → ElevenLabs
- [x] Fix English sessions to use `nova-3` and `en-US` while keeping auto-detect `multi` only for real auto-detect sessions
- [x] Add a session-aware English Deepgram keyword vocabulary for sermon/ministry content
- [x] Add deterministic transcript corrections for common Nigerian-English sermon misreads (for example: “press God” → “praise God”)
- [x] Add regression tests for the hot-path transcript fixes and keyword selection
- [x] Verify the STT optimization code passes the real TypeScript build in the translation bot
- [ ] Run a live sermon smoke test in a real room and confirm the corrected transcript reaches the translated output without drift
- [ ] Tune per-ministry / per-pastor vocabulary by adding known names, church phrases, and sermon vocabulary from actual live transcripts
- [ ] Add an admin-managed vocabulary layer so ministry-specific terms can be stored and re-used without hardcoding in code
- [ ] Measure real transcription accuracy before and after the fix on a sample sermon and log the delta for the next iteration

### Live sermon smoke test checklist

1. Start a clean translation session in the real meeting room with a known English sermon source language.
2. Confirm the bot joins with the session language pinned to `en-US` and uses the `nova-3` model in the runtime logs.
3. Speak a short sermon phrase that includes known high-risk words: "praise God", "Holy Spirit", "by God's grace", "we are trusting God".
4. Verify the final transcript in the app shows the corrected wording and not the known misreads such as "press God" or "Holy Ghost".
5. Verify the translated output retains the corrected wording before the TTS stage.
6. Listen to the translated audio and confirm the phrase is spoken naturally in the target language without the semantic drift that came from the incorrect source transcript.
7. Repeat with a second sentence including a ministry-specific phrase such as "RCCG" or "House Fellowship".
8. Log the exact transcript before and after the fix for comparison and save it in the session notes for future tuning.
9. If there is any drift, capture the raw transcript, the corrected version, and the final translation and convert those into new keywords or correction rules.
10. Mark the smoke test as passed only when the transcript remains faithful in real room conditions and the output sounds semantically correct in the target language.

**Migration numbering:** the doc pencils in migration **0260/0261** for "Option A" (all tables, one shot). Checked against this repo: **both are already taken** (`0260_increment_ministry_usage_fn.sql`, `0261_background_music_ministry_usage.sql`). Written as [`supabase/migrations/0273_translation_infrastructure.sql`](../supabase/migrations/0273_translation_infrastructure.sql) — next free number as of this checklist (latest was `0272`). **Not yet run** — still needs to be pasted into the Supabase SQL editor per this repo's migration workflow (see `supabase/config.toml`: `db push` isn't part of the flow here).

**Beyond the doc's 10 RPCs, the migration also adds two small ones** to close a real gap: the doc never specifies how `language_configs` gets written safely. `upsert_language_config()` covers the non-PIN settings fields; `set_display_pin()` bcrypt-hashes the PIN server-side. Both are admin-only, SECURITY DEFINER. `language_configs` itself has no direct-write RLS policy — everything routes through these two, so a raw PostgREST PATCH can never set `pin_hash` to plaintext.

**Effort:** total scope is essentially unchanged from the original estimate (~340–485 focused build/test hours across the full build), just reordered. The material change is *when* something real ships: an MVP (bot translation live in meetings/broadcasts, no hardware) is now reachable at **Week 7** instead of Week 9, because PA hardware work is deliberately deferred to Phase 4 rather than built in parallel from the start.

---

## Table of Contents
- [Phase 1 — Database, Auth & Control Plane](#phase-1)
- [Phase 2 — LiveKit Bot Service](#phase-2)
- [Phase 3 — Live Pilot: Meetings & Broadcast](#phase-3)
- [Phase 4 — PA System Integration (Edge Agent)](#phase-4)
- [Phase 5 — Packaging, Billing & Multi-Ministry Rollout](#phase-5)
- [Phase 6 — True Sync Upgrade (Option B)](#phase-6)
- [Risk Register](#risk-register)
- [Summary Timeline](#summary)

---

<a id="phase-1"></a>
## Phase 1 — Database, Auth & Control Plane (Weeks 1–2)

No audio code yet. Full data model for **both** pipelines in one migration, device-key auth RPCs (idle until Phase 4), bot session RPCs (used from Phase 2), and all BC dashboard routes including `/display`.

### 1.1 Supabase Migration (Option A — all tables in one shot)
- [x] Write migration — [`0273_translation_infrastructure.sql`](../supabase/migrations/0273_translation_infrastructure.sql)
- [x] `translation_sessions` — one row per language pair per service; `source_type` ("livekit_room"/"pa_mixer"); `service_id` groups concurrent sessions; `hls_stream_url`
- [x] `translation_logs` — per-utterance source/translated text + STT/translate/TTS latency ms, written by both pipelines
- [x] `translation_device_commands` — command queue (start/stop/pause/ping) for edge agent — **idle until Phase 4**
- [x] `translation_devices` — edge agent registrations, bcrypt-hashed `device_key` — **idle until Phase 4**
- [x] `translation_device_tokens` — 24-hour bearer tokens for edge agent auth — **idle until Phase 4**
- [x] `translation_bot_instances` — one row per active bot session; server, status, started_at
- [x] `translation_services` — groups sessions under a named service (e.g. "Sunday 9 AM")
- [x] `language_configs` — per-ministry source/target defaults, ElevenLabs voice, `bot_enabled`, `is_public`, `pin_hash`, `supported_target_languages[]`
- [x] Enable RLS on all tables (see migration header comment for the mutation model — most tables are SELECT-only under RLS, writes go through the RPCs below)
- [x] Enable Realtime on `translation_logs`, `translation_sessions`, `translation_device_commands`, `translation_bot_instances`
- [ ] **Run migration on Supabase project `vpnpembyqbbaaiynfvli` (Tola)** — paste into SQL editor, validate RLS + Realtime on all tables
- [x] **Confirmed — and it's a mismatch.** Project Settings → General shows region **us-east-2 (East US, Ohio)**, not Singapore/Mumbai. Migration request to Supabase support not yet raised — flagging the finding here rather than acting on it unilaterally, since moving a project's region is disruptive and worth a deliberate decision (Tola)
- [ ] Confirm Hostinger VPS datacenter is Singapore or Mumbai — hPanel → VPS → location; raise migration ticket if EU (Tola)

### 1.2 Device Key Auth RPCs (build now, first used in Phase 4)
- [x] `register_translation_device` — admin issues raw `rlt_***` key, bcrypt hash stored, raw key returned once
- [x] `authenticate_device` — raw key → 24-hour bearer token
- [x] `device_heartbeat` — 30s keepalive, slides token expiry, updates `last_ping`
- [x] `device_update_session` — updates session status + HLS stream URL; dual auth (device token OR `service_role`, so the bot can reuse it too)
- [x] `device_insert_log` — appends `translation_logs` row per utterance; same dual auth
- [x] `device_ack_command` — marks dashboard command as received
- [x] `revoke_translation_device` — deletes device's live tokens + marks revoked, cascades immediately
- [ ] Test all 7 in isolation once migration is run — confirm bcrypt hash/verify works even though nothing calls them yet (Tola/Dev, after run)

### 1.3 Bot Session RPCs (used from Phase 2)
- [x] `start_bot_session` — admin triggers from dashboard, inserts `translation_sessions` row, fires `pg_notify("bot_dispatch")` to VPS
- [x] `stop_bot_session` — admin stops a bot session, updates status, notifies bot to leave room
- [x] `verify_display_pin` — checks PIN against bcrypt hash in `language_configs`, gates private `/display` sessions

### 1.4 Dashboard Routes
- [x] ~~Add `/translation` route group to ReKindle BC router~~ — this app doesn't route ministry-admin sections by URL; it's a tab inside `MinistryManagement.tsx` (see `MinistryWhatsAppHub` for the precedent). Added a "Live Translation" tab there instead — [`MinistryTranslationHub.tsx`](../packages/ministry/src/components/MinistryTranslationHub.tsx)
- [x] ServiceManager: start service, add language pairs, status, copy display link (calls `start_bot_session` per pair, groups under `service_id`) — [`MinistryTranslationServiceManager.tsx`](../packages/ministry/src/components/MinistryTranslationServiceManager.tsx). QR codes deliberately deferred — that's a Phase 2/5 task in the doc, not Phase 1. Room name is a manual text field for now; Phase 2 auto-fills it from the real meeting.
- [x] DeviceList UI (register, show key once, revoke) — **built now, used from Phase 4** — [`MinistryTranslationDeviceList.tsx`](../packages/ministry/src/components/MinistryTranslationDeviceList.tsx)
- [x] LanguageSettings: source/target, voice, `bot_enabled`, public/private, PIN, supported languages[] — [`MinistryTranslationSettings.tsx`](../packages/ministry/src/components/MinistryTranslationSettings.tsx). Broadcast mode omitted — that's a per-session/service-card toggle in Phase 2 (§2.6), not a ministry-wide setting, so it isn't a `language_configs` column.
- [x] `/display/:sessionId` — live text feed (Realtime-wired) + audio player placeholder, PIN gate, language label — [`TranslationDisplayPage.tsx`](../packages/live/src/components/TranslationDisplayPage.tsx). See its header comment for how it handles the private-session RLS gap noted in the migration.
- [x] `/display` landing page (`?service_id=:id`) — lists active sessions by target language, user self-selects — [`TranslationDisplayLanding.tsx`](../packages/live/src/components/TranslationDisplayLanding.tsx)
- [x] Wire Supabase Realtime on `translation_sessions` for live dashboard status — done in ServiceManager
- [ ] **Manual QA once the migration is actually run** — Tola: open the new tab, start a service, confirm a `translation_sessions` row appears and `/display` loads

### 1.5 QA
- [ ] Manual QA — all routes render, DB reads/writes confirmed for a test ministry (Tola; no audio this phase)

### Phase 1 Exit Criteria
- [ ] DB migration live — all tables visible, RLS + Realtime enabled, RPCs callable from SQL editor (End Wk 1)
- [ ] Dashboard routes accessible — all routes render without errors for a test ministry (End Wk 2)
- [ ] Session row created — clicking "Start Service" inserts `translation_sessions` row, status = `initialising` (End Wk 2)
- [ ] `pg_notify` fires — `start_bot_session` confirmed to emit `bot_dispatch` via LISTEN in SQL editor (End Wk 2)
- [ ] `/display` route loads — shows language label + PIN gate, placeholder audio, no live data yet (End Wk 2)

---

<a id="phase-2"></a>
## Phase 2 — LiveKit Bot Service (Weeks 3–5)

**Status:** first-pass implementation complete in [`rekindle-translation-bot`](../../rekindle-translation-bot) (sibling repo, own git history — `git init` done, nothing committed yet). `npm install` succeeds and `npm run typecheck` passes clean against the real installed `@livekit/rtc-node`, `@deepgram/sdk`, `livekit-server-sdk`, `openai`, `fluent-ffmpeg`, and `pg` types — not just written against docs and hoped for. **Week-1 spike run against a real LiveKit room and confirmed working end-to-end (2026-08-14)** — real speech in, real Deepgram/GPT-4o/ElevenLabs calls, real translated audio heard by a listener on a separate physical device. See §2.1 below for the five real bugs that testing surfaced and fixed. [`0274_translation_streams_bucket.sql`](../supabase/migrations/0274_translation_streams_bucket.sql) has been run — HLS "Bucket not found" errors confirmed stopped.

Build and deploy `rekindle-translation-bot` on Hostinger VPS. Full STT→translate→TTS pipeline through a LiveKit room. Meeting UI language picker + broadcast companion QR. **No church hardware.** This is the fastest path to a live session — join a meeting, enable translation, pick a language.

### 2.1 Bot Service Setup
- [x] Scaffold `rekindle-translation-bot` repo — separate sibling repo (`C:\Users\Administrator\Documents\GitHub\rekindle-translation-bot`), own git history, Node.js 20/TypeScript/tsconfig/package.json
- [x] Dependencies chosen: `@livekit/rtc-node` (not the higher-level `@livekit/agents` framework — see note below), `@deepgram/sdk`, `openai`, `fluent-ffmpeg`, `@supabase/supabase-js`, `pg`, `livekit-server-sdk`
- [x] **Week-1 spike (HIGH RISK) — DONE, live-tested end-to-end (2026-08-14).** `AudioStream(track, { sampleRate, numChannels })` resamples internally on receive as expected — `LiveKitAgent.ts` requests 16kHz directly, no manual downsampling needed. Real speech → Deepgram Nova-2 → GPT-4o → ElevenLabs Turbo v2.5 → published back through LiveKit → heard by a listener on a separate device, confirmed multiple times with sub-1s-to-2s translate latency. Five real bugs found and fixed via live testing (all deployed, none were guessable from docs alone):
  1. **Deepgram idle-timeout, no reconnect** — the streaming connection closed ~12s after opening if no audio had been sent yet (e.g. before a speaker joined), silently killing STT for the rest of the session with no reconnect logic. Fixed: `keepAlive()` ping every 8s while open, plus reconnect-on-unexpected-close in `AudioPipeline.ts`.
  2. **`captureFrame()` threw `RtcError: InvalidState - failed to capture frame` on every call** — the real, previously-unverified risk this spike existed to catch (confirms the closed `livekit/node-sdks#504` issue was relevant). Root cause: `LiveKitAgent.publishPcm()` built each 20ms `AudioFrame` as an `Int16Array` *view* into one large shared PCM buffer (the full TTS output), via `new Int16Array(slice.buffer, slice.byteOffset, length)`. `@livekit/rtc-node`'s `AudioFrame.protoInfo()` builds the native FFI pointer from `this.data.buffer` directly — it ignores the view's `byteOffset`/`length` entirely — so every frame in the loop handed the native layer the same pointer (byte 0 of the whole buffer) instead of advancing per frame. Fix: `.slice()` each frame's `Int16Array` (TypedArray copy into its own dedicated buffer, not the unstable `ArrayBuffer.prototype.slice`) before constructing the `AudioFrame`. **This is the one most likely to bite again on any future custom-audio-frame work against this SDK** — the fix isn't documented anywhere obvious; it only surfaced by reading the SDK's own `.ts` source, not its `.d.ts` or published docs.
  3. **Zombie session-tracking blocked all redispatch** — `index.ts` tracked active `BotSession`s in an in-memory `Map`, but only removed an entry on an explicit `'stop'` dispatch or a `start()` failure. A session that ended *itself* (speaker left, room disconnected) left a permanent stale entry, so every subsequent `'start'` dispatch for that same `session_id` was silently ignored as "already running" — until the whole process restarted. Fixed with an `onEnded` callback `BotSession` calls unconditionally in `end()`.
  4. **Permanent subscription latch dropped audio on speaker reconnect** — `LiveKitAgent` used a boolean `subscribed` flag that latched true forever on the first audio track from the designated speaker. A legitimate reconnect (network blip, device switch, page reload) republishes a *new* track under the same identity; the boolean latch ignored it forever, silently pumping a dead old track for the rest of the session with zero errors — looked exactly like "the mic isn't working" and cost significant debugging time before being traced to this. Fixed by tracking the active track SID instead of a boolean, so a fresh track from the same (or first-locked, in fallback mode) identity takes over.
  5. Minor: the throwaway spike test harness (`livekit/spike/index.html`) auto-attaches subscribed audio tracks but never checked whether the browser's autoplay policy actually let `.play()` succeed — a blocked autoplay was indistinguishable from "bot never published anything." Added explicit `.play().catch()` detection + a manual "Enable audio" unlock button. Test-harness-only, not app code, but worth carrying the same defensive pattern into the real meeting UI's translation audio playback if it isn't already there.
- [x] **VPS setup — actually done, live, verified.** Got SSH access from the user (76.13.219.239, root), ran `deploy/setup-vps.sh` for real (Node 20.20.2, ffmpeg 6.1.1, PM2, ufw firewall, 2GB swap — all installed clean), copied the repo over, configured `.env`, built, and started it under PM2. **Confirmed working end to end**: fired a throwaway `pg_notify('bot_dispatch', ...)` from `psql` and watched the bot's own log immediately show `[index] start dispatch missing required fields: {...}` — the exact expected line, proving the Postgres `LISTEN` connection is genuinely live, not just that the process started.
  - Three real bugs hit and fixed along the way (all documented in the bot repo's README "Gotchas" section so they don't recur): `ecosystem.config.js` needed renaming to `.cjs` (ESM/CommonJS conflict with `package.json`'s `"type": "module"`); `@supabase/supabase-js` needs a native `WebSocket` global only Node 22+ ships by default — fixed with a scoped `ws` polyfill (`src/wsPolyfill.ts`) rather than bumping the VPS's system Node, since deliberately **not** touching shared infrastructure; `DATABASE_URL` had to be the Supabase **Shared Pooler** string, not "Direct connection" (which is IPv6-only and this VPS's route to Supabase's IPv6 endpoint was refused) — took several rounds to find the exact pooler hostname since its generation prefix (`aws-1-` here, not the more common `aws-0-`) isn't guessable and had to come from the dashboard.
  - **Real finding, not yet acted on:** this Supabase project's region is **us-east-2 (Ohio)**, not Singapore/Mumbai as the build plan requires for Asia-primary latency. That's the answer to the still-open "confirm Supabase region" pre-flight item below — it's answered now, and the answer is a mismatch. Worth a real decision before this goes near a pilot; out of scope to fix in this session.
  - **Also discovered:** this VPS isn't dedicated — it already runs another PM2 app (`video-transcode`) and has Docker installed. Fine for testing (PM2 handles multiple apps under one daemon without conflict), but confirms this is shared infrastructure, not a clean box, consistent with the user's "just to test, will be upgraded after" framing.
  - `pm2 save` run so the process list survives a reboot.
- [x] `.env.example` documents all required vars — LiveKit keys, AI API keys, Supabase **service role key**, plus `DATABASE_URL` (see note below) — VPS env only, never committed (`.gitignore`d)

**Framework note:** the doc says "LiveKit Agents SDK (Node.js)." Built directly against `@livekit/rtc-node` (LiveKit's lower-level real-time client SDK) instead — its API is stable and I could ground every call in current published docs; the higher-level `@livekit/agents` framework is oriented around one-agent-per-room voice pipelines and its exact API has had more churn, which didn't fit our multiple-bots-one-room-per-language-pair shape as cleanly anyway.

**LISTEN/NOTIFY note:** Supabase Realtime does not relay arbitrary `pg_notify` channels (only table changes and its own broadcast channel) — `start_bot_session`'s `pg_notify('bot_dispatch', ...)` needs a real Postgres `LISTEN` connection, hence the direct `pg` dependency and `DATABASE_URL` (session-mode connection string, not the pgbouncer pooler — pooled connections don't support `LISTEN`).

### 2.2 BotSession Lifecycle
- [x] `index.ts` — Postgres LISTEN on `"bot_dispatch"` (`BotDispatchListener` in `SupabaseClient.ts`, auto-reconnects) + in-memory session map (replaces polling)
- [x] Dispatch → creates `BotSession`, `upsertBotInstance(status: "joining")`
- [x] Room join — `LiveKitAgent.ts` joins as `"rlt-bot-{sessionId}"`, subscribes to speaker track (by identity or first-subscribed-wins fallback); updates bot instance + `translation_sessions` to `"active"`
- [x] Audio pipeline — `AudioPipeline.ts`: `AudioStream` requests 16kHz directly (see spike note above) → Deepgram Nova-2 streaming STT
- [x] `on is_final` → promise-chained `translateAndSpeak(text)` (never overlaps) → GPT-4o (ministry sermon system prompt, `max_tokens: 512`) → ElevenLabs Turbo v2.5 TTS (direct `fetch`, not the `elevenlabs` npm package — fewer API-surface unknowns)
- [x] PCM output split in `BotSession.ts`: (1) `LiveKitAgent.publishPcm()` → LiveKit track `"rlt-translated-{lang}"`, (2) `HLSWriter.write()` → ffmpeg → Supabase Storage
- [x] `device_insert_log` RPC per utterance (called with no token — `auth.role() = 'service_role'` branch in migration 0273's RPC) — powers `/display` + billing
- [x] `device_update_session` called with HLS stream URL once `HLSWriter`'s playlist upload succeeds
- [x] Session end — `stop_bot_session` dispatch / room disconnect / speaker-left → `BotSession.end()`: stop pipeline, stop ffmpeg (2s flush for `EXT-X-ENDLIST`), disconnect room, mark ended
- [x] Crash recovery — `index.ts` queries `translation_bot_instances WHERE status IN ('active','joining')` on every start (including PM2 auto-restarts) and re-joins via `buildRecoveryOptions()`

**Also added, not in the original task list:** [`0274_translation_streams_bucket.sql`](../supabase/migrations/0274_translation_streams_bucket.sql) — the doc's storage task ("Configure Supabase Storage bucket... public read for public sessions, RLS for private") was never actually written as a migration in Phase 1. Added now since `HLSWriter` needs it to exist. Private bucket, RLS-gated per-session with the same `NOT EXISTS(...is_public = false)` shape as 0273's session/log policies (not a single bucket-wide public flag).

### 2.3 Speaker Identification
- [x] Designated speaker mode (recommended) — subscribe by `language_configs.speaker_identity`, passed through the dispatch payload
- [~] First-active-speaker fallback — implemented as "first subscribed track wins," **not** true volume-threshold switching. Flagged explicitly in code comments as a gap vs. the doc's fuller description; designated speaker mode is the documented recommendation for pilots anyway (§3.2 pre-pilot checklist)

### 2.4 Multi-Language Meetings
- [x] Architecture supports 2+ bots simultaneously in the same room — each `BotSession`/`LiveKitAgent` is an independent room participant with its own identity and track name, so running two just means two dispatches
- [x] Each bot publishes its own named track (`rlt-translated-vi`, `rlt-translated-fr`, …) — `trackName` derived from `targetLanguage`
- [x] **Live-tested end-to-end (2026-08-14):** two bots (ES + FR) dispatched into the same room, both locked onto the same designated speaker, both correctly ignored each other's published translated tracks (`speakerIdentity` filter — see §2.1 item 4), and both independently transcribed/translated/published the same source speech concurrently with no bleed or cross-talk: "One, two, three." → "Uno, dos, tres." (ES) and "Un, deux, trois." (FR) simultaneously, each heard correctly in its own listener tab.
- [ ] Auto-fallback to Original if a language is stopped mid-meeting — this is participant-UI behavior (Phase 2.7/BC meeting UI), not bot-service work; not built yet

### 2.5 Broadcast Companion Link
**Status: built** — [`qrCode.ts`](../packages/features/src/qrCode.ts)'s new `generateBroadcastOverlayPng()` + wiring in [`MinistryTranslationServiceManager.tsx`](../packages/ministry/src/components/MinistryTranslationServiceManager.tsx). Typechecks clean (same 294/0-new baseline).
- [x] "Broadcast mode" toggle (per-service, local UI state only — not persisted, it just reveals the download button, doesn't change server behavior) + "Download QR overlay" PNG on the service card
- [x] "Copy link" and "Share" buttons alongside the QR download (user request, 2026-08-14) — same landing URL (`landingUrlFor()`, factored out so QR/copy/share can't drift apart). Share uses the Web Share API (mobile/OS share sheet), falls back to copy on browsers that don't implement it (desktop Firefox, most desktop Chrome) rather than showing a dead button.
- [x] Composited PNG: QR code (white backdrop for scan reliability) + "Follow in your language" / "Scan with your phone camera" on a semi-transparent dark rounded card, **transparent everywhere else** so it drops into OBS as a picture-in-picture image source without a hard rectangle. Built with `canvas`, not the `qrcode` package's own SVG/PNG output alone — needed real text layout (word-wrap included) alongside the QR, which `qrcode` doesn't do.
  - **Real bug found + fixed via live testing (2026-08-14):** the subtitle was drawn at a fixed Y position that assumed the title renders on one line. "Follow in your language" (the default title) actually wraps to two lines at this card width, and the fixed subtitle Y landed right on top of the wrapped second line — visually confirmed on a real generated overlay. Fixed by measuring the title's wrapped line count first (`wrapLines()`, extracted from the old `wrapText()`), then vertically centering the whole title+subtitle block so the subtitle always lands below however many lines the title actually took.
- [x] QR encodes the **service landing page** (`/display?service_id=:id`), not a single language's link — matches "viewers scan → landing page → self-select language"
- [x] Literal URL printed under the subtitle (user request, 2026-08-14) — fallback for anyone who can't/won't scan (manual entry, reading it off a screenshot). Font auto-shrinks (`fitMonospaceFont()`) to fit the card in one line since service/session URLs carry a UUID and can be long; opt-out via `showUrl: false`.
- [x] Sync-gap note shown inline in the UI next to the download button (2–8s room-to-`/display`, +5–40s typical broadcast-platform latency on top) — worded to say this is normal, not a bug
- [x] **Full chain live-tested end-to-end on a real phone (2026-08-14):** started a real service ("Glory service") through the actual Service Manager UI (not a DB bypass — real `start_bot_session` RPC, real admin login), downloaded the QR overlay, scanned it with a phone camera, landed on the service's `/display` page, saw the language picker, selected the language, and joined the correct session — confirmed accurate ("translation starting" is a real, honest state since no one had spoken into that room yet, not a bug).
  - **Real gotcha found + fixed:** the QR encodes `window.location.origin`, so it's only scannable if the app itself is reachable from the phone — testing against `localhost:8081` silently produces an unscannable/unreachable link (works correctly in production against the real domain, just not against a local dev server). Worked around with a Cloudflare quick tunnel; that in turn hit Vite's dev-server host-check (403 on the tunnel's hostname) until `allowedHosts: [".trycloudflare.com"]` was added to `apps/ministry/vite.config.ts` — a permanent, low-risk dev-only addition that makes this kind of real-device testing repeatable going forward.
- [ ] Live-tested in an actual OBS scene — user doesn't have OBS installed yet; PNG compositing/transparency verified only by visual inspection, not in a real OBS scene

### 2.6 BC Meeting UI
**Status: built**, in this repo's actual meeting stack — `MinistryInteractiveMeetings.tsx` → `DailyVideoCall.tsx` (LiveKit under a legacy name, see below) → `useDailyRoom.ts` → `LiveKitRoomWrapper.ts`. Verified: `npm run typecheck` (via `tsc --noEmit -p apps/ministry/tsconfig.app.json`) shows the exact same 294 pre-existing errors as before this work started, zero new ones, none in any touched/new file.

**Real finding worth flagging:** this app's "interactive meetings" are NOT on Daily.co despite the component/hook names (`DailyVideoCall.tsx`, `useDailyRoom.ts`) — `videoBackend.ts`'s own header comment says the Daily engine was fully removed; LiveKit is the only backend now, just under old names kept for git-diff-size reasons. So the architecture match to this build plan is real, just not obvious from filenames.

**Also a real bug caught and fixed before it shipped:** the bot was originally publishing its translated track with `TrackSource.SOURCE_MICROPHONE` (matching the edge-agent doc's audio conventions). `LiveKitRoomWrapper.normalize()` auto-attaches and plays every participant's Microphone-source track for everyone in the room — so that would have made every translated track audible to everyone the instant a bot joined, silently contradicting "Default on join: Original — participants opt in." Fixed by publishing as `SOURCE_UNKNOWN` instead (rekindle-translation-bot's `LiveKitAgent.ts`) — invisible to the existing mic/camera/screen-share lookups, found only by track name (`rlt-translated-{lang}`) through the new methods below.

- [x] `LiveKitRoomWrapper.ts` — additive-only new methods (same pattern already established for `setCameraBackground`/`getCameraBackground`, i.e. NOT added to the shared `IVideoRoomWrapper` interface, called via `(wrapper as any).method?.()`): `getAvailableTranslations()` scans `rlt-bot-*` participants for `rlt-translated-{lang}` tracks; `setTranslationLanguage(lang, speakerIdentity?)` attaches the picked track's audio locally and locally mutes the original speaker's mic (`MediaStreamTrack.enabled = false`) — build plan §2.7's "mutes the original track." `VideoWrapperCallbacks.onTranslationTracksChanged` (new optional field, additive) fires on track/participant events so the UI list stays live.
- [x] `useDailyRoom.ts` — exposes `translationTracks`, `translationLanguage`, `setTranslationLanguage` through the hook, mirroring `videoBackground`/`setVideoBackground` exactly
- [x] `DailyVideoCall.tsx` — new `onTranslationControlsChange` prop, lifts state to the parent same as `onBackgroundStateChange`/`onRaiseHandStateChange`
- [x] `FloatingTranslationButton.tsx` (new, in `packages/live/src/components/`) — floating pill in the same bottom-center row as `FloatingBackgroundButton`/`FloatingSpeakerButton`. Popover with: Original + each active language (picker, default = Original), per-language "copy display link" (derives the session UUID straight from the bot's `rlt-bot-{sessionId}` identity — no extra query), host-only per-language Stop (`stop_bot_session`), host-only **"+ Add language"** (fetches `language_configs.supported_target_languages`, dispatches `start_bot_session` with the meeting's real `room_name`)
- [x] Wired into `MinistryInteractiveMeetings.tsx` — same `useState` + prop + floating-row pattern as the existing Background/Speaker/Raise-Hand buttons
- [x] Renders nothing for non-hosts until a bot has actually joined (no dead UI); hosts always see it (to add a language)
- [ ] **Not built — scope cut, see below:** the meeting-*creation*-form toggle ("Enable live translation" + language dropdown at scheduling time). "+ Add language" from the live meeting (above) covers the same end capability — dispatch a bot into the room — without touching the meeting creation/edit form's already-large state management. Revisit if ministries want translation pre-configured before the meeting starts rather than toggled on live.
- [ ] Bilingual language names ("Vietnamese / Tiếng Việt") — currently shows raw codes (`VI`); cosmetic, not done
- [ ] Host-only language badge on participant tiles — not done (would need a `normalize()` change; deferred to keep this pass additive-only)
- [x] Auto-fallback to Original if a bot track disappears — `notifyTranslationTracksChanged()` checks the current selection against the fresh track list and calls `setTranslationLanguage(null)` if it's gone

### 2.7 `/display` Route — Full Implementation
**Status: built**, on top of the Phase 1 stub — [`TranslationDisplayPage.tsx`](../packages/live/src/components/TranslationDisplayPage.tsx). Typechecks clean (same 294 pre-existing/0 new baseline as everything else this session).
- [x] Language label at top ("Vietnamese Translation") — bilingual-script version ("... / Bản dịch tiếng Việt") not done, cosmetic
- [x] Last 2–3 translated lines (Phase 1); presenter mode below shows just the last one
- [x] Font size presets: Small / Large / Full — cycles via a header button, no persistence (per-visitor, no account to save it to)
- [x] Bilingual toggle — shows `source_text` (already fetched, just wasn't rendered) in smaller muted type above the translated line
- [x] Presenter mode — one line, centred, full-screen; hides the header (a small floating exit button replaces it)
- [x] HLS.js audio player — **reused `HlsPlayer.tsx` as-is** rather than building a new audio player: it's an already-hardened live-HLS component (native HLS + hls.js live-sync tuning + in-place error recovery, built for live-channel broadcasts) and a `<video>` element playing an audio-only HLS stream works fine with no visible video — gated behind a "Listen" button per the doc's user-gesture requirement, appears once `translation_sessions.hls_stream_url` is set
  - **Real bug found + fixed via live testing (2026-08-14):** `HLSWriter.ts` builds `hls_stream_url` via `getPublicUrl()`, which always returns the `/object/public/...` REST path — that path bypasses `storage.objects` RLS entirely and 404s unconditionally on a private bucket, regardless of policy. Since 0274 made the bucket private (correct privacy reasoning at the time), the HLS URL never actually worked. Compounding factor: `HlsPlayer.tsx` has no way to attach an `Authorization` header (bare `src` handed to hls.js / native `<video>`), and native iOS Safari HLS playback categorically cannot attach custom headers to a video element — a browser limitation, not something fixable here. Signed URLs don't fit a continuously-growing live playlist either. **Decision (user-confirmed): made the bucket public** ([`0275_translation_streams_bucket_public.sql`](../supabase/migrations/0275_translation_streams_bucket_public.sql), run) — session IDs are unguessable UUIDs so this is "unlisted" not "open," but note the real tradeoff: anyone with the exact HLS URL bypasses `language_configs.is_public`/the PIN gate at the storage layer specifically (the `/display` text feed and room name are untouched, still fully RLS-gated). Confirmed fetchable post-migration.
- [x] PIN gate if `language_configs.is_public = false` (Phase 1)
- [x] Connection status: green (live) / amber (reconnecting) / grey (ended) (Phase 1)
- [x] Mobile-browser tested — done live 2026-08-15, real phone, multi-language service (see §2.4/§2.5)
  - **Real bug found + fixed:** the landing page's language-picker buttons (`TranslationDisplayLanding.tsx`) rendered as blank/invisible — `Card`'s `bg-background` resolves to this app's light theme (near-white), while the page wraps everything in a hard-coded dark theme (`bg-slate-950 text-white`) with nothing inside the Card overriding that inherited white text — white-on-near-white, invisible on a real device even though it looked fine in devtools' emulated viewport during earlier desktop checks. Fixed with explicit `bg-white/5`/`text-white` on the button and, for consistency, the PIN-entry Cards in `TranslationDisplayPage.tsx` (same theme-mismatch pattern, lower severity — text stayed technically legible there, just visually inconsistent with the dark page).
  - **Investigated + confirmed NOT a `/display` bug:** simultaneous multi-language audio was reported during this same test — `TranslationDisplayPage.tsx`'s Realtime channel, `translation_logs` query, and HLS `src` are all scoped tightly to the one `sessionId` in the URL, no cross-session leak possible in this component. Root-caused: it was the **speaker's own** `livekit/spike/index.html` tab (the throwaway harness used to publish the test mic) — as a full room participant with `autoSubscribe: true`, it auto-attaches and plays *every* audio track it sees, including both bots' own translated output, by design (a connectivity-proof harness, not meant to filter). Confirmed via a screenshot showing that exact tab subscribed to both `rlt-bot-*` tracks. Not a product bug; the real meeting UI (`FloatingTranslationButton.tsx`) only ever plays a track once a participant explicitly selects that language.
  - **Real bug found + fixed (two rounds):** the "Listen" button (gates the HLS player) was effectively invisible on a real phone — reported as "have to scroll to find it, and the label is plain white." Round 1: same white-on-`bg-background` contrast bug as the language-picker buttons (the `outline` Button variant sets no text color of its own, inheriting this page's `text-white` onto a near-white background) — fixed with explicit colors, plus switched `min-h-screen` to `min-h-[100dvh]` since a mobile browser's collapsing address-bar chrome makes plain `100vh` taller than the true visible area. Round 2 (user still had to scroll after round 1): `min-h-*` is a *minimum* — the div could still grow past one screen and push the footer below the fold. Fixed by switching to a **fixed** height (`h-screen h-[100dvh]`, `overflow-hidden` on the root) so flexbox actually reserves the footer's space, with `min-h-0 overflow-y-auto` added to `<main>` so any content that doesn't fit scrolls internally instead of displacing the footer. The button is now guaranteed on-screen on load, no scrolling required.
  - **Real bug found + fixed (higher severity — audio pipeline, not styling):** HLS audio played once (whatever accumulated from the first utterances) then never advanced, even as new translated text kept appearing on `/display`. Root cause in `HLSWriter.ts`: `write(pcm)` handed ffmpeg's stdin raw PCM directly, only when TTS actually produced audio for an utterance — ffmpeg has no embedded timestamps on raw PCM input, so it can only advance its clock (and cut new HLS segments) from bytes actually consumed. Any real gap in speech (the normal case — nobody talks nonstop) left the pipe idle and the playlist permanently stalled, while `/display`'s text feed kept working fine because it's a wholly separate Realtime path, not tied to the audio pipe at all. Fixed with a proper real-time pacer: incoming PCM is queued, not written directly, and a 20ms ticker drains exactly one frame's worth per tick — real audio when queued, zero-filled silence otherwise — so ffmpeg always sees a continuous, correctly-paced stream and segments advance in lockstep with wall-clock time regardless of whether anyone's currently speaking. Confirmed post-fix: playlist grew to 27 continuous segments (~108s) with no stalls.
  - **Real bug found + fixed (cross-cutting — lives in the shared `HlsPlayer.tsx`, not RLT-specific code):** after all the above, tapping "Listen" flipped the UI to "Listening…" with total silence — reproduced on both mobile *and desktop* Chrome, not a Safari-only quirk. `HlsPlayer.tsx` had two `video.play().catch(() => {})` call sites that silently swallowed the rejection. Autoplay-with-sound requires a low-latency, gesture-linked `play()` call, but this one only fires after hls.js fetches and parses the manifest over the network — enough async delay that browsers stop treating it as gesture-linked and block it, with zero visible error. Fixed by surfacing the rejection as a `needsUnlock` state and rendering a "Tap to enable sound" overlay whose own `onClick` calls `play()` directly — a genuinely synchronous gesture that browsers always honor. Also had to enlarge `/display`'s audio-player container (was a 40×40px icon-sized box, fine for a silent background element, too small for a legible tap target) to 64×64px. Since `HlsPlayer.tsx` is shared with regular live-channel broadcasts, this fix benefits those too, not just RLT.
  - **Real bug found + fixed (the actual final root cause — everything above was real, but this is what made audio unreachable):** even after every fix above, the browser's own Network tab showed dozens of `index.m3u8` requests served entirely from **disk cache**, and not one `seg_*.ts` request ever fired. Cause: `HLSWriter.ts`'s upload call never set `cacheControl`, so it inherited Supabase Storage's default — `Cache-Control: public, max-age=3600` (1 hour) — applied to the PLAYLIST itself. A live manifest that changes every ~4s cannot be cached for an hour; the browser kept serving an hour-old snapshot and hls.js never saw a playlist that looked any different, so it never discovered new segments to fetch. Fixed by branching `cacheControl` on `isPlaylist`: `'2'` (seconds) for the manifest, `'31536000'` (1 year) for segments, which are immutable once written and should be cached hard. Confirmed fixed: playlist now returns `Cache-Control: public, max-age=2` and `304 Not Modified` on revalidation instead of being served from disk cache.
  - **Related bug found + fixed while chasing the above:** once segment requests started firing, some 404'd or hung for ~13s. Root cause: `stop()` cleans up the local `tmp-hls/{sessionId}` directory, but only if it runs to completion — a fast `pm2 restart` sends its kill signal before `stop()`'s multi-second graceful sequence (2s ffmpeg-flush wait + final upload + `fs.rm`) finishes, so the directory can survive a restart. Combined with `-hls_flags append_list` (ffmpeg continues an existing local playlist's sequence numbers instead of resetting to 0) and `uploadedSegments` being a fresh empty `Set` every restart, a survived directory meant the newly restarted instance tried to catch up uploading **thousands of backlogged old segment files** in one burst — overwhelming the upload pipeline and Supabase Storage's response times, and potentially permanently orphaning old segments a player might still reference if the catch-up never finished before the next restart. Fixed by force-`rm`ing the directory at the *start* of `start()` too, not relying solely on a graceful `stop()`. Note: old orphaned remote segments from before this fix are unreferenced but not cleaned up — harmless dead storage, not worth a migration for test data, but worth remembering if `translation-streams` storage usage looks unexpectedly large later.
  - **Real bug found + fixed (resource/infra, not just code):** even with every fix above deployed, playback remained erratic — `HlsPlayer`'s debug readout (`?hlsdebug=1`) showed edge lag swinging wildly between 0.1s and 18s, and audio that worked would inexplicably stop mid-session. Root-caused via an **unprompted Supabase email**: "Your project is depleting its Disk IO Budget" — symptoms listed (response times increasing, instance becoming unresponsive) matched exactly. Cause: `HLSWriter.ts` used `-hls_list_size 0` (unbounded) — the playlist listed every segment ever produced and grew forever, fully rewritten and re-uploaded on every tick (every 1s, after the earlier latency fix made that more frequent). Hours of two concurrent bots doing that is genuinely heavy sustained write I/O — self-inflicted by an unusually long marathon test session, not representative of a real service's length. Fixed by bounding `-hls_list_size` to 15 (~60s sliding window, standard live-HLS practice, comfortably more than `HlsPlayer.tsx`'s own ≤14s max-latency ever needs) — old segments drop off the listed manifest but remain directly fetchable by URL, nothing is deleted.
  - **Open question:** whether this Supabase project's IO budget needs time to recover before fully clean playback can be re-confirmed, independent of the bounded-playlist fix. Retest once the fix has had a few clean minutes to prove out.

### 2.8 Testing
- [x] Test joining a room as bot participant, confirm audio track subscription in a test room — done live 2026-08-14, repeatedly, across real reconnects/device switches (surfaced item 4 in §2.1's bug list)
- [x] Test full single-language pipeline — 3 tabs (speaker, listener, `/display`), speak → translated track + `/display` text + HLS all confirmed. Done live 2026-08-14: translated audio heard on a separate device via the LiveKit track, and separately `/display` confirmed in-browser — language label, live status dot, real-time text feed matching the actual transcripts, and HLS audio playback actually heard through the page's Listen control (post-0275 bucket fix).
- [x] Test multi-language — two bots simultaneously, no audio bleed. Done live 2026-08-14 (3 tabs: speaker, ES listener, FR listener — `/display` covered separately above, not re-tested per-language here): same speech independently transcribed/translated/published correctly and concurrently by both bots, each listener heard the correct language. See §2.4.
- [~] Test broadcast companion — QR overlay downloaded, scanned on a second device, `/display` landing → language selected → HLS plays. Done live 2026-08-14 through scan → landing → language select → session join (real phone, real service, real Service Manager UI — see §2.5). HLS-plays specifically not re-confirmed on THIS session (no speech was sent into that particular room); already proven separately in §2.7's single-language test. OBS scene compositing still untested (§2.5).
- [x] Deploy via PM2, confirm auto-restart on crash — done repeatedly this session (`pm2 restart`, code changes take effect, `pm2 status` clean)
- [ ] 30-minute concurrent session test — 3 bot sessions on same VPS, monitor CPU/memory/Deepgram WS stability
- [x] Crash test — kill PM2 process mid-session, restart, confirm bot re-joins automatically — `pm2 restart` during an active session repeatedly produced `[index] recovering 1 session(s) from a previous run` followed by a clean rejoin, confirmed in logs multiple times

### Phase 2 Exit Criteria
- [x] Bot pipeline end-to-end — translated track heard, `/display` text updates live, HLS plays (End Wk 4) — confirmed live 2026-08-14. Translate+TTS+publish latency measured well under 3s in every clean run (~1–2s typical; one 18s outlier attributed to a transient network blip, not reproduced since); `/display`'s Realtime text feed and HLS playback both confirmed working in-browser, exact `<200ms` text-update figure not separately instrumented
- [x] Multi-language working — two bots active, two participants on different languages, no audio bleed (End Wk 4) — confirmed live 2026-08-14, see §2.4
- [~] Broadcast companion QR — download → scan → landing → language selected → HLS plays (End Wk 4) — scan-to-session-join chain confirmed live 2026-08-14 on a real phone; OBS scene compositing (the one piece needing the user's own OBS setup) still open
- [ ] VPS stable — 3 concurrent sessions, 30 min, no crash, no leak > 100MB growth (End Wk 5)
- [x] Crash recovery — kill + restart mid-session, bot re-joins automatically (End Wk 5) — confirmed repeatedly via `pm2 restart` during active sessions, `[index] recovering N session(s) from a previous run` firing and rejoining cleanly each time
- [ ] `/display` fully functional on mobile — label, PIN gate, presets, toggle, audio player all working (End Wk 5)

---

<a id="phase-3"></a>
## Phase 3 — Live Pilot: Meetings & Broadcast (Weeks 6–7)

Real sessions with a real congregation, software-only. **Goal:** validate theological accuracy, audio quality, UX, and bot stability over a full service length before investing in Phase 4 hardware work.

**Pilot structure:** RCCG Harvest Centre HCMC · interactive meeting (not broadcast, initially) · EN→VI primary (+ second pair if bilingual members available) · remote speaker via standard LiveKit meeting · congregation selects translated audio from picker · family members test `/display` from home · 20-min section, then full 60-min service if it passes · Week 7 adds a short OBS broadcast test with QR overlay for external viewers · success = ≥80% intelligible utterances, bot stable for full session, participants navigate the picker unaided.

### Pre-Pilot Checklist
- [ ] Confirm LiveKit room name format matches what BC dashboard passes to `start_bot_session` (Tola/Dev)
- [ ] Enter speaker participant identity in `language_configs.speaker_identity` before the meeting — designated mode, avoid auto-detect for pilot (Tola)
- [ ] Pre-test bot join/leave in a private room with no audience — confirm no audio artefacts
- [ ] Confirm VPS PM2 shows bot service "online" before every session — add to pre-service checklist
- [ ] Brief remote speaker to pause 1–2s between sentences (helps Deepgram sentence-boundary detection) (Tola)
- [ ] Run 20-minute translated section — all participants using audio picker, debrief immediately after (Tola/Dev)
- [ ] Run full 60-minute service if 20-min pilot passes — monitor dashboard bot status throughout (Tola)
- [ ] Run broadcast pilot (Week 7) — OBS + QR overlay, invite external viewers, confirm `/display` loads fast on mobile (Tola/Dev)
- [ ] Export `translation_logs`, review STT/translate/TTS latency breakdown — identify slowest stage (Tola)
- [ ] Collect structured feedback — separate forms for in-meeting participants vs `/display`-only users (Tola)

### Phase 3 Exit Criteria
- [ ] Live meeting pilot complete — 20-min, ≥80% intelligible, no bot crash (End Wk 6)
- [ ] Full service length stable — 60-min, no drift/crash/audio overlap (End Wk 7)
- [ ] Broadcast pilot complete — external viewers confirm `/display` + HLS audio via QR (End Wk 7)
- [ ] Pilot feedback collected — structured feedback all participant types, latency data exported (End Wk 7)
- [ ] **Go/no-go for Phase 4** — core product validated, decision made to proceed with PA integration (End Wk 7)

---

<a id="phase-4"></a>
## Phase 4 — PA System Integration: Edge Agent (Weeks 8–12)

Premium add-on. DB schema, device auth RPCs, device management UI, and `/display` route are **already built** (Phase 1) — this phase is purely edge agent software + hardware integration.

### 4.1 Hardware Setup
- [ ] Procure USB audio interface — Behringer UCA222 (~$30) or Focusrite Scarlett Solo (~$60)
- [ ] Wire interface to mixer (AUX SEND → LINE IN, LINE OUT → AUX RETURN or spare channel)
- [ ] Laptop-jack fallback path documented if no interface (pink=mic in from AUX SEND, green=headphone out to AUX RETURN, ~$5 TRS→6.35mm adapters, start AUX SEND 10–15% to avoid clipping; combo/TRRS single-port laptops **require** a USB interface, no software workaround)

### 4.1b Sound Engineer / Feedback Safety (HIGH risk — only from Phase 4 on)
- [ ] Pre-service line check procedure documented + rehearsed with sound engineer (5-step, PA muted → AUX SEND 50% → confirm VU meter → start session → confirm translated audio NOT yet on PA → slowly raise AUX RETURN → pull to zero immediately on any whine/echo)
- [ ] Confirm AUX RETURN channel excluded from all AUX send buses (mixer-specific: analogue → dedicated Stereo Return; digital (X32/SQ) → exclude via routing scene; small mixer w/ no dedicated return → spare channel, AUX send taped to zero)
- [ ] "If feedback happens" runbook shared with sound engineer (pull AUX RETURN to zero → original PA audio unaffected → `/display` text stays live via Realtime → End Session in app → fix path → re-run check → restart)

### 4.2–4.3 Edge Agent — `rekindle-translator`
- [ ] Scaffold/confirm repo — Electron 28, React 18, TS, Vite; `@deepgram/sdk`, `node-audiorecorder`, `speaker`, `fluent-ffmpeg`, `electron-store`, `@supabase/supabase-js`
- [ ] AudioRecorder (sox Windows / arecord Linux) → 16kHz mono PCM → Deepgram Nova-2 streaming STT (identical to bot pipeline)
- [ ] `on is_final` → GPT-4o → ElevenLabs TTS, PCM split to (1) Speaker node → USB interface → PA, (2) ffmpeg HLS writer → Supabase Storage
- [ ] `device_insert_log` RPC per utterance — same RPC, same `/display`, same billing as bot pipeline
- [ ] Drift watchdog (queue > 3 → flush oldest + log) and silence detector (30s no audio → pause pipeline)

### 4.4 First-Run Setup Wizard
- [ ] Step 1 — paste device key → `authenticate_device` RPC → confirm connected
- [ ] Step 2 — select audio input/output device
- [ ] Step 3 — test tone through output → confirm signal reaches mixer AUX RETURN
- [ ] Step 4 — combo-jack detection: single TRRS port → mandatory USB interface warning
- [ ] Step 5 — show `/display` link + QR for this device's ministry

### 4.5 Tier 2 — Multi-Language PA
- [ ] Support multiple edge agents (separate PCs, or one PC with two USB interfaces — advanced) under one `service_id`, each independent, each with its own `/display` + HLS + QR

### 4.6 Task Checklist
- [ ] Combo-jack detection confirmed in first-run wizard
- [ ] Deepgram streaming STT tested from USB interface on Windows (confirm `sox.exe` bundled + found at startup)
- [ ] Deepgram streaming STT tested from USB interface on Linux/Zorin (`arecord -l` confirms interface, `hw:N,0` selected)
- [ ] Full pipeline wired: USB mic → STT → GPT-4o → ElevenLabs → USB output; 5-min round-trip test through mixer
- [ ] ffmpeg HLS writer wired (reuse bot's HLS logic) — `device_update_session` called with URL
- [ ] `device_insert_log` wired per utterance
- [ ] Drift watchdog + silence detector implemented
- [ ] First-run setup wizard built end-to-end
- [ ] Windows NSIS installer generated (bundles `sox.exe` + `ffmpeg.exe`) — test on clean Windows 10 VM
- [ ] Linux AppImage + `.deb` generated — test on Zorin OS 18
- [ ] `electron-updater` configured with GitHub Releases
- [ ] Hardware pilot run — speak into PA mic → hear translated audio through PA speakers + `/display` updates; pre-service rehearsal first, then live with congregation (Tola)
- [ ] Feedback-loop check per §4.1b run and passed; working AUX SEND/RETURN levels documented for this mixer (Tola)
- [ ] 90-minute stability test through mixer — no drift/overlap/crash
- [ ] Hardware pilot feedback collected, compared against Phase 3 bot-only pilot (Tola)

### Phase 4 Exit Criteria
- [ ] Edge agent installs cleanly — Windows + Linux installers work on clean machines, device key auth succeeds (End Wk 9)
- [ ] PA audio loop working — round-trips through USB interface, no feedback, AUX RETURN heard through PA (End Wk 10)
- [ ] 90-min stability test — `/display`, HLS, and PA audio all stable for full service length (End Wk 11)
- [ ] Hardware pilot complete — live session with congregation, ≥80% intelligibility, feedback collected (End Wk 12)

---

<a id="phase-5"></a>
## Phase 5 — Packaging, Billing & Multi-Ministry Rollout (Weeks 13–16)

Productise both pipelines, add billing, roll out to 10 pilot churches across Asia. Each church picks their entry point — bot only, or bot + edge agent.

### 5.1 Billing
- [ ] Translation-minute counter + billing UI on BC dashboard (usage card, cap alerts at 80% of monthly cap)
- [ ] Aggregate `translation_logs` by `ministry_id`, split by `source_type` (bot vs edge agent minutes)
- [ ] Wire billing to existing PayPal integration
- [ ] Pricing: $49/mo (≤5 hrs) · $79/mo (≤15 hrs) · pay-as-you-go above; PA add-on suggested $99/mo (bot + PA)

### 5.2 Rollout Prep
- [ ] Print-ready per-language QR PDF export added to service card
- [ ] Service landing page QR (`/display?service_id=:id`) added to service card
- [ ] "Add language" mid-service button (bot sessions) — calls `start_bot_session` for new pair, adds to existing `service_id`
- [ ] Display preferences added to LanguageSettings (default font size, bilingual toggle) — read by `/display` on load
- [ ] Bot + display onboarding guide (PDF) — starting a service, adding language pairs, sharing QR, reading the dashboard (Tola)
- [ ] PA system wiring + onboarding guide (PDF) — hardware setup, sound engineer tips, pre-service check, Tier 2 PA (Tola)
- [ ] Onboarding video (5 min) — bot session start → `/display` QR, then PA add-on walkthrough (Tola)

### 5.3 10-Church Rollout
- [ ] Onboard first 3 pilot churches (bot only) — target Week 13, confirm first live translated meeting within 1 week (Tola)
- [ ] Onboard first PA pilot church (bot + edge agent) — target Week 14, RCCG HCMC already hardware-tested in Phase 4 (Tola)
- [ ] Onboard remaining churches to reach 10 total — target Week 15 (Tola)
- [ ] Collect structured feedback — audio quality, picker UX, display, QR ease, PA vs. bot preference (Tola)
- [ ] Review pilot data, decide v1.0 public launch scope — end of Week 16 (Tola)

### Phase 5 Exit Criteria
- [ ] Billing live — minutes tracked and invoiced for ≥1 church, cap alerts firing (End Wk 13)
- [ ] 3+ churches onboarded (bot) — each with confirmed live translated meeting/broadcast session (End Wk 14)
- [ ] 1+ church onboarded (PA) — edge agent installed, hardware wired, live session confirmed (End Wk 14)
- [ ] 10-church pilot complete — data from all 10, v1.0 launch scope decided (End Wk 16)

---

<a id="phase-6"></a>
## Phase 6 — True Sync Upgrade / Option B (Post-launch, TBD)

Deferred, triggered only by Phase 5 pilot feedback. Upgrades remote listener from HLS (2–8s lag) to LiveKit-based real-time (<500ms sync).

- [ ] **Prerequisite:** Phase 5 complete with ≥3 months production data
- [ ] **Prerequisite:** remote listener feedback explicitly flags sync lag as a real problem (not theoretical)
- [ ] **Prerequisite:** LiveKit infrastructure confirmed sufficient (Ship plan already active, no upgrade needed)
- [ ] Edge agent pipes TTS audio to LiveKit Ingress (instead of/alongside HLS)
- [ ] `/display` route joins a LiveKit data channel for near-real-time audio
- [ ] Text + audio timestamped and aligned client-side — subtitle-quality sync

**Estimated effort:** 3–4 weeks (1 dev). **Risk:** LOW — LiveKit already in stack.

---

<a id="risk-register"></a>
## Risk Register

| Risk | Severity | Mitigation | Notes |
|---|---|---|---|
| Audio feedback loop (PA leaks into input) | **HIGH** | AUX SEND/RETURN on separate physical paths; 5-step pre-service check every session (§4.1b); pull AUX RETURN to zero immediately if it occurs — service continues in original language, `/display` text stays live | Only applies from Phase 4 — Phases 1–3 (bot) have **zero** feedback risk, no hardware involved |
| ~~LiveKit audio frame format incompatible with Deepgram (48kHz vs 16kHz)~~ | ~~**HIGH**~~ | **RESOLVED 2026-08-14** — Week-1 spike run live: `AudioStream` resamples to 16kHz internally, no incompatibility. Real risk turned out to be `captureFrame()`'s `InvalidState` error on the publish side, not a format mismatch — see §2.1 item 2 | Closed — full pipeline confirmed working end-to-end with real hardware |
| Laptop combo jack (single TRRS, can't in+out simultaneously) | MEDIUM | Detect in first-run wizard, mandatory USB-interface warning; test before any congregation present | Only Phase 4 — upgrade path is UCA222 (~$30) |
| Bot crashes mid-session | MEDIUM | PM2 auto-restart; crash recovery re-joins active sessions (~5–10s gap); congregation falls back to `/display` text during gap | Implement crash recovery in Phase 2, before pilot |
| Latency exceeds 3s | MEDIUM | Monitor `translation_logs` per utterance; drift watchdog (queue depth >3 → flush oldest); silence detector (30s no audio → pause) | Tune `utterance_end_ms` in Deepgram if sentences feel slow |
| Translation accuracy (theological terms) | MEDIUM | GPT-4o system prompt tuned for ministry register; bilingual QA of 10–15 sentences before each new language pair goes live; `/display` text lets congregation catch errors live | Build a per-language-pair glossary of problem terms iteratively |
| HLS lag noticeable to remote listeners (2–8s) | LOW | Label `/display` audio player "Live with a short delay"; Phase 6 resolves if pilot feedback demands it | Acceptable for sermon context — same as YouTube live |
| Multiple QR codes confuse congregation (Tier 2) | LOW | Service landing page QR (`/display?service_id=:id`) as default — one QR, self-select; language label confirms correct link | Per-language QRs optional for spatially separated groups |
| Older phone can't play HLS audio | LOW | HLS.js polyfill (Android Chrome/Firefox); iOS Safari native HLS; text-only fallback if audio fails | Text display still works even if audio fails |
| VPS capacity exceeded (concurrent bot sessions) | LOW | Monitor CPU/memory during Phase 2 load test; 2 vCPU/4GB handles 5–8 concurrent sessions; add second VPS for Asia scale-out | Hostinger hourly billing allows temporary scale-up for large events |
| API outage (Deepgram/GPT-4o/ElevenLabs) | LOW | Session marked error; `/display` shows "Session paused"; original audio continues unaffected (PA or meeting Original track); no offline fallback in v1 | Requires all three vendors down simultaneously to fully break |
| Service role key exposure | LOW | Bot service key in Hostinger VPS `.env` only, never in repo; CI lint rule blocks key patterns (lesson from July 2026 incident) | Edge agent never holds the service key — only bcrypt-hashed `device_key` |

---

<a id="summary"></a>
## Summary Timeline

| Milestone | Target | Exit Criteria |
|---|---|---|
| Phase 1 complete | Week 2 | DB live, all RPCs deployed, dashboard routes incl. `/display` + device management UI |
| Phase 2 complete | Week 5 | Bot service on VPS; full pipeline (audio + `/display` + HLS) validated; multi-language + broadcast QR working |
| **Phase 3 complete (MVP)** | **Week 7** | Live pilot with real congregation via meeting + broadcast; go/no-go for Phase 4 confirmed — **software-only product validated, no hardware required** |
| Phase 4 complete | Week 12 | Edge agent built, hardware pilot at RCCG HCMC passed, installers on GitHub Releases |
| Phase 5 complete | Week 16 | 10-church Asia pilot done, billing live, both pipelines fully onboarded |
| Phase 6 (Option B) | TBD | True sync remote listener — triggered by Phase 5 pilot feedback |

**Total build window: 16 weeks (Phases 1–5). MVP (end of Phase 3): 7 weeks — bot translation live in meetings/broadcasts, zero hardware.** PA integration (Phase 4) adds 5 weeks as a premium add-on once the core product is field-validated.
