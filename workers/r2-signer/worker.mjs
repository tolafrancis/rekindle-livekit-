// Cloudflare Worker: r2-signer
// =====================================================================
// Issues short-lived presigned PUT URLs for direct browser → R2 uploads.
// Replaces the old index.js (a plain Express app that was never actually
// deployed anywhere — nothing pointed VITE_R2_SIGNER_URL at it, which is
// why MinistrySermonLibrary.tsx's "Upload sermon file" got a 405: its
// default `${window.location.origin}/signed-put` had no real endpoint
// behind it).
//
// Deployed as its own Worker with routes:
//   rekindlebc.com/signed-put
//   *.rekindlebc.com/signed-put
// Both are more specific than the existing tenant-router Worker's
// `*.rekindlebc.com/*` route, so this one wins for this exact path without
// touching tenant-router at all. Once those routes are live, the frontend
// needs NO changes — it already defaults to same-origin `/signed-put`.
//
// Uses aws4fetch (Web Crypto, works in Workers — Node's aws-sdk does not)
// to presign a PUT URL, same signing approach already used server-side in
// supabase/functions/ministry-retention-sweep for S3-compatible requests.
//
// `publicUrl` is ALSO presigned (a GET, aws4fetch's fixed 24h S3 expiry —
// not configurable, checked node_modules/aws4fetch source), not the bare
// object URL — the ministry-video-messages bucket is private, so a bare
// URL 400s for anyone without credentials, including Deepgram's own
// servers when cf-transcribe hands it `source_url` to fetch by URL
// (confirmed via a real REMOTE_CONTENT_ERROR from a live upload). 24h
// comfortably outlives the 5-minute transcription cron.
//
// Secrets (wrangler secret put): reuse the SAME R2 credentials already
// configured for pastor video messages (VIDEO_R2_* — see
// ministry-retention-sweep's own header comment):
//   VIDEO_R2_ACCESS_KEY, VIDEO_R2_SECRET_KEY, VIDEO_R2_BUCKET,
//   VIDEO_R2_ENDPOINT, VIDEO_R2_REGION (optional, defaults to "auto")
// Falls back to R2_ACCESS_KEY/R2_SECRET_KEY/R2_BUCKET/R2_ENDPOINT if you'd
// rather provision a dedicated set instead of sharing the video ones.
//
// Known limitation carried over from the old version: this endpoint is
// unauthenticated (no ministry membership check) — anyone who discovers
// the URL can request a presigned PUT. Scoped down to the sermon-audio/
// prefix below as cheap containment, but this should get a real auth
// check (e.g. verify a Supabase JWT + ministry membership) before this
// bucket holds anything sensitive.
// =====================================================================

import { AwsClient } from 'aws4fetch';

const KEY_PREFIX = 'sermon-audio/';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// Some deployments' *_ENDPOINT already include the bucket path — same
// double-prefix footgun documented in ministry-retention-sweep/index.ts.
function bucketRootUrl(endpoint, bucket) {
  const trimmed = endpoint.replace(/\/+$/, '');
  return trimmed.endsWith(`/${bucket}`) ? trimmed : `${trimmed}/${bucket}`;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/signed-put') {
      return json({ error: 'not found' }, 404);
    }
    if (request.method !== 'POST') {
      return json({ error: 'method not allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid JSON body' }, 400);
    }

    const key = typeof body?.key === 'string' ? body.key : '';
    const contentType = typeof body?.contentType === 'string' ? body.contentType : 'application/octet-stream';

    if (!key) return json({ error: 'missing key' }, 400);
    if (!key.startsWith(KEY_PREFIX)) {
      return json({ error: `key must start with "${KEY_PREFIX}"` }, 400);
    }

    const endpoint = env.VIDEO_R2_ENDPOINT || env.R2_ENDPOINT;
    const bucket = env.VIDEO_R2_BUCKET || env.R2_BUCKET || 'sermon-audio';
    const accessKeyId = env.VIDEO_R2_ACCESS_KEY || env.R2_ACCESS_KEY;
    const secretAccessKey = env.VIDEO_R2_SECRET_KEY || env.R2_SECRET_KEY;
    const region = env.R2_REGION || env.VIDEO_R2_REGION || 'auto';

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      return json({ error: 'signer misconfigured: missing R2 credentials (set via wrangler secret put)' }, 500);
    }

    const objectUrl = `${bucketRootUrl(endpoint, bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;

    try {
      const client = new AwsClient({ accessKeyId, secretAccessKey, region, service: 's3' });
      const signedPut = await client.sign(objectUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        aws: { signQuery: true },
      });
      const signedGet = await client.sign(objectUrl, {
        method: 'GET',
        aws: { signQuery: true },
      });

      return json({ signedUrl: signedPut.url, publicUrl: signedGet.url });
    } catch (err) {
      console.error('[r2-signer] signing failed:', err?.message || err);
      return json({ error: 'signing failed' }, 500);
    }
  },
};
