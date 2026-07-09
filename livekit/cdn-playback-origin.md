# CDN playback origin — `stream.<domain>`

The audience (live HLS broadcasts + VOD recordings) must **never** pull segments
directly off the Egress/S3 host — a few hundred viewers on one `.m3u8` will
saturate it. Put a CDN in front of the Egress storage bucket at a stable, branded
host, and make that host the single playback origin for everything.

```
                 write segments (S3 API)
  Egress ───────────────────────────────►  object store (S3 / R2 / MinIO+public)
                                                     ▲  origin pull (cache miss)
  viewers ── https://stream.<domain>/... ──►  CDN ───┘
             (HLS .m3u8 + .ts, VOD)         (edge cache)
```

**Why this host, not the bucket URL:** we write playback URLs into the DB
(`livekit_recordings.playback_url`, `live_channels.hls_playback_url`). If those
point at a raw bucket URL, moving stores later breaks every saved URL. Pointing
them at `stream.<domain>` means you re-point the CDN origin and every existing
recording/broadcast keeps working. All of our playback URLs are built from **one
env var** — `S3_PUBLIC_BASE` — so this is the only thing you set (no code change).

---

## The one thing the app needs

```
S3_PUBLIC_BASE = https://stream.<domain>
```

Set it as a Supabase function secret (used by `livekit-egress`) and in
`livekit/.env`. Every `${S3_PUBLIC_BASE}/<prefix>/index.m3u8` we generate then
comes out branded and CDN-served. Nothing else in the app changes.

---

## Setup (provider-agnostic)

1. **Storage:** ensure the Egress bucket is reachable by the CDN as an origin —
   either public-read, or via the CDN's origin-access mechanism (preferred).
2. **CDN distribution:** origin = the Egress bucket. Enable HTTPS.
3. **DNS:** `stream.<domain>` → the CDN (CNAME/alias). Issue a TLS cert for it.
4. **Cache rules (critical for LIVE HLS):**
   - `*.m3u8` (playlists) → **very short / no cache** (TTL 1–2 s, or `no-cache`).
     A cached playlist strands live viewers on stale segment lists.
   - `*.ts` / `*.mp4` (segments/files) → **long cache** (immutable; TTL hours+).
     Segment filenames are unique, so they never go stale.
5. **CORS (required — hls.js fetches cross-origin):** our players
   ([HlsPlayer](../src/components/HlsPlayer.tsx), [MuxVodPlayer](../src/components/MuxVodPlayer.tsx))
   use **hls.js**, which loads the `.m3u8`/segments via `fetch`/XHR from the app
   origin. The CDN/origin **must** return:
   ```
   Access-Control-Allow-Origin: https://<your-app-domain>   (or *)
   ```
   Native Safari HLS (`<video src>`) doesn't need this, but Chrome/Firefox do — miss
   it and playback fails everywhere except iOS/Safari.
6. **Set `S3_PUBLIC_BASE=https://stream.<domain>`** (secret + `livekit/.env`), redeploy
   `livekit-egress`. Done.

---

## Concrete variants

### Cloudflare + R2 (recommended: cheapest egress, simplest)
- Point Egress `s3` at the R2 S3-compatible endpoint (R2 access key/secret/bucket).
- R2 bucket → **Settings → Public access → Connect a custom domain** = `stream.<domain>`
  (Cloudflare provisions TLS + fronts it with the CDN automatically).
- Cache rules (Rules → Cache Rules): `*.m3u8` → Bypass/short TTL; `*.ts`/`*.mp4` →
  Cache Everything, Edge TTL long.
- CORS: R2 bucket CORS policy allowing your app origin, methods `GET, HEAD`.
- `S3_PUBLIC_BASE=https://stream.<domain>`.

### CloudFront + S3
- Egress `s3` → the real S3 bucket.
- CloudFront distribution, origin = the S3 bucket via **Origin Access Control** (keep
  the bucket private).
- Alternate domain name `stream.<domain>` + ACM cert; Route 53 alias.
- Cache policy: separate behaviors — `*.m3u8` min/max TTL ~1s; `*.ts` long TTL.
- Response headers policy adding the CORS `Access-Control-Allow-Origin`.
- `S3_PUBLIC_BASE=https://stream.<domain>`.

### Dev (local)
Leave `S3_PUBLIC_BASE` unset → it defaults to `${S3_ENDPOINT}/${S3_BUCKET}`
(MinIO, `download` policy already set in docker-compose). No CDN needed locally.

---

## Verify
- After a broadcast/recording, the stored `hls_playback_url` / `playback_url` begins
  with `https://stream.<domain>/`.
- `curl -I https://stream.<domain>/<some>/index.m3u8` → 200, short/no cache-control,
  and an `access-control-allow-origin` header.
- A viewer on Chrome (not just Safari) plays it — confirms CORS is right.
- Segment (`.ts`) responses show `cf-cache-status: HIT` (or CloudFront `Hit`) on
  the second fetch — confirms edge caching (origin stays flat under load).
