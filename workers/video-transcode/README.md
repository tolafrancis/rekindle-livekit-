# Video transcode worker

Polls `ministry_video_messages` for `status = 'processing'`, downloads the
raw upload from R2, transcodes it to an HLS ladder (360p/720p/1080p) +
thumbnail + WebVTT captions (via OpenAI Whisper), uploads the results back to
R2, and flips the row to `status = 'ready'` (or `'error'` with a message on
failure).

**This must run outside Supabase.** Edge Functions run on Deno Deploy, which
cannot execute ffmpeg or any native binary — this worker needs a real host
(a small VM, container, or your existing server) with ffmpeg installed.

## Setup

1. Install ffmpeg on the host:
   ```bash
   # Debian/Ubuntu
   sudo apt-get update && sudo apt-get install -y ffmpeg
   # confirm
   ffmpeg -version && ffprobe -version
   ```
2. `npm install` in this folder.
3. `cp .env.example .env` and fill in real values (R2 credentials, Supabase
   service role key, `VIDEO_PUBLIC_BASE`, `OPENAI_API_KEY`).
4. Run it:
   ```bash
   node index.js
   ```
   This runs forever, polling every 15 seconds. Use a process manager to
   keep it alive across restarts/crashes, e.g.:
   ```bash
   npm install -g pm2
   pm2 start index.js --name video-transcode
   pm2 save
   pm2 startup   # follow the printed instructions to survive reboots
   ```
   Or run it in a Docker container with `restart: unless-stopped`.

## What it does per job

1. Downloads `raw/{ministryId}/{videoId}/original.<ext>` from R2.
2. Runs ffmpeg three times (360p/720p/1080p) to produce an HLS variant each,
   then hand-writes a `master.m3u8` referencing all three.
3. Extracts a thumbnail frame (~3s in, or 10% into the clip if shorter).
4. Extracts the audio track and sends it to OpenAI's Whisper API
   (`response_format: 'vtt'`) for captions — reuses the same `OPENAI_API_KEY`
   already used elsewhere in this repo. If this step fails (rate limit, no
   key set, etc.) the job still completes successfully, just without
   captions — this isn't allowed to block the video from becoming watchable.
5. Uploads everything to `processed/{ministryId}/{videoId}/...` in R2.
6. Updates the `ministry_video_messages` row: `status`, `playback_url`
   (the `master.m3u8`), `thumbnail_url`, `captions_url`, `duration_seconds`.

## Scaling notes

- Jobs are claimed atomically via `claim_ministry_video_transcode_jobs()`
  (migration `0257_video_transcode_job_claim.sql` — `FOR UPDATE SKIP LOCKED`
  under the hood), so it's safe to run more than one instance of this worker
  concurrently (e.g. a second box) once one instance can't keep up. A claimed
  row that never finishes (worker crashed mid-job) becomes reclaimable by
  another instance after 30 minutes (`p_stale_after_minutes`), so a dead
  worker doesn't strand a job forever.
- Still a simple poll loop, not a message queue — fine for the volume a
  church media team actually produces. Don't reach for Redis/BullMQ/RabbitMQ
  until you've actually seen a backlog that isn't draining (check
  `select count(*) from ministry_video_messages where status = 'processing'`)
  — a second worker instance is the first lever, not a new broker.
- Transcoding three renditions serially keeps CPU/memory predictable on a
  small host; if jobs pile up even with two instances, the fix is a bigger
  host or running renditions in parallel (trade memory for speed), not
  re-architecting this script.
