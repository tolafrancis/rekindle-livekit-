// supabase/functions/translation-device-publish-token/index.ts
//
// RLT Phase 4 (docs/rlt-build-checklist.md, edge agent, 2026-08-21): mints
// a LiveKit token for the edge agent's own room join. Deliberately
// server-side, same reasoning as translation-listener-token: the edge
// agent runs as installed client software on a church's own PC — it must
// never hold raw LIVEKIT_API_KEY/API_SECRET, or extracting them from the
// installed app would let anyone mint arbitrary tokens for any room. The
// device's own bcrypt/sha256-backed bearer token (from authenticate_device)
// is what's actually trusted here, not a Supabase user session — there is
// no user.
//
// Architecture revision (2026-08-21), decided before this shipped: the
// edge agent does NOT run its own STT/translate/TTS pipeline (the written
// plan's original §4.2-4.3 shape) — that would mean shipping real
// third-party API keys inside installed client software. Instead it's a
// thin LiveKit audio bridge: publishes the PA mixer's audio as a normal
// participant (identity 'pa-device-{device_id}', matching
// device_start_session's own speaker_identity for this device — migration
// 0287 — so the CLOUD bot locks onto it specifically) and subscribes back
// to that same cloud bot's translated track for local PA playback. All
// translation stays server-side, unchanged, same bot/keys as meetings
// already use today. Both canPublish and canSubscribe are true here,
// unlike a /display listener's token (subscribe-only).
//
// ── Deploy (Supabase dashboard or `supabase functions deploy`) ──────────
//   Secrets needed: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (all already set — reused
//   from livekit-token/translation-listener-token).
//
// ── Request ───────────────────────────────────────────────────────────────
//   POST { sessionId }, Authorization: Bearer <device bearer token>
//     (the 24h token from authenticate_device — NOT a Supabase user JWT)
//     → 200 { url, token, roomName, identity }
//     → 401 { error: 'invalid_device_token' }
//     → 404 { error: 'session_not_found' }
//     → 403 { error: 'session_not_owned_by_this_device_ministry' }
// ───────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessToken } from 'https://esm.sh/livekit-server-sdk@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed. Use POST.' }, 405);

  try {
    const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL');
    const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY');
    const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return json({ error: 'LiveKit secrets not configured.' }, 500);
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: 'Supabase secrets not configured.' }, 500);
    }

    const authHeader = req.headers.get('Authorization') || '';
    const deviceToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!deviceToken) return json({ error: 'invalid_device_token' }, 401);

    const body = (await req.json().catch(() => ({}))) as { sessionId?: string };
    if (!body.sessionId) return json({ error: 'sessionId is required' }, 400);

    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Same lookup _translation_device_from_token() does in SQL (migration
    // 0273) — replicated here rather than exposing that internal-only
    // function as a callable RPC, since service-role already has direct
    // table access and this avoids widening that function's grant.
    const tokenHash = await sha256Hex(deviceToken);
    const { data: tokenRow } = await service
      .from('translation_device_tokens')
      .select('device_id, expires_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (!tokenRow || new Date(tokenRow.expires_at).getTime() < Date.now()) {
      return json({ error: 'invalid_device_token' }, 401);
    }
    const { data: device } = await service
      .from('translation_devices')
      .select('id, ministry_id, status')
      .eq('id', tokenRow.device_id)
      .maybeSingle();
    if (!device || device.status !== 'active') return json({ error: 'invalid_device_token' }, 401);

    const { data: session } = await service
      .from('translation_sessions')
      .select('id, ministry_id, livekit_room_name')
      .eq('id', body.sessionId)
      .maybeSingle();
    if (!session || !session.livekit_room_name) return json({ error: 'session_not_found' }, 404);
    if (session.ministry_id !== device.ministry_id) {
      return json({ error: 'session_not_owned_by_this_device_ministry' }, 403);
    }

    // Fixed, deterministic — matches device_start_session's own
    // speaker_identity for this device (migration 0287), known before
    // this token is even minted.
    const identity = `pa-device-${device.id}`;

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      ttl: '6h',
    });
    at.addGrant({
      roomJoin: true,
      room: session.livekit_room_name,
      canPublish: true,   // the PA mixer's own audio, published as a normal mic-like track
      canSubscribe: true, // needed to hear the cloud bot's translated track back, for local PA playback
      canPublishData: false,
    });

    return json({
      url: LIVEKIT_URL,
      token: await at.toJwt(),
      roomName: session.livekit_room_name,
      identity,
    });
  } catch (error) {
    console.error('translation-device-publish-token error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
