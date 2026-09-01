Cloudflare Worker: r2-signer

Purpose
- Issues short-lived presigned PUT URLs so the browser can upload sermon
  audio/video directly to R2 (`MinistrySermonLibrary.tsx`'s "Upload sermon
  file"), without routing the file bytes through any app server.
- Previously this was a plain Express app (`index.js`, kept for local
  reference only) that was never actually deployed anywhere — nothing
  pointed `VITE_R2_SIGNER_URL` at it, so uploads hit a 405 (the frontend's
  same-origin default `/signed-put` had no real endpoint behind it on
  Cloudflare Pages). `worker.mjs` is the real, deployable version.

Deployment
1. `cd workers/r2-signer && npm install`
2. `npx wrangler login` (if not already authenticated)
3. Add secrets — reuse the same R2 credentials already configured for the
   video-transcode worker / pastor video messages (see
   `supabase/functions/ministry-retention-sweep`'s header comment for
   where those live):
   - `npx wrangler secret put VIDEO_R2_ACCESS_KEY`
   - `npx wrangler secret put VIDEO_R2_SECRET_KEY`
   - `npx wrangler secret put VIDEO_R2_BUCKET`
   - `npx wrangler secret put VIDEO_R2_ENDPOINT`
4. `npx wrangler deploy` (or `npm run deploy`)
5. Confirm both routes attached in the Cloudflare dashboard (Workers &
   Pages → rekindle-r2-signer → Triggers → Routes) — they're declared in
   `wrangler.toml` but the zone needs to already be on your account:
   - `rekindlebc.com/signed-put`
   - `*.rekindlebc.com/signed-put`

No frontend change needed — `MinistrySermonLibrary.tsx` already defaults
to `${window.location.origin}/signed-put`, which these routes now serve.

Verify
```
curl -X POST https://rekindlebc.com/signed-put \
  -H 'Content-Type: application/json' \
  -d '{"key":"sermon-audio/test-ministry/test.txt","contentType":"text/plain"}'
```
Should return `{"signedUrl": "...", "publicUrl": "..."}`, not a 404/405.

Notes
- `key` must start with `sermon-audio/` — the worker rejects anything else
  (containment, since this endpoint has no auth check yet — see the
  "Known limitation" comment at the top of `worker.mjs`).
- If `VIDEO_R2_ENDPOINT` already includes the bucket path in your R2
  config, don't also duplicate it in `VIDEO_R2_BUCKET`'s usage elsewhere —
  the worker normalizes either shape (same fix already applied in
  `ministry-retention-sweep`).
