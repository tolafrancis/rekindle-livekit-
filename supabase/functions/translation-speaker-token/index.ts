// supabase/functions/translation-speaker-token/index.ts
//
// "Speaker Link" — mints a LiveKit publish token for a browser-based
// speaker session (migration 0288), the third way to start a translation
// session alongside Meetings and the PA edge agent. No Supabase session
// involved: the speaker's browser holds only a per-session raw token (the
// one start_speaker_session returned once, embedded in the link an admin
// hands them) — this function is what exchanges that token for an actual
// LiveKit grant, exactly like translation-device-publish-token does for
// the PA edge agent, and for the same reason (LIVEKIT_API_SECRET must
// never reach client code).
//
// canPublish:true / canSubscribe:false — the speaker only ever sends
// audio, same as a normal mic. They don't need to hear the bot's
// translated track back (unlike the PA edge agent, which loops it into a
// physical mixer) — a human speaker just talks.
//
// ── Deploy ────────────────────────────────────────────────────────────
//   Secrets needed: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (all already set — reused from
//   livekit-token/translation-listener-token/translation-device-publish-token).
//
// ── Request ───────────────────────────────────────────────────────────
//   POST { sessionId, speakerToken }
//     → 200 { url, token, roomName, identity, sourceLanguage, targetLanguage }
//     → 400 { error: 'sessionId and speakerToken are required' }
//     → 401 { error: 'invalid_speaker_token' }
//     → 404 { error: 'session_not_found' }
//     → 409 { error: 'session_ended' }
// ─────────────────────────────────────────────────────────────────────

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

    const body = (await req.json().catch(() => ({}))) as { sessionId?: string; speakerToken?: string };
    if (!body.sessionId || !body.speakerToken) {
      return json({ error: 'sessionId and speakerToken are required' }, 400);
    }

    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: session } = await service
      .from('translation_sessions')
      .select('id, livekit_room_name, source_type, status, source_language, target_language, speaker_token_hash')
      .eq('id', body.sessionId)
      .maybeSingle();

    if (!session || session.source_type !== 'browser_speaker' || !session.livekit_room_name) {
      return json({ error: 'session_not_found' }, 404);
    }

    const tokenHash = await sha256Hex(body.speakerToken);
    if (!session.speaker_token_hash || session.speaker_token_hash !== tokenHash) {
      return json({ error: 'invalid_speaker_token' }, 401);
    }
    if (session.status === 'ended' || session.status === 'error') {
      return json({ error: 'session_ended' }, 409);
    }

    // Fixed, deterministic — matches start_speaker_session's own
    // speaker_identity for this session (migration 0288).
    const identity = `speaker-${session.id}`;

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      ttl: '6h',
    });
    at.addGrant({
      roomJoin: true,
      room: session.livekit_room_name,
      canPublish: true,
      canSubscribe: false, // a human speaker doesn't need the translated track back
      canPublishData: false,
    });

    return json({
      url: LIVEKIT_URL,
      token: await at.toJwt(),
      roomName: session.livekit_room_name,
      identity,
      sourceLanguage: session.source_language,
      targetLanguage: session.target_language,
    });
  } catch (error) {
    console.error('translation-speaker-token error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
