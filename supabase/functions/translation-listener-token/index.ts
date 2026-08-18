// supabase/functions/translation-listener-token/index.ts
//
// WebRTC-only /display (see docs/rlt-build-checklist.md's "WebRTC-only
// /display" plan): mints a short-lived, subscribe-only LiveKit token for an
// anonymous /display visitor, so they can join the translation session's
// room directly and subscribe to the bot's published "rlt-translated-{lang}"
// track — no HLS/Egress hop, no storage, ~sub-second delivery.
//
// Deliberately NOT built on livekit-token/index.ts's guest path: that
// function's grantFor('attendee', ...) hands a guest canPublish:true (fine
// for a meeting guest who might legitimately speak; wrong here — a /display
// visitor must never be able to publish into a live translation room), and
// its guest path skips the tenant-entitlement check entirely (any roomName
// the client supplies is accepted). This function instead derives the room
// name itself, server-side, from translation_sessions — the caller supplies
// only a sessionId, never a room name.
//
// Access control mirrors the existing /display page exactly: the lookup
// below runs through an ANON-key client, so the same RLS policy that already
// gates the page's own row fetch (migration 0273:
// p_translation_sessions_public_sel — public unless the ministry's
// language_configs.is_public = false) gates token issuance too. A private
// session's sessionId gets the same "not_found" response an anon SELECT
// already gives it — no separate is_public check to keep in sync by hand.
//
// ── Deploy (Supabase dashboard) ──────────────────────────────────────────
//   1. Edge Functions → "Deploy a new function" → name it exactly:
//      translation-listener-token
//   2. Paste this whole file as its index.ts and deploy.
//   3. Secrets needed: LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET
//      (already set for livekit-token/livekit-egress) and SUPABASE_URL /
//      SUPABASE_ANON_KEY (project-wide). No service-role key needed here —
//      the whole point is this function has no more DB access than an
//      anonymous browser already would.
//
// ── Request ───────────────────────────────────────────────────────────────
//   POST { sessionId: string }
//     → 200 { url, token, roomName, trackName, targetLanguage }
//     → 404 { error: 'not_found' }   session doesn't exist, or is private
//     → 409 { error: 'not_ready' }   session exists but the bot hasn't
//                                    joined a room yet (still initialising)
//     → 410 { error: 'ended' }       session already ended
//     → 429 { error: 'at_capacity' } room already has TRANSLATION_LISTENER_CAP
//                                    non-bot participants
// ───────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessToken, RoomServiceClient } from 'https://esm.sh/livekit-server-sdk@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

const httpUrl = (wsUrl: string) => wsUrl.replace(/^ws/, 'http');

interface RequestBody {
  sessionId: string;
}

interface SessionRow {
  id: string;
  livekit_room_name: string | null;
  target_language: string;
  status: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed. Use POST.' }, 405);

  try {
    const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL');
    const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY');
    const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    // No hard business tier here on purpose (dollar amounts are a product
    // decision, not this function's job) — just a mechanism, tunable per
    // deployment without a redeploy of the pricing logic itself.
    const LISTENER_CAP = Number(Deno.env.get('TRANSLATION_LISTENER_CAP') ?? '200');

    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return json({ error: 'LiveKit secrets not configured (LIVEKIT_URL/API_KEY/API_SECRET).' }, 500);
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return json({ error: 'Supabase secrets not configured (SUPABASE_URL/SUPABASE_ANON_KEY).' }, 500);
    }

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    if (!body.sessionId) return json({ error: 'sessionId is required' }, 400);

    // Anon-scoped client — see the header comment: this IS the access-control
    // gate, not a formality. No Authorization header means the anon role,
    // same as the browser's own direct row fetch.
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: session, error: sessionErr } = await anon
      .from('translation_sessions')
      .select('id, livekit_room_name, target_language, status')
      .eq('id', body.sessionId)
      .maybeSingle();

    if (sessionErr) {
      console.error('translation-listener-token: session lookup failed:', sessionErr.message);
      return json({ error: 'lookup_failed' }, 500);
    }
    if (!session) return json({ error: 'not_found' }, 404);

    const row = session as SessionRow;
    if (row.status === 'ended' || row.status === 'error') return json({ error: 'ended' }, 410);
    if (!row.livekit_room_name) return json({ error: 'not_ready' }, 409);

    const svc = new RoomServiceClient(httpUrl(LIVEKIT_URL), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

    // Capacity gate: count everyone in the room except the bot itself
    // (identity "rlt-bot-{sessionId}", see BotSession.ts) — every previously
    // admitted listener plus anyone mid-join. Best-effort: an empty/failed
    // listRooms (room not up yet on LiveKit's side) is treated as "no one
    // there yet" rather than blocking issuance.
    try {
      const participants = await svc.listParticipants(row.livekit_room_name);
      const listenerCount = participants.filter((p) => !p.identity.startsWith('rlt-bot-')).length;
      if (listenerCount >= LISTENER_CAP) {
        return json({ error: 'at_capacity' }, 429);
      }
    } catch {
      // Room not yet visible to the API / transient blip — fail open here;
      // the bot's own connect() is the thing that actually creates the room,
      // and a listener arriving a beat before that shouldn't be punished.
    }

    const identity = `rlt-listener-${crypto.randomUUID()}`;
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      name: 'Listener',
      ttl: '4h',
    });
    at.addGrant({
      room: row.livekit_room_name,
      roomJoin: true,
      canSubscribe: true,
      canPublish: false,
      canPublishData: false,
    });

    return json({
      url: LIVEKIT_URL,
      token: await at.toJwt(),
      roomName: row.livekit_room_name,
      trackName: `rlt-translated-${row.target_language}`,
      targetLanguage: row.target_language,
    });
  } catch (error) {
    console.error('translation-listener-token error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
