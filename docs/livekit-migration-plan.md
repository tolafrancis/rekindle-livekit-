# Daily → Self-Hosted LiveKit Migration Plan

**Status:** In progress — Phases 0–6 built + building green (runtime verify pending live stack). P0 infra; P1 control plane; P2 client swap; P3 moderation + waiting room; P4 consumers wired; P5 recording via Egress; P6 broadcast/Ingress/simulcast + dead-code.
**Decisions locked:** LiveKit for everything · self-hosted · LiveKit Egress replaces Mux (recording + HLS) · LiveKit Ingress replaces Mux RTMP ingest.
**Author aid:** This doc is grounded in the current code (file/line references throughout). Verify a referenced symbol still exists before acting on it.

---

## 0. Progress tracker

Executed phase by phase, each gated on explicit go-ahead. Status legend:
✅ done · 🚧 in progress · ⬜ not started.

| Phase | Title | Status | Deliverables landed |
|---|---|---|---|
| 0 | Infra + spike | 🚧 | `livekit/` infra-as-code (docker-compose + SFU/Egress/Ingress/coturn configs + dev MinIO), disposable browser spike (`livekit/spike/`), dependency-free dev token minter, `VITE_LIVEKIT_URL` in [.env.example](../.env.example). **Remaining (ops, off-repo):** actually stand up dev+prod hosts, TLS/domains, run the exit checklist ([livekit/README.md](../livekit/README.md)). |
| 1 | Control plane (tokens/grants) | 🚧 | `livekit-token` edge fn ([supabase/livekit-token/index.ts](../supabase/livekit-token/index.ts)) — server-side role derivation across `meetings`/`ministry_video_meetings`/`live_channel_video_meetings`/`live_channels`/`live_channel_speakers`, grant matrix as code, **auth hole closed** (client `isOwner` ignored), lock + waiting-room gates, `grant-publish`/`delete-room`/`create-room` actions. Waiting-room table ([0145_meeting_waiting_room.sql](../supabase/migrations/0145_meeting_waiting_room.sql)). `livekit-client` added to [package.json](../package.json). **Blocked/deferred:** `npm install` pending (disk full — ENOSPC); paste fn + set secrets + run migration in dashboard; **1F** client two-step collapse lands with Phase 2 (needs the LiveKit wrapper); co-host issuance-time grant deferred to Phase 3 set-role. |
| 2 | Client engine swap | 🚧 | **Built (new, orphan → build stays green on Daily):** `LiveKitRoomWrapper` ([src/lib/LiveKitRoomWrapper.ts](../src/lib/LiveKitRoomWrapper.ts)) implementing the §9 interface — owns a livekit `Room`, emits `NormalizedParticipant`, no raw call object, event→callback map, data channel. Normalized types + `IVideoRoomWrapper` ([src/types/videoRoom.ts](../src/types/videoRoom.ts)). Backend flag + lazy factory ([src/lib/videoBackend.ts](../src/lib/videoBackend.ts)) + `VITE_VIDEO_BACKEND` in [.env.example](../.env.example). **Hook wired + builds green** (`livekit-client@2.20.1` installed; LiveKit engine code-splits into its own chunk, only loaded when the flag is on): `useVideoRoom` alias export; `new EnhancedDailyVideoWrapper`→`await createVideoWrapper`; dual-path `updateParticipants`/`syncParticipantStates` (LiveKit pass-through vs Daily convert); backend-agnostic `attachLocalVideoTrack` + join callbacks; all three `getCallObject()` seam reads removed/narrowed (raw call object is `null` on LiveKit); **1F** two-step `createRoom` collapsed to one `livekit-token` call; **1D** `enableSpeakerMedia` calls `grant-publish` first. Typecheck adds **zero** new errors. **Remaining:** runtime verify against a live stack (needs Phase 0 infra up + `livekit-token` deployed + `VITE_VIDEO_BACKEND=livekit`) — the real exit; audio-status polish ([Dailyaudio.tsx:438](../src/components/Dailyaudio.tsx#L438)/[DailyVideoCall.tsx:1116](../src/components/DailyVideoCall.tsx#L1116)) deferred (leak is inert on LiveKit — `callObject` null-guarded); physical file rename optional/cosmetic. |
| 3 | Host controls / roles / waiting room | 🚧 | **Built + building green.** New `livekit-moderation` edge fn ([supabase/livekit-moderation/index.ts](../supabase/livekit-moderation/index.ts)) — server-enforced `mute-track`/`mute-all`/`remove-participant`/`set-role`/`lock` + `admit-waiting`/`reject-waiting`; caller authorized host (DB) or co-host (LiveKit metadata). **3B** enforced controls in the hook now *augment* the advisory message with a `moderate()` call on LiveKit (mute, disable-video, mute-all, disable-all-video, remove, assign-role, lock); advisory controls unchanged (already `publishData`). **3C** LiveKit advisory receive wired via `wrapper.onData` → shared handler (ref). **3E** `getParticipantRole` reads participant metadata (mirrored in `updateParticipants`). **3D** waiting room: `livekit-token` honors `admitted`/`rejected` rows; host mirrors the table via realtime; guest auto-rejoins on admit; admit/reject go through the moderation fn. **3F** seam leaks fixed — [CounsellingVideoSession](../src/components/CounsellingVideoSession.tsx) + [LiveChannelBroadcast](../src/components/LiveChannelBroadcast.tsx) now call hook methods, not raw `callObject`. Zero new type errors. **Remaining:** deploy `livekit-moderation` (paste) + runtime verify (§3G) against a live stack; host-mute gating refinement via `localParticipant.permissions` (currently advisory-driven, works). |
| 4 | Migrate remaining consumers | 🚧 | **Built + building green.** Backend is chosen globally by `VITE_VIDEO_BACKEND` (per-environment rollout, not per-component), so "flipping" = threading correct role-derivation context to every consumer. Added `meetingKind` prop to generic [DailyVideoCall](../src/components/DailyVideoCall.tsx) → hook; [MinistryInteractiveMeetings](../src/components/MinistryInteractiveMeetings.tsx) passes `ministry_meeting`, [LiveChannelInteractiveMeetings](../src/components/LiveChannelInteractiveMeetings.tsx) passes `channel_meeting`. Already correct: [LiveChannelViewer](../src/components/LiveChannelViewer.tsx) (`channel`/viewer), [Dailyaudio](../src/components/Dailyaudio.tsx) + [CounsellingVideoSession](../src/components/CounsellingVideoSession.tsx) (`meeting` default). `MyBookings` renders no video component directly. **Known limitation:** counselling host moderation not wired (no `meetingId`/table in HOST_TABLE) — 1:1 A/V works, host controls degrade to no-op. Broadcast/Viewer small-audience subscribe works; large-audience HLS is Phase 6. **Remaining:** runtime verify with `VITE_VIDEO_BACKEND=livekit` against the live stack. |
| 5 | Recording via Egress | 🚧 | **Built + building green.** New `livekit-egress` edge fn ([supabase/livekit-egress/index.ts](../supabase/livekit-egress/index.ts)) — `start-recording` (room-composite → S3 **HLS segments**, host-authorized, writes a tracking row), `stop-recording` (stopEgress + status), `list-recordings` (from the table, returns `MuxRecording` shape). Tracking table [0146_livekit_recordings.sql](../supabase/migrations/0146_livekit_recordings.sql) (self-hosted = we own the bookkeeping, §6F). Hook `startRecording`/`stopRecording` branch to Egress on LiveKit (egress-id tracked in a ref). [muxStream.getChannelRecordings](../src/lib/muxStream.ts) branches to `livekit-egress list-recordings` (same shape → VOD viewer unchanged). **Completion webhook** — new `livekit-webhook` edge fn ([supabase/livekit-webhook/index.ts](../supabase/livekit-webhook/index.ts), **JWT-off**) verifies `egress_ended` and flips rows to `completed`/`failed` + fills `duration`; wired via `webhook.urls` in [livekit.yaml](../livekit/config/livekit.yaml). **VOD playback** — channel VOD via [MuxVodPlayer](../src/components/MuxVodPlayer.tsx) (engine-agnostic hls.js, plays Egress `.m3u8` as-is). **Meeting VOD wired end-to-end:** `livekit-egress start-recording` derives the meeting table from `context.kind` (§Phase 4), marks the row `recording` + stores `meeting_table`; the webhook writes `recording_url`/`recording_status='completed'`/`duration` back onto the meeting row on completion → [RecordingManager](../src/components/RecordingManager.tsx) shows it unchanged, now with an hls.js path so it plays the Egress `.m3u8` (was a plain `<video>`). Table gained a `meeting_table` column ([0146](../supabase/migrations/0146_livekit_recordings.sql)). **Remaining:** deploy `livekit-egress` + `livekit-webhook` (JWT off) + S3 secrets + migration `0146` (see §18 runbook); public/CDN base for S3 playback URLs. Runtime verify §5. |
| 6 | Broadcast + Ingress + simulcast + dead-code | 🚧 | **Built + building green.** **6A** `livekit-egress` gains `start-hls`/`stop-hls` (room-composite → HLS, sets `live_channels.hls_playback_url`+`is_hls_live`, tracks `hls_egress_id`); client [startChannelBroadcast/stopChannelBroadcast](../src/lib/muxStream.ts); [LiveChannelBroadcast](../src/components/LiveChannelBroadcast.tsx) bridge + endBroadcast branch to Egress, `callObject.startLiveStreaming` **deleted** on LiveKit. **6B** new [livekit-ingress](../supabase/livekit-ingress/index.ts) (create/get/delete RTMP); `provisionChannelStream`/`getChannelStreamCreds`/`deleteChannelStream` branch to it (same `MuxProvision` shape → ChannelStreamConfig unchanged). **6C** `livekit-egress` `add/remove/list-simulcast` = one RTMP Egress per destination; simulcast client branches, `mux_target_id`→`egress_id` (added alongside). **6D** [HlsPlayer](../src/components/HlsPlayer.tsx) relabeled engine-agnostic (plays Egress HLS; 4s segments); [LiveChannelViewer](../src/components/LiveChannelViewer.tsx) already `useVideoRoom` (P4). **6E** deleted `useWebRTC.ts` + `webrtc-signaling-`; `voice_room_participants` dropped ([0147](../supabase/migrations/0147_livekit_channel_streams.sql)). **6F** `channel_streams` table (egress/ingress IDs). **Remaining:** deploy `livekit-ingress` + updated `livekit-egress` + migration `0147`; relabel Mux-worded hints + record-toggle decouple in [ChannelStreamConfig](../src/components/ChannelStreamConfig.tsx) (cosmetic); runtime verify §6G (OBS→Ingress→room→HLS; 1 simulcast target; no orphaned egress/ingress). |
| 7 | Cutover & teardown | ⬜ | — |

---

## 1. Why / what we're replacing

Daily.co powers all real-time video/audio today. Mux powers channel recording + HLS playback + RTMP ingest + simulcast. This plan consolidates **both** onto a single self-hosted LiveKit stack (SFU + Egress + Ingress + TURN).

### 1.1 Current Daily surface area

| Layer | File(s) | Role |
|---|---|---|
| Central hook (~2,200 lines) | [src/hooks/useDailyRoom.ts](../src/hooks/useDailyRoom.ts) | Connection, participants, roles, waiting room, host controls, hand-raise, spotlight/pin, recording, chat glue. Exposes `UseDailyRoomReturn` (~60 members). |
| Media engine | [src/lib/EnhancedDailyVideoWrapper.ts](../src/lib/EnhancedDailyVideoWrapper.ts) | Owns the Daily `callObject`, media lifecycle, preview (raw getUserMedia). |
| Control-plane edge fn | [supabase/daily-room/index.sql](../supabase/daily-room/index.sql) | Room CRUD + token mint + recording start/stop. |
| Cleanup edge fn | [supabase/daily-room-cleanup/index.sql](../supabase/daily-room-cleanup/index.sql) | Reaps expired rooms. |
| Recording client | [src/lib/daily-recordings.ts](../src/lib/daily-recordings.ts), [src/lib/functions/dailyroomindex.ts](../src/lib/functions/dailyroomindex.ts) | Recording helpers. |
| Package dep | [package.json](../package.json) | `@daily-co/daily-js@^0.90.0` |

**Consumer components (6)** call the hook:
- [DailyVideoCall.tsx](../src/components/DailyVideoCall.tsx), [CounsellingVideoSession.tsx](../src/components/CounsellingVideoSession.tsx) — 1:1 / small calls
- [MinistryInteractiveMeetings.tsx](../src/components/MinistryInteractiveMeetings.tsx), [LiveChannelInteractiveMeetings.tsx](../src/components/LiveChannelInteractiveMeetings.tsx), [MyBookings.tsx](../src/components/MyBookings.tsx) — group meetings
- [LiveChannelBroadcast.tsx](../src/components/LiveChannelBroadcast.tsx) / [LiveChannelViewer.tsx](../src/components/LiveChannelViewer.tsx) — broadcast + viewer-only

**Channel streaming (Mux) surface:**
- [src/lib/muxStream.ts](../src/lib/muxStream.ts) — provision/creds/recordings/simulcast client
- [src/lib/muxMeetingStream.ts](../src/lib/muxMeetingStream.ts) — meeting-stream variant
- [src/components/ChannelStreamConfig.tsx](../src/components/ChannelStreamConfig.tsx) — OBS/encoder ingest UI
- [src/components/HlsPlayer.tsx](../src/components/HlsPlayer.tsx) — HLS playback (Mux-tuned)
- [src/components/ChannelRecordingsViewer.tsx](../src/components/ChannelRecordingsViewer.tsx) — VOD list
- [src/lib/simulcastDestinations.ts](../src/lib/simulcastDestinations.ts) + [supabase/channel-simulcast/index.ts](../supabase/channel-simulcast/index.ts) — YouTube/FB restream

### 1.2 Things already NOT on Daily (migration templates / freebies)
- **Chat** is Supabase-backed (`chat_messages` table + realtime), not Daily → survives untouched.
- **`useWebRTC` is dead code** — no component imports it ([src/hooks/useWebRTC.ts](../src/hooks/useWebRTC.ts) + [supabase/webrtc-signaling-/index.sql](../supabase/webrtc-signaling-/index.sql) + `voice_room_participants`). "Retire raw WebRTC" = **deletion**, not migration.
- **Dailyaudio.tsx** uses `useDailyRoom` (audio-only), not the mesh → migrates via the seam like the other consumers.

---

## 2. Architectural strategy: the seam

Keep `UseDailyRoomReturn` as a **stable interface seam**. Swap the implementation beneath it (rename hook → `useVideoRoom`, re-export alias) so the 6 consumers barely change.

### ⚠️ The seam currently leaks
The hook exposes `callObject: DailyCall` (raw Daily) and components call Daily-native methods on it directly. These MUST be fixed, not just the hook internals:

| File | Direct call | Fix in phase |
|---|---|---|
| [CounsellingVideoSession.tsx:269,290,313](../src/components/CounsellingVideoSession.tsx#L269) | `callObject.updateParticipant({setAudio/setVideo})` | 3 → route through hook `muteParticipant`/`disableParticipantVideo` |
| [LiveChannelBroadcast.tsx:482,496](../src/components/LiveChannelBroadcast.tsx#L482) | `callObject.updateParticipant({setAudio})` | 3 |
| [LiveChannelBroadcast.tsx:257,711](../src/components/LiveChannelBroadcast.tsx#L257) | `callObject.start/stopLiveStreaming` | 6 → Egress |
| [DailyVideoCall.tsx:1013–1063](../src/components/DailyVideoCall.tsx#L1013) | `start/stopLiveStreaming`, `participants()` | 6 / 2 |
| [Dailyaudio.tsx:438](../src/components/Dailyaudio.tsx#L438) | `callObject.participants()?.local` | 2 → `getLocalParticipant()` |

**Resolution:** the wrapper stops exposing a raw call object (see §9). `getCallObject()` and `updateParticipant()` are removed; remote control moves to server-side edge functions.

---

## 3. Daily/Mux → LiveKit primitive map

| Concern | Today | LiveKit replacement |
|---|---|---|
| Media engine | `DailyIframe.createCallObject` | `Room` from `livekit-client` |
| Room + token | `daily-room` edge fn (2 API calls) | `livekit-token` edge fn — locally-signed JWT, no network hop |
| Enable mic/cam/screen | `setLocalAudio/Video`, `startScreenShare` | `localParticipant.setMicrophone/Camera/ScreenShareEnabled` |
| Host mute / kick | client `sendAppMessage` (advisory, self-mute) | **server-side** `RoomServiceClient.mutePublishedTrack` / `removeParticipant` (enforced) |
| Roles / spotlight / hand-raise / requests | `sendAppMessage` | `publishData` (data channel) + participant `metadata` |
| Waiting room / knocking | Daily `enableKnocking` | **custom** — token gate + DB queue (LiveKit has no native knock) |
| Meeting recording | `daily-room` start/stop | LiveKit **Egress** (Room Composite → S3) |
| Channel VOD | Mux assets | LiveKit **Egress** output |
| Large-audience broadcast | Daily `startLiveStreaming` → Mux HLS | LiveKit **HLS Egress** → HLS playback |
| RTMP / OBS ingest | Mux RTMP ingest | LiveKit **Ingress** (RTMP/RTMPS or WHIP) → publishes into room |
| Simulcast-out (YouTube/FB) | Mux simulcast targets | **RTMP Egress**, one output per destination |
| Chat | Supabase `chat_messages` | unchanged ✓ |

**Symmetry:** Ingress = streams in · SFU = the room · Egress = streams/recordings out.

---

## 4. Self-hosted infrastructure

Four services to run and keep up (this is the real cost of self-hosted + everything-on-LiveKit):

1. **LiveKit server** (SFU) — Docker.
2. **TURN** — coturn or LiveKit embedded. **#1 self-host risk** (NAT traversal). Validate first.
3. **Egress** — recording + HLS + RTMP-out. Separate service. Bills/consumes until stopped — no managed idle cleanup.
4. **Ingress** — RTMP/WHIP in. Separate service.

Secrets (Supabase function secrets): `LIVEKIT_URL` (ws/wss), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, plus S3/storage creds for Egress output. Client env: `VITE_LIVEKIT_URL`.

> **Deploy note:** Edge functions go live by **pasting into the Supabase dashboard**, not from local files (see project memory `edge-function-deploy-method`). Pull the *deployed* version of `daily-room` before rewriting — it may carry `start-recording`/`stop-recording` actions the repo file lacks.

---

## 5. Phase overview

| Phase | Title | Weight | Gist |
|---|---|---|---|
| 0 | Infra + spike | M | Stand up 4 services; prove 2-peer A/V + 1 recording + 1 OBS ingest before app code. |
| 1 | Control plane (tokens/grants) | M | `livekit-token` edge fn; grant model; **close the auth hole**. Linchpin. |
| 2 | Client engine swap | L | `LiveKitRoomWrapper` behind the seam; `convertParticipant` rewrite. |
| 3 | Host controls / roles / waiting room | L | Server-enforced moderation; data-channel advisory; custom waiting room. |
| 4 | Migrate remaining consumers | S | Flip flag on the other components. |
| 5 | Recording via Egress | M | Replace meeting recording + channel VOD; unwind Mux assets. |
| 6 | Broadcast + Ingress + simulcast + dead-code | L | HLS Egress, RTMP Ingress, per-destination RTMP Egress; delete `useWebRTC`. |
| 7 | Cutover & teardown | S | Remove flags, Daily dep, Mux, secrets. |

Weight: S/M/L = small/medium/large. Phases 3 and 6 are the heaviest; Phase 1 is the most load-bearing.

---

## 6. Phase 0 — Infra + spike

- [ ] Stand up LiveKit server, Egress, Ingress, TURN (dev + prod); TLS/domains.
- [ ] Secrets + `VITE_LIVEKIT_URL` wired.
- [ ] Throwaway spike page: 2 browsers join, publish/subscribe A/V, screen-share, one Egress recording to storage, one OBS RTMP feed via Ingress landing as a room participant.
- **Exit:** all four services proven end-to-end before any refactor. Validate TURN/NAT here — do not discover it in Phase 4.

---

## 7. Phase 1 — Control plane (tokens, grants, room lifecycle)

**Conceptual shift:** LiveKit rooms auto-create on join; tokens are locally-signed JWTs (`AccessToken` from `livekit-server-sdk`) carrying a `VideoGrant`. ~250 lines of Daily room CRUD evaporate; the replacement is *smaller* code.

### 🔒 Close the auth hole (do not port it)
Today [daily-room](../supabase/daily-room/index.sql) trusts the client: [useDailyRoom.ts:496](../src/hooks/useDailyRoom.ts#L496) sends `isOwner: options.isHost` (a browser boolean) and the fn mints an owner token from it. **Any user can request host powers.** Phase 1 derives host status server-side from the DB.

### 1A · Deps & secrets
- [ ] Add `livekit-client` (browser); edge fns import `livekit-server-sdk` (Deno `npm:`/`esm.sh`).
- [ ] Secrets: `LIVEKIT_API_KEY/SECRET/URL`; client `VITE_LIVEKIT_URL`; add to [.env.example](../.env.example).

### 1B · New edge fn `livekit-token` (returns `{ url, token }`)
- [ ] Verify caller via Supabase JWT (`supabase.auth.getUser()`); **ignore any client `isOwner`**.
- [ ] Derive role from DB: host = `meetings.host_id === user.id` (or `live_channels` owner for broadcast); speaker = row in `live_channel_speakers`; else attendee.
- [ ] Sign JWT: `identity = user.id`, `name`, `metadata = JSON({ role })`, `ttl`, grant per matrix.
- [ ] Return env `LIVEKIT_URL` as `url` (constant for all rooms) + JWT.

**Grant matrix (this table _is_ the permission model):**

| Caller | roomJoin | canPublish | canSubscribe | canPublishData | roomAdmin | metadata.role |
|---|---|---|---|---|---|---|
| Host / co-host | ✓ | ✓ | ✓ | ✓ | ✓ | host/co-host |
| Attendee | ✓ | ✓ | ✓ | ✓ | — | attendee |
| Viewer-only | ✓ | ✗ | ✓ | ✓ | — | viewer |
| Promoted speaker | ✓ | ✓ | ✓ | ✓ | — | speaker |
| Egress recorder | ✓ | ✗ | ✓ | ✗ | — | egress (hidden) |

### 1C · Gates (wires Phase 3D)
- [ ] Waiting room on + not host → **don't mint token**; insert `meeting_waiting_room` row; return `{ waiting: true }`.
- [ ] Locked + not host → refuse (enforced at issuance, replacing advisory lock at [useDailyRoom.ts:2001](../src/hooks/useDailyRoom.ts#L2001)).

### 1D · Speaker-promote
- [ ] Viewer-only tokens have `canPublish:false` → SFU rejects publish. `enableSpeakerMedia` ([useDailyRoom.ts:1614](../src/hooks/useDailyRoom.ts#L1614)) needs a server `grant-publish` (`updateParticipant`) step before the client enables mic.

### 1E · Room lifecycle (mostly obsolete)
- [ ] Drop `create-room`/`get-room`/`get-or-create-room` (auto-create). Add `RoomServiceClient.createRoom` only to preset `emptyTimeout`/`maxParticipants`/metadata.
- [ ] `delete-room` → `RoomServiceClient.deleteRoom` (used by `endMeetingForAll`, [useDailyRoom.ts:1769](../src/hooks/useDailyRoom.ts#L1769)).
- [ ] `cleanup-expired-rooms` + [daily-room-cleanup](../supabase/daily-room-cleanup/index.sql) → largely obsolete (auto-close via `emptyTimeout`). Keep a thin reaper only for orphaned Egress/Ingress.

### 1F · Collapse client two-step
- [ ] [useDailyRoom.ts:447-535](../src/hooks/useDailyRoom.ts#L447) `createRoom()` (get-or-create + generate-token, 15s race) → **one** `livekit-token` call. Deletes ~90 lines.

### 1G · Verify
- [ ] Forged `isOwner:true` → attendee token (hole closed). Viewer-only can't publish until `grant-publish`. Locked refuses non-host; waiting-room returns `{ waiting }` + row. Second browser joins with `{ url, token }`.

---

## 8. Phase 2 — Client engine swap (behind the seam)

- [ ] Build `LiveKitRoomWrapper` replacing [EnhancedDailyVideoWrapper.ts](../src/lib/EnhancedDailyVideoWrapper.ts) — see §9 for the interface.
- [ ] Rewrite `convertParticipant` / `updateParticipants` in the hook to read LiveKit `Participant.trackPublications` instead of Daily `participant.tracks`.
- [ ] Keep `UseDailyRoomReturn` identical; rename file → `useVideoRoom.ts` with re-export alias.
- [ ] Fix the local-read seam leak in [Dailyaudio.tsx:438](../src/components/Dailyaudio.tsx#L438) and [DailyVideoCall.tsx:1116](../src/components/DailyVideoCall.tsx#L1116) → `getLocalParticipant()`.
- **Exit:** [DailyVideoCall.tsx](../src/components/DailyVideoCall.tsx) runs on LiveKit behind a feature flag.

---

## 9. `LiveKitRoomWrapper` interface sketch

Preserve method names so the hook body barely changes; stop exposing a raw call object; emit a **normalized participant** so `convertParticipant` stops reading Daily-shaped fields.

```ts
class LiveKitRoomWrapper {
  constructor(callbacks?: WrapperCallbacks);

  // Preview — UNCHANGED (already raw getUserMedia, not Daily): startCameraPreview,
  // stopCameraPreview, startMicrophonePreview, stopMicrophonePreview, stopAllPreviews. ✓

  joinMeeting(url, token, userName, viewerOnly?): Promise<boolean>; // room.connect(url, token)
  leaveMeeting(): Promise<void>;                                     // room.disconnect()
  destroy(): Promise<void>;

  toggleAudio(): Promise<boolean>;   setAudio(on): Promise<boolean>;   // setMicrophoneEnabled
  toggleVideo(): Promise<boolean>;   setVideo(on): Promise<boolean>;   // setCameraEnabled
  startScreenShare(): Promise<boolean>;  stopScreenShare(): Promise<void>; // setScreenShareEnabled

  getParticipants(): Record<string, NormalizedParticipant> | null;   // normalized, not Daily
  getLocalParticipant(): NormalizedParticipant | null;

  sendAppMessage(data, to = '*'): Promise<void>;   // localParticipant.publishData(...)

  // ❌ REMOVED: getCallObject(), updateParticipant()
  //   getCallObject leaked raw Daily to 4 components. Remote control is server-only
  //   in LiveKit → moves to livekit-moderation edge fn (Phase 3). The hook's
  //   `callObject` member becomes a narrow handle or is dropped, so it can't re-leak.
}
```

**Callback → LiveKit event mapping** (constructor wires `room.on(...)`):

| Callback | LiveKit event |
|---|---|
| `onJoined` / `onLeft` | `Connected` / `Disconnected` |
| `onParticipantJoined` / `Left` | `ParticipantConnected` / `ParticipantDisconnected` |
| `onParticipantUpdated` | `ParticipantMetadataChanged`, `TrackMuted/Unmuted` |
| `onTrackStarted` / `Stopped` | `TrackSubscribed` / `TrackUnsubscribed` (+ local publish) |
| `onCameraError` | `MediaDevicesError` |
| `onMediaStateChange` | `LocalTrackPublished` / `Unpublished` |
| *(new)* `onData` | `DataReceived` → feeds Phase 3 advisory handler |

**Normalized participant** (maps 1:1 to `DailyParticipantInfo`, so rendering/spotlight/pin/`participantStates` keep working):

```ts
interface NormalizedParticipant {
  id: string;            // LiveKit identity
  sessionId: string;     // identity or sid
  userName: string;
  isLocal: boolean;
  isOwner: boolean;      // from metadata.role, not Daily `owner`
  hasAudio: boolean; hasVideo: boolean; hasScreenShare: boolean;
  audioTrack?: MediaStreamTrack; videoTrack?: MediaStreamTrack; screenVideoTrack?: MediaStreamTrack;
  joinedAt: Date;
  metadata?: { role?: ParticipantRole };
}
```

---

## 10. Phase 3 — Host controls, roles, waiting room

**Model shift:** today control is client-cooperative — host sends an app-message, the target voluntarily mutes itself ([useDailyRoom.ts:1830-1980](../src/hooks/useDailyRoom.ts#L1830)). LiveKit makes it **server-enforced**.

### 3A · New edge fn `livekit-moderation`
- [ ] `mute-track` (`mutePublishedTrack`), `remove-participant`, `set-role` (`updateParticipant` metadata), `lock` (room metadata). Authorize caller as host/co-host server-side.

### 3B · Rewrite the 12 control functions in `useVideoRoom.ts`
- [ ] **Enforced (→ edge fn):** `muteParticipant`, `muteAll`, `disableParticipantVideo`, `disableAllVideo`, `removeParticipant`, `assignRole`, `lockMeeting`. Keep `participant_states`/`meeting_participants` DB writes.
- [ ] **Advisory (→ `publishData`):** `requestUnmute`, `requestVideo`, `raiseHand`/`lowerHand`, `spotlightParticipant`, `updateMeetingSettings`. `allowUnmute`/`allowVideo` → metadata flips / re-permit publish.

### 3C · Replace receive handler ([useDailyRoom.ts:1791-2065](../src/hooks/useDailyRoom.ts#L1791))
- [ ] Delete enforced cases (self-mute) — client learns from `TrackMuted`/`ParticipantPermissionsChanged`.
- [ ] Keep advisory cases on a `DataReceived` handler.
- [ ] Retire `hostMutedByHost`/`videoDisabledByHost` gating (lines 1658/1698) — derive from `localParticipant.permissions`.

### 3D · Waiting room (custom — no native knock)
- [ ] New table `meeting_waiting_room` (meeting_id, user_id, name, requested_at, status).
- [ ] `livekit-token` gates non-hosts into a row instead of a token (§1C).
- [ ] `useVideoRoom` populates `waitingRoomParticipants` from **Supabase realtime** on that table (mirror the `live_channel_speakers` subscription at [useDailyRoom.ts:213-254](../src/hooks/useDailyRoom.ts#L213)).
- [ ] `admitFromWaitingRoom` → edge fn mints full token → waiting client reconnects. `rejectFromWaitingRoom` → delete row → denied.

### 3E · Roles via metadata
- [ ] `getParticipantRole` reads `participant.metadata` instead of the local Map. `ParticipantRole` / `hasPermission()` from [liveChannelTypes.ts](../src/types/liveChannelTypes.ts) unchanged.

### 3F · Fix seam leaks
- [ ] [CounsellingVideoSession.tsx:269,290,313](../src/components/CounsellingVideoSession.tsx#L269) and [LiveChannelBroadcast.tsx:480-496](../src/components/LiveChannelBroadcast.tsx#L480) → hook methods, not raw `callObject`.

### 3G · Verify
- [ ] Host mute silences a **non-cooperating** client (no audio track publishes). Kicked user can't rejoin a locked meeting. Waiting-room admit/reject round-trips via DB realtime. Hand-raise/spotlight/requests still work.

---

## 11. Phase 4 — Migrate remaining consumers

- [ ] Flip flag: [CounsellingVideoSession.tsx](../src/components/CounsellingVideoSession.tsx), [LiveChannelInteractiveMeetings.tsx](../src/components/LiveChannelInteractiveMeetings.tsx), [MyBookings.tsx](../src/components/MyBookings.tsx), [MinistryInteractiveMeetings.tsx](../src/components/MinistryInteractiveMeetings.tsx), [Dailyaudio.tsx](../src/components/Dailyaudio.tsx).
- [ ] [LiveChannelBroadcast/Viewer](../src/components/LiveChannelBroadcast.tsx): host publishes to LiveKit; small audiences subscribe directly (large-audience path in Phase 6).

---

## 12. Phase 5 — Recording via Egress (retire Mux)

> **Fresh build — no data migration.** There are no existing Mux recordings to move. This phase is *building* the record/store/playback path on LiveKit, not porting old assets.

- [ ] Replace `daily-room` start/stop-recording + [daily-recordings.ts](../src/lib/daily-recordings.ts) with Egress start/stop; write recording rows to the recordings table.
- [ ] Repoint channel VOD ([ChannelRecordingsViewer.tsx](../src/components/ChannelRecordingsViewer.tsx), [HlsPlayer.tsx](../src/components/HlsPlayer.tsx), [muxStream.ts](../src/lib/muxStream.ts)/[muxMeetingStream.ts](../src/lib/muxMeetingStream.ts)) at Egress output.
- ⚠️ Still a full workstream despite no migration: you're rebuilding the record → store → play-back-later pipeline on a new engine (not just the live call), and re-tuning [HlsPlayer.tsx](../src/components/HlsPlayer.tsx) for Egress timing. Easy to under-budget as "recording just moves."

---

## 13. Phase 6 — Broadcast + Ingress + simulcast + dead-code

### 6A · Host broadcast: `startLiveStreaming` → HLS Egress
- [ ] New edge fn `livekit-egress`: `start-hls`, `stop`, `list-recordings` (`EgressClient.startRoomCompositeEgress`).
- [ ] [LiveChannelBroadcast.tsx:224-233](../src/components/LiveChannelBroadcast.tsx#L224) — replace Mux provision with `startChannelBroadcast()` (HLS Egress); keep `hls_playback_url` write.
- [ ] [LiveChannelBroadcast.tsx:257](../src/components/LiveChannelBroadcast.tsx#L257) — **delete** `callObject.startLiveStreaming` (host already publishes; Egress composites).
- [ ] [LiveChannelBroadcast.tsx:870-880](../src/components/LiveChannelBroadcast.tsx#L870) — record toggle → Egress restart.
- [ ] Stop-broadcast calls `livekit-egress stop` (no orphaned Egress).

### 6B · OBS/encoder ingest: Mux → LiveKit Ingress
- [ ] New edge fn `livekit-ingress`: `create`/`get`/`delete` (`IngressClient.createIngress`, RTMP or WHIP), bound to channel room; returns `url` + `streamKey`.
- [ ] [ChannelStreamConfig.tsx:352-369](../src/components/ChannelStreamConfig.tsx#L352) — swap Mux creds for Ingress; fields map: serverUrl→Ingress URL, streamKey→Ingress key, playbackUrl→Egress HLS.
- [ ] [ChannelStreamConfig.tsx:448-455](../src/components/ChannelStreamConfig.tsx#L448) — record toggle decouples (Ingress vs Egress now separate, unlike Mux).
- [ ] Update Mux-worded hints ([ChannelStreamConfig.tsx:276,326,502](../src/components/ChannelStreamConfig.tsx#L276)).

### 6C · Simulcast-out: Mux → RTMP Egress per target
- [ ] Rework [channel-simulcast](../supabase/channel-simulcast/index.ts): `add`/`remove`/`list` manage one RTMP Egress **per destination** (LiveKit has no native third-party simulcast).
- [ ] [muxStream.ts:86-143](../src/lib/muxStream.ts#L86) — keep client signatures; `mux_target_id` → `egress_id`.
- [ ] [simulcastDestinations.ts](../src/lib/simulcastDestinations.ts) — **unchanged** (platform-side URLs). ✓
- [ ] DB: rename `mux_target_id` → `egress_id`.
- ⚠️ Sharpest edge — one Egress per target, started/stopped with the broadcast lifecycle.

### 6D · Viewer path
- [ ] [LiveChannelViewer.tsx:167-173](../src/components/LiveChannelViewer.tsx#L167) — already `useVideoRoom` (Phase 4); confirm subscribe-only grant.
- [ ] [LiveChannelViewer.tsx:909](../src/components/LiveChannelViewer.tsx#L909) `<HlsPlayer>` — `hlsPlaybackUrl` now from Egress. ✓
- [ ] [HlsPlayer.tsx](../src/components/HlsPlayer.tsx) — functionally fine (plays any HLS); retune `targetLatencySeconds` + retry policy for Egress timing; relabel Mux/Daily comments (lines 76, 106, 116, 163).

### 6E · Delete dead raw-WebRTC mesh
- [ ] Delete [useWebRTC.ts](../src/hooks/useWebRTC.ts), [webrtc-signaling-](../supabase/webrtc-signaling-/index.sql); drop `voice_room_participants` (grep first).

### 6F · Data model
- [ ] `live_channels.hls_playback_url` — semantics unchanged (now Egress URL).
- [ ] Store egress/ingress IDs per channel (columns or `channel_streams` table) for start/stop/cleanup — LiveKit self-hosted, you track them yourself.

### 6G · Verify
- [ ] Host live → HLS viewer sees stream. OBS→Ingress→room→HLS. One simulcast target (YouTube unlisted) receives RTMP Egress. Recording lands + shows in [ChannelRecordingsViewer](../src/components/ChannelRecordingsViewer.tsx). Ending stops **all** egress/ingress (no orphans).

**Within-phase order:** 6A→6D (core parity) → 6B (OBS) → 6C (simulcast, riskiest) → 6E (cleanup, anytime).

---

## 14. Phase 7 — Cutover & teardown

- [ ] Remove feature flags.
- [ ] Delete `@daily-co/daily-js`, `daily-room*`, `daily-recordings.ts`, `dailyroomindex.ts`, `EnhancedDailyVideoWrapper.ts`, Daily secrets.
- [ ] Remove Mux functions/libs/secrets (`manage-stream-input`, `MUX_*`).
- [ ] Update project memory: `live-broadcast-recording-architecture` → LiveKit-based.

---

## 15. Risk register

| Risk | Phase | Mitigation |
|---|---|---|
| TURN/NAT traversal fails on self-host | 0 | Prove in the spike before any refactor. |
| Orphaned Egress/Ingress (no managed idle cleanup — bills/consumes) | 6 | Guaranteed stop on leave/crash/tab-close; reaper cron mirroring [daily-room-cleanup](../supabase/daily-room-cleanup/index.sql). |
| Simulcast fan-out (per-destination Egress vs Mux native) | 6C | Budget real work; touches simulcast data model. |
| Building the Mux-equivalent VOD/HLS pipeline on LiveKit | 5 | Treat as its own workstream (record→store→playback + player re-tune). Fresh build = no data migration, which removes a big chunk. |
| Four services to operate (SFU/TURN/Egress/Ingress) | 0/ops | Confirm ops appetite — these are exactly what Cloud would otherwise run. |
| Wrong grant model propagates to every phase | 1 | Get the grant matrix (§7) right first; it's the linchpin. |
| Deployed edge fns differ from repo files | all | Pull live versions from dashboard before rewriting (see §4). |

## 16. Free upgrades from the migration
- Host mute/kick becomes **server-enforced** (was advisory app-messages).
- Meeting **lock** enforced at token issuance (was advisory).
- **Auth hole closed** — host status derived server-side, not from a client boolean.
- Token issuance drops from 2 network calls to a local JWT sign.

## 17. Sequencing note
Phases 0–4 deliver full call/meeting parity and can ship **before** the Mux work (5–6) if you want Daily gone from meetings first. If staging that way, the "Egress for everything now" decision could be softened to "keep Mux for VOD initially" as a phase-ordering hedge — a reconsider point, not a blocker.

---

## 18. Deploy runbook

Everything built in Phases 0–5 is inert until this is done. Order matters. The one
shared secret pair (`LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`) must be **identical**
across the SFU config, all edge fns, and the webhook. Nothing here is auto-verified —
run the exit checks after.

### Step 1 — Infra (SFU / Egress / Ingress / TURN)
- `cd livekit && cp .env.example .env`, edit secrets, `docker compose up -d` ([livekit/README.md](../livekit/README.md)).
- **Replace** the dev secret `devsecret_please_change_me_…` everywhere (`config/*.yaml`, `.env`) with a real ≥32-char secret.
- **Prod:** terminate TLS → `wss://livekit.yourdomain.com`; set `use_external_ip: true` in [livekit.yaml](../livekit/config/livekit.yaml); open the media UDP range; validate TURN/NAT (**do this first — #1 risk**).
- Egress storage: replace dev MinIO with real S3/GCS/Azure; note the **public base URL** for playback.

### Step 2 — Supabase function secrets (Edge Functions → Secrets)
| Secret | Value | Used by |
|---|---|---|
| `LIVEKIT_URL` | `wss://livekit.yourdomain.com` (ws:// for local) | token, moderation, egress, webhook |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | same pair as `livekit.yaml` | all four fns |
| `S3_ACCESS_KEY` / `S3_SECRET` / `S3_BUCKET` / `S3_REGION` / `S3_ENDPOINT` | egress storage creds | egress |
| `S3_PUBLIC_BASE` | public base URL for playback (defaults to `S3_ENDPOINT/S3_BUCKET`) | egress |

`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are project-wide (already set).

### Step 3 — Migrations (SQL editor, in order)
- [0145_meeting_waiting_room.sql](../supabase/migrations/0145_meeting_waiting_room.sql)
- [0146_livekit_recordings.sql](../supabase/migrations/0146_livekit_recordings.sql)
- [0147_livekit_channel_streams.sql](../supabase/migrations/0147_livekit_channel_streams.sql) — ⚠️ also **drops** `voice_room_participants` (dead code)

### Step 4 — Edge functions (paste each; deploy-by-dashboard per project memory)
| Function | JWT verify | Notes |
|---|---|---|
| [livekit-token](../supabase/livekit-token/index.ts) | on (default) | control plane |
| [livekit-moderation](../supabase/livekit-moderation/index.ts) | on | host controls |
| [livekit-egress](../supabase/livekit-egress/index.ts) | on | recording + broadcast HLS + simulcast |
| [livekit-ingress](../supabase/livekit-ingress/index.ts) | on | OBS/encoder RTMP ingest |
| [livekit-webhook](../supabase/livekit-webhook/index.ts) | **OFF** | LiveKit signs it, not Supabase — must disable Verify JWT |

### Step 5 — Point the SFU at the webhook
In [livekit.yaml](../livekit/config/livekit.yaml) set `webhook.urls: [ https://<project-ref>.supabase.co/functions/v1/livekit-webhook ]` and `webhook.api_key` = your `LIVEKIT_API_KEY`, then restart the `livekit` container.

### Step 6 — Client env + flip
- Set `VITE_LIVEKIT_URL` (the `wss://` URL) and `VITE_VIDEO_BACKEND=livekit` in [.env](../.env.example), rebuild (`npm run build`).
- Rollout is **per-environment** (global flag), not per-component. Flip staging first, run the exit checks (§1G, §3G, §5, §6G), then prod.

### Deploy checklist
- [ ] 4 services `Up`; TURN/NAT proven on the real host.
- [ ] Secret pair identical across SFU + all fns; dev secret replaced.
- [ ] Migrations `0145` + `0146` run.
- [ ] 4 edge fns deployed; **webhook has JWT verify OFF**.
- [ ] `webhook.urls` set + container restarted.
- [ ] `VITE_LIVEKIT_URL` + `VITE_VIDEO_BACKEND=livekit` set; rebuilt.
- [ ] Smoke: join → publish A/V → host-mute a non-cooperating client → record → stop → recording flips to `completed` with a duration → VOD plays.
