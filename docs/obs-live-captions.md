# Live translated captions with OBS

How ReKindle Live Translation captions work when a meeting or broadcast is fed
from OBS, and how to get them into the OBS video itself.

## The pipeline

```
 OBS (camera + mic)
   │  RTMP (livekit-ingress stream key)
   ▼
 LiveKit room (broadcast / meeting) ──▶ egress ──▶ HLS viewers, simulcast (YouTube/Facebook…), recording
   │
   ▼
 translation bot  (rekindle-translation-bot, separate repo)
   speech-to-text ─▶ translate ─▶ text-to-speech
   │
   ├─ finished lines ──▶ translation_logs            (INSERT, Supabase Realtime)
   └─ live words     ──▶ translation_sessions.interim_text (UPDATE; same-language caption sessions only)
   │
   ▼
 anything that subscribes:  in-app caption buttons · /display/:sessionId · /obs-captions/:sessionId
```

The OBS integration closes the loop: `/obs-captions/:sessionId` is added to OBS
as a **Browser Source**. OBS composites it over the video, so captions become
part of OBS's program output:

```
 OBS ─▶ App ─▶ transcription ─▶ translation ─▶ /obs-captions (Browser Source in OBS)
  ▲                                                       │
  └────────────── composited into OBS output ◀────────────┘
                   │
                   ├─▶ RTMP into ReKindle (→ HLS, simulcasts, cloud recording)
                   ├─▶ OBS local recording
                   └─▶ any platform OBS streams to directly
```

## The four caption modes

| # | Mode | Who sees it | Can viewers turn it off? | How |
|---|------|-------------|--------------------------|-----|
| 1 | **App-only captions** | People watching in the ReKindle app / `/display` | Yes (their own toggle) | Existing caption buttons (`FloatingTranslationButton`, `BroadcastTranslationButton`) and `/display/:sessionId`. Nothing reaches the video. |
| 2 | **OBS overlay** | Whatever OBS outputs while the source is visible | No, but the **operator** can hide the source live | `/obs-captions/:sessionId` as an OBS Browser Source. |
| 3 | **Burned in** | Everyone downstream, permanently, incl. recordings | No | Mode 2 with the overlay visible in OBS program. Because OBS feeds the ReKindle ingest, the captions are in the ingested video and therefore in HLS, simulcasts and cloud recordings, plus OBS's own recording. |
| 4 | **Separate caption track** | Viewers on platforms that read CEA-608 (YouTube, Twitch) | Yes (the platform's CC button) | `/obs-captions/...?cc=1`: the page sends each finished line to OBS through obs-websocket `SendStreamCaption`, and OBS embeds it as CEA-608 closed captions. |

Modes 2 and 3 are the same mechanism. The difference is only whether the
overlay is visible when OBS is streaming or recording. OBS has one program
output, so anything visible there is in every output.

### Mode 4 limitations
- CEA-608 survives only when **OBS streams directly** to the platform. The
  ReKindle RTMP ingest re-encodes the video, which drops embedded captions. So
  for ReKindle viewers use modes 1–3. A setup that streams to ReKindle *and*
  YouTube at once (OBS multi-output plugin) gets CC only on the YouTube output.
- CEA-608 carries basic Latin text (and some Western European accents) only.
  Vietnamese tone marks, Thai, Hindi, Tamil, CJK and similar scripts won't
  survive; burn them in (mode 3) instead.
- OBS only transmits captions while it is streaming.
- Lines are split into ≤64-character chunks (a 608 caption shows at most 32
  characters per row) and queued in OBS.

## Setting it up (operator)

1. Start the translation service as usual (Live Translation → Services).
2. On the running language row, click **Captions in OBS** (the CC icon), pick
   what to show, and copy the Browser Source URL.
3. In OBS: **+ → Browser**, paste the URL, set width/height to the canvas
   (e.g. 1920×1080), and keep the source above the video in the list.
4. For mode 4, enable **Tools → WebSocket Server Settings** in OBS, turn on
   "Also send as closed captions" in the dialog and enter the port/password.
   The password goes in the URL *fragment* (`#obsws=…`), which browsers never
   send to a server, so it never reaches ReKindle.

### URL options

`/obs-captions/:sessionId?show=translated|original|both&lines=1-3&size=<px>&pos=bottom|top&style=box|outline&clear=<s>&interim=0|1&debug=1&cc=1&obsport=<port>#obsws=<password>`

`debug=1` shows the feed status, obs-websocket status and the **measured caption lag**.

## Latency and synchronisation

Captions always trail speech by the recognition and translation time,
typically **1.5–3 s**. It breaks down as:
- **RTMP ingest:** about 0.5–1 s, when the bot listens to the OBS feed.
- **End-of-sentence detection and speech-to-text.**
- **Translation:** the bot reports it as `stt_ms` and `translate_ms` on each `translation_logs` row.
- **Realtime delivery:** usually well under 0.5 s.

To keep latency low:
- The overlay uses Supabase Realtime pushes, not polling.
- It shows live words (`interim_text`) as soon as they're heard for
  same-language caption sessions.
- The Browser Source renders locally inside OBS, so no extra encode or network
  hop is added.

**Getting captions exactly on the speaker's lips:** delay the *video* in OBS by
the caption lag, so captions and picture line up. This only works if the
translation hears the speaker **before** OBS delays anything:

- **If the bot listens to the OBS stream** (the usual meeting/broadcast
  setup), delaying OBS delays the audio the bot hears by the same amount, so
  the captions move with it. Captions will simply trail by a couple of
  seconds, as TV live captions do. That is normal and acceptable for most
  uses.
- **For tight sync,** start the translation from a **Speaker Link**
  (`/speak/...`) on the OBS computer, using the same microphone. The bot then
  hears the speaker live. Open the overlay with `&debug=1`, read the measured
  lag, and in OBS:
  - add **Filters → Video Delay (Async)** (or **Render Delay**, up to 500 ms)
    to the camera source, set to that lag;
  - set the same **Sync Offset** on the mic (Advanced Audio Properties).

  Captions and speaker then leave OBS together.

## Not built (yet)

- **Server-side burn-in for non-OBS sources** (a browser host with no OBS). It
  would need a custom LiveKit egress template: a web page LiveKit's egress
  renders, containing the room grid plus this same caption layer, passed to
  `startRoomCompositeEgress` / web egress via `customBaseUrl`. It would give
  modes 3 (and a delayed-video sync option) for HLS/simulcast/recording
  without OBS.
- **A WebVTT caption track in ReKindle's own HLS output** (mode 4 for in-app
  viewers). LiveKit egress doesn't write subtitle renditions. It would need a
  job that turns `translation_logs` into WebVTT segments alongside the HLS
  playlist. In-app viewers already get toggleable captions via mode 1.
- **Private (PIN) translation sessions.** Like `/display`, the overlay can
  only read public sessions today (RLS, migration 0273).
