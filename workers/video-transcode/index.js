// Pastor's Video Message — transcode worker
//
// Runs on compute YOU provision (a small VM/container with ffmpeg + Node 18+
// installed — this cannot run inside a Supabase Edge Function; Deno Deploy
// has no ffmpeg/native-binary execution). It polls `ministry_video_messages`
// for status='processing' rows, downloads the raw upload from R2, transcodes
// to an HLS ladder + thumbnail + WebVTT captions, uploads the results back to
// R2, and flips status to 'ready' (or 'error' on failure).
//
// SETUP
//   1. Install ffmpeg on this host (e.g. `apt-get install ffmpeg` on Debian/
//      Ubuntu) and confirm `ffmpeg`/`ffprobe` are on PATH.
//   2. `npm install` in this folder.
//   3. Copy `.env.example` to `.env` (or set these as real environment
//      variables) and fill in real values.
//   4. `node index.js` — runs forever, polling every POLL_INTERVAL_MS.
//      Use pm2/systemd/a Docker restart policy to keep it alive.
//
// ENV VARS REQUIRED
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   VIDEO_R2_ACCESS_KEY, VIDEO_R2_SECRET_KEY, VIDEO_R2_BUCKET,
//   VIDEO_R2_ENDPOINT, VIDEO_R2_REGION (R2 accepts "auto")
//   VIDEO_PUBLIC_BASE   e.g. https://media.yourdomain.com (CDN-fronted R2
//                       custom domain — same pattern as LiveKit's
//                       S3_PUBLIC_BASE, see livekit/cdn-playback-origin.md)
//   OPENAI_API_KEY      for Whisper captions (same key used elsewhere in
//                       this repo — reused, not a new dependency)
//
// SCALING — safe to run more than one instance of this worker (e.g. on a
// second box) once one instance can't keep up. Jobs are claimed atomically
// via the claim_ministry_video_transcode_jobs() SQL function (migration
// 0257 — FOR UPDATE SKIP LOCKED), so two instances polling at once can't
// grab the same row.

import 'dotenv/config'; // loads .env into process.env — must run before any env() calls below
import { createClient } from '@supabase/supabase-js';
// supabase-js always spins up a realtime/WebSocket client internally (even
// though this worker never subscribes to anything) and Node 20 doesn't expose
// a native WebSocket the way it expects — only Node 22+ does. Pass the `ws`
// package explicitly so client construction doesn't throw on Node 18/20.
import ws from 'ws';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import path from 'node:path';
// Node 18+ has fetch/FormData/Blob as globals (via undici) — no node-fetch
// dependency needed.

const execFileAsync = promisify(execFile);

const POLL_INTERVAL_MS = 15_000;
const RENDITIONS = [
  { name: '360p', width: 640, height: 360, videoBitrate: '800k', audioBitrate: '96k' },
  { name: '720p', width: 1280, height: 720, videoBitrate: '2500k', audioBitrate: '128k' },
  { name: '1080p', width: 1920, height: 1080, videoBitrate: '5000k', audioBitrate: '128k' },
];

const env = (name, fallback) => process.env[name] ?? fallback;

const supabase = createClient(
  env('SUPABASE_URL'),
  env('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: ws } },
);

const s3 = new S3Client({
  region: env('VIDEO_R2_REGION', 'auto'),
  endpoint: env('VIDEO_R2_ENDPOINT'),
  credentials: {
    accessKeyId: env('VIDEO_R2_ACCESS_KEY'),
    secretAccessKey: env('VIDEO_R2_SECRET_KEY'),
  },
  forcePathStyle: true,
});
const BUCKET = env('VIDEO_R2_BUCKET');
const PUBLIC_BASE = env('VIDEO_PUBLIC_BASE');
// Identifies which instance claimed a job — visible in claimed_by if you
// need to debug which box picked up a given video.
const WORKER_ID = `${hostname()}-${process.pid}`;

async function main() {
  console.log('[video-transcode] worker started, polling every', POLL_INTERVAL_MS, 'ms');
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await processNextBatch();
    } catch (err) {
      console.error('[video-transcode] batch error:', err);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function processNextBatch() {
  // Atomic claim (FOR UPDATE SKIP LOCKED under the hood) — safe when more
  // than one worker instance polls at the same time; see migration 0257.
  const { data: jobs, error } = await supabase.rpc('claim_ministry_video_transcode_jobs', {
    p_limit: 3,
    p_worker_id: WORKER_ID,
  });

  if (error) throw error;
  if (!jobs || jobs.length === 0) return;

  for (const job of jobs) {
    await processOne(job).catch(async (err) => {
      console.error(`[video-transcode] job ${job.id} failed:`, err);
      await supabase.from('ministry_video_messages').update({
        status: 'error',
        processing_error: String(err?.message ?? err),
        updated_at: new Date().toISOString(),
      }).eq('id', job.id);
    });
  }
}

async function processOne(job) {
  const { id: videoId, ministry_id: ministryId, raw_storage_key: rawKey } = job;
  console.log(`[video-transcode] processing ${videoId}`);

  const workDir = await mkdtemp(path.join(tmpdir(), `video-${videoId}-`));
  try {
    const ext = path.extname(rawKey) || '.mp4';
    const rawPath = path.join(workDir, `original${ext}`);
    await downloadFromR2(rawKey, rawPath);

    const durationSeconds = await probeDurationSeconds(rawPath);

    const hlsDir = path.join(workDir, 'hls');
    await execFileAsync('mkdir', ['-p', hlsDir]);
    const variantPlaylists = [];
    for (const r of RENDITIONS) {
      const variantDir = path.join(hlsDir, r.name);
      await execFileAsync('mkdir', ['-p', variantDir]);
      await transcodeRendition(rawPath, variantDir, r);
      variantPlaylists.push(r);
    }
    const masterPlaylist = buildMasterPlaylist(variantPlaylists);
    await writeFile(path.join(hlsDir, 'master.m3u8'), masterPlaylist, 'utf8');

    const thumbnailPath = path.join(workDir, 'thumbnail.jpg');
    await extractThumbnail(rawPath, thumbnailPath, durationSeconds);

    const audioPath = path.join(workDir, 'audio.mp3');
    await extractAudio(rawPath, audioPath);
    const captionsVtt = await transcribeToVtt(audioPath).catch((err) => {
      // Captions are a nice-to-have, not required for the video to be watchable
      // — don't fail the whole job if Whisper errors (rate limit, etc).
      console.warn(`[video-transcode] captions failed for ${videoId}, continuing without:`, err.message);
      return null;
    });

    const prefix = `processed/${ministryId}/${videoId}`;
    let bytesUploaded = await uploadDirToR2(hlsDir, `${prefix}/hls`);
    bytesUploaded += await uploadFileToR2(thumbnailPath, `${prefix}/thumbnail.jpg`, 'image/jpeg');
    let captionsUrl = null;
    if (captionsVtt) {
      const vttPath = path.join(workDir, 'captions.vtt');
      await writeFile(vttPath, captionsVtt, 'utf8');
      bytesUploaded += await uploadFileToR2(vttPath, `${prefix}/captions.vtt`, 'text/vtt');
      captionsUrl = `${PUBLIC_BASE}/${prefix}/captions.vtt`;
    }

    await supabase.from('ministry_video_messages').update({
      status: 'ready',
      playback_url: `${PUBLIC_BASE}/${prefix}/hls/master.m3u8`,
      thumbnail_url: `${PUBLIC_BASE}/${prefix}/thumbnail.jpg`,
      captions_url: captionsUrl,
      duration_seconds: Math.round(durationSeconds),
      processing_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', videoId);

    // Best-effort — a metering failure shouldn't fail a job that otherwise
    // transcoded and published fine.
    await supabase.rpc('increment_ministry_usage', {
      p_ministry_id: ministryId,
      p_bytes_delta: bytesUploaded,
    }).catch((err) => console.warn(`[video-transcode] usage metering failed for ${videoId}:`, err.message));

    console.log(`[video-transcode] ${videoId} -> ready (${bytesUploaded} bytes)`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

// ── ffmpeg steps ──────────────────────────────────────────────────────────

async function probeDurationSeconds(inputPath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', inputPath,
  ]);
  return parseFloat(stdout.trim()) || 0;
}

async function transcodeRendition(inputPath, outDir, rendition) {
  await execFileAsync('ffmpeg', [
    '-y', '-i', inputPath,
    '-vf', `scale=${rendition.width}:${rendition.height}:force_original_aspect_ratio=decrease,pad=${rendition.width}:${rendition.height}:(ow-iw)/2:(oh-ih)/2`,
    '-c:v', 'h264', '-b:v', rendition.videoBitrate, '-c:a', 'aac', '-b:a', rendition.audioBitrate,
    '-hls_time', '6', '-hls_playlist_type', 'vod',
    '-hls_segment_filename', path.join(outDir, 'seg%03d.ts'),
    path.join(outDir, 'playlist.m3u8'),
  ]);
}

function buildMasterPlaylist(renditions) {
  const bandwidthFor = (r) => (parseInt(r.videoBitrate) + parseInt(r.audioBitrate)) * 1000;
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3'];
  for (const r of renditions) {
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidthFor(r)},RESOLUTION=${r.width}x${r.height}`);
    lines.push(`${r.name}/playlist.m3u8`);
  }
  return lines.join('\n') + '\n';
}

async function extractThumbnail(inputPath, outPath, durationSeconds) {
  const seekTo = Math.min(3, Math.max(0, durationSeconds * 0.1));
  await execFileAsync('ffmpeg', ['-y', '-ss', String(seekTo), '-i', inputPath, '-vframes', '1', '-q:v', '3', outPath]);
}

async function extractAudio(inputPath, outPath) {
  await execFileAsync('ffmpeg', ['-y', '-i', inputPath, '-vn', '-acodec', 'libmp3lame', '-ar', '16000', '-ac', '1', outPath]);
}

// ── OpenAI Whisper — reuses the same OPENAI_API_KEY already used elsewhere
// in this repo (translation, TTS, spiritual-companion) ────────────────────

async function transcribeToVtt(audioPath) {
  const apiKey = env('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not set — skipping captions');

  const audioBuffer = await readFile(audioPath);
  const form = new FormData();
  form.set('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'audio.mp3');
  form.set('model', 'whisper-1');
  form.set('response_format', 'vtt');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Whisper API error: HTTP ${res.status} ${await res.text()}`);
  return res.text();
}

// ── R2 (S3-compatible) I/O ───────────────────────────────────────────────

async function downloadFromR2(key, destPath) {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  await new Promise((resolve, reject) => {
    const out = createWriteStream(destPath);
    res.Body.pipe(out);
    res.Body.on('error', reject);
    out.on('finish', resolve);
    out.on('error', reject);
  });
}

async function uploadFileToR2(filePath, key, contentType) {
  const body = await readFile(filePath);
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
  return body.length;
}

async function uploadDirToR2(dirPath, prefix) {
  let bytes = 0;
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      bytes += await uploadDirToR2(full, `${prefix}/${entry.name}`);
    } else {
      const contentType = entry.name.endsWith('.m3u8')
        ? 'application/vnd.apple.mpegurl'
        : entry.name.endsWith('.ts')
        ? 'video/mp2t'
        : 'application/octet-stream';
      bytes += await uploadFileToR2(full, `${prefix}/${entry.name}`, contentType);
    }
  }
  return bytes;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error('[video-transcode] fatal error:', err);
  process.exit(1);
});
