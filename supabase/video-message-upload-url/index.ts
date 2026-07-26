// Supabase Edge Function: video-message-upload-url
//
// PURPOSE
//   Mints a presigned R2 (S3-compatible) PUT URL so the browser can upload a
//   recorded/selected video FILE directly to Cloudflare R2 — large video
//   files never pass through this function or Supabase itself, only this
//   short-lived signed URL does.
//
//   Raw uploads land at raw/{ministryId}/{videoId}/original.<ext>. A separate
//   transcode worker (outside Supabase — ffmpeg can't run in Deno Deploy)
//   polls ministry_video_messages for status='processing' and picks the file
//   up from there; see workers/video-transcode/.
//
// DEPLOY
//   supabase functions deploy video-message-upload-url
//
// ENV SECRETS (Supabase Dashboard → Edge Functions)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   auto-injected
//   VIDEO_R2_ACCESS_KEY, VIDEO_R2_SECRET_KEY   R2 API token
//   VIDEO_R2_BUCKET                            e.g. "ministry-video-messages"
//   VIDEO_R2_ENDPOINT                          e.g. https://<account-id>.r2.cloudflarestorage.com
//   VIDEO_R2_REGION                            R2 accepts "auto"

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PRESIGN_EXPIRES_SECONDS = 900; // 15 minutes — plenty for a direct browser PUT

interface RequestBody {
  ministryId: string;
  videoId: string;
  contentType: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { ministryId, videoId, contentType }: RequestBody = await req.json();
    if (!ministryId || !videoId || !contentType) {
      return jsonError('ministryId, videoId, and contentType are required', 400);
    }
    if (!contentType.startsWith('video/')) {
      return jsonError('contentType must be a video/* MIME type', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Confirm the caller is an admin/leader/owner for this ministry before
    // handing out a signed upload URL — this function has no other gate.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError('Missing authorization', 401);
    const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userErr || !user) return jsonError('Unauthorized', 401);

    const { data: isAdmin } = await supabase.rpc('is_group_admin', {
      p_ministry_id: ministryId,
      p_user_id: user.id,
    });
    if (!isAdmin) return jsonError('You do not have permission to upload video messages for this ministry', 403);

    const ext = extensionFor(contentType);
    const key = `raw/${ministryId}/${videoId}/original.${ext}`;

    const accessKey = Deno.env.get('VIDEO_R2_ACCESS_KEY') ?? '';
    const secretKey = Deno.env.get('VIDEO_R2_SECRET_KEY') ?? '';
    const bucket = Deno.env.get('VIDEO_R2_BUCKET') ?? '';
    const endpoint = Deno.env.get('VIDEO_R2_ENDPOINT') ?? '';
    const region = Deno.env.get('VIDEO_R2_REGION') ?? 'auto';

    if (!accessKey || !secretKey || !bucket || !endpoint) {
      return jsonError('Video storage is not configured (VIDEO_R2_* secrets missing)', 500);
    }

    const uploadUrl = await presignS3Put({
      accessKey, secretKey, region, endpoint, bucket, key, contentType,
      expiresSeconds: PRESIGN_EXPIRES_SECONDS,
    });

    // Record the pending upload so the transcode worker (and the admin UI)
    // knows this video exists even before the file finishes uploading.
    await supabase.from('ministry_video_messages').update({
      raw_storage_key: key,
      status: 'processing',
      updated_at: new Date().toISOString(),
    }).eq('id', videoId).eq('ministry_id', ministryId);

    return jsonOk({ uploadUrl, storageKey: key, expiresInSeconds: PRESIGN_EXPIRES_SECONDS });
  } catch (err: any) {
    console.error('video-message-upload-url error:', err);
    return jsonError(err?.message ?? 'Unexpected error', 500);
  }
});

function extensionFor(contentType: string): string {
  const map: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/x-matroska': 'mkv',
  };
  return map[contentType] ?? 'mp4';
}

// ── AWS SigV4 presigned URL (query-string auth) — R2 is S3-API-compatible ──
// No generic S3 signer exists elsewhere in this repo (LiveKit Egress uses the
// LiveKit SDK's own S3Upload config object, not a standalone presigner), so
// this implements SigV4 query-param signing directly against Web Crypto —
// no AWS SDK dependency needed for a single presigned PUT URL.

async function presignS3Put(args: {
  accessKey: string; secretKey: string; region: string; endpoint: string;
  bucket: string; key: string; contentType: string; expiresSeconds: number;
}): Promise<string> {
  const { accessKey, secretKey, region, endpoint, bucket, key, contentType, expiresSeconds } = args;

  const host = new URL(endpoint).host;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const signedHeaders = 'host';

  const query = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': signedHeaders,
  });
  // Sorted per SigV4 spec (URLSearchParams doesn't guarantee order across all
  // runtimes, so sort explicitly before building the canonical request).
  const sortedQuery = new URLSearchParams([...query.entries()].sort(([a], [b]) => a.localeCompare(b)));

  const canonicalUri = `/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const canonicalQueryString = sortedQuery.toString();
  const canonicalHeaders = `host:${host}\n`;
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = await deriveSigningKey(secretKey, dateStamp, region, 's3');
  const signature = toHex(await hmac(signingKey, stringToSign));

  sortedQuery.set('X-Amz-Signature', signature);
  // Content-Type isn't a signed header here (kept out of SignedHeaders so the
  // browser's own fetch/XHR can set it without needing to match byte-for-byte),
  // so pass it separately for the client to set on the actual PUT request.
  void contentType;

  return `${endpoint}${canonicalUri}?${sortedQuery.toString()}`;
}

async function hmac(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function deriveSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const kDate = await hmac(enc.encode(`AWS4${secretKey}`).buffer, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return toHex(digest);
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function jsonOk(body: object) {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
