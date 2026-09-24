# Rekindle caption agent

On-demand, source-language captions for LiveKit rooms. Separate from the Live
Translation bot (`rekindle-translation-bot`): it never reads or writes any
`translation_*` table and never listens on `bot_dispatch`.

## How it works

1. A participant taps **CC**. The app sets their LiveKit participant attribute
   `captions=on` and calls the `captions-start` edge function with its own
   LiveKit room token.
2. `captions-start` verifies that token, checks the caller is really connected
   to the room, and calls `claim_caption_session` (migration `0372`). A partial
   unique index allows one live session per room, so simultaneous taps start
   exactly one agent. A new session sends `pg_notify('caption_dispatch', …)`.
3. This process `LISTEN`s on `caption_dispatch`, joins the room as a **hidden**
   participant (`caption-agent-<session id>`), and subscribes to every real
   speaker's microphone (and ingress audio, for OBS/RTMP hosts). Translation
   bots (`rlt-bot-*`) and screen-share shadows are ignored.
4. Audio goes to Deepgram only while that participant is an active speaker
   (with 400 ms pre-roll and 1.5 s hangover). Each Deepgram phrase becomes one
   segment with a stable id; interim results update it in place and the final
   result closes it. Segments are published with `publishTranscription`,
   attributed to the speaker's identity and track.
5. The agent stops 3 minutes after the last participant turns CC off, when the
   room ends, or (abuse guard) after 30 minutes with nothing transcribed.
6. Every running minute is added to `caption_usage` (per org, room and UTC
   day). When an org passes `CAPTION_ORG_DAILY_ALERT_MINUTES` in a day, the
   agent logs an alert and platform admins get an in-app notification. There
   is no user-facing cap.

## Deploy (alongside the translation bot on the VPS)

```bash
cd agents/captions
cp .env.example .env   # fill in LiveKit, DATABASE_URL, DEEPGRAM_API_KEY
npm ci
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

- `DATABASE_URL` must be the Supabase **session-mode** pooler string
  (port 5432). The transaction pooler doesn't support `LISTEN`.
- Node 20 needs `--env-file` support (20.6+); the PM2 file passes it.
- Run exactly **one** instance.
- On `SIGTERM` (e.g. `pm2 restart`) the agent leaves its rooms without ending
  the sessions, and resumes them on start-up if it's back within 2 minutes.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `CAPTION_DEEPGRAM_MODEL_EN` | `nova-3` | Model for English rooms |
| `CAPTION_DEEPGRAM_MODEL` | `nova-2` | Model for every other language |
| `CAPTION_IDLE_STOP_MINUTES` | `3` | Stop after nobody has CC on this long |
| `CAPTION_NO_SPEECH_STOP_MINUTES` | `30` | Abuse guard: stop after no speech this long |
| `CAPTION_ORG_DAILY_ALERT_MINUTES` | `3000` | Internal alert threshold per org per UTC day |
