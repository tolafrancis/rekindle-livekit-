// supabase/captions-start/index.ts
//
// On-demand source-language captions. Called when a participant turns CC on.
// Starts the room's caption agent if one isn't already running — idempotent,
// so any number of simultaneous calls for the same room start exactly one
// agent (claim_caption_session's partial unique index, migration 0372).
//
// No host action is needed: anyone who is genuinely IN the room can start
// captions. "In the room" is proven by the caller's own LiveKit access token
// (minted by livekit-token, signed with our API secret) — verified here, then
// cross-checked against the room's live participant list. That works the same
// for signed-in members and for guests who joined from a share link, and a
// caller can't start an agent in a room they aren't actually in.
//
// Separate from Live Translation: never touches translation_sessions,
// language_configs, or the bot_dispatch channel.
//
// ── Deploy (Supabase dashboard) ──────────────────────────────────────────────
//   1. Edge Functions → "Deploy a new function" → name it exactly: captions-start
//   2. Paste this file as its index.ts and deploy.
//   3. Uses the same secrets as livekit-token: LIVEKIT_URL, LIVEKIT_API_KEY,
//      LIVEKIT_API_SECRET, plus the project-wide SUPABASE_URL /
//      SUPABASE_SERVICE_ROLE_KEY.
//   4. Run migration 0372_on_demand_captions.sql first.
//
// ── Request (POST JSON body) ─────────────────────────────────────────────────
//   { roomName, livekitToken, context: { kind: 'ministry_meeting'|'ministry_webinar' } }
//       → { session_id, status: 'starting'|'active', reused }
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { RoomServiceClient, TokenVerifier } from 'https://esm.sh/livekit-server-sdk@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type RoomKind = 'ministry_meeting' | 'ministry_webinar';

interface RequestBody {
  roomName?: string;
  livekitToken?: string;
  context?: { kind?: RoomKind };
}

// Rooms captions can run in, keyed by context.kind. Both tables carry
// room_name, ministry_id and (migration 0372) source_language.
const ROOM_TABLE: Record<RoomKind, string> = {
  ministry_meeting: 'ministry_video_meetings',
  ministry_webinar: 'ministry_webinars',
};

// The caption agent joins as a hidden participant under this prefix — it
// must never count as "a participant in the room" for the presence check.
const AGENT_IDENTITY_PREFIX = 'caption-agent-';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

// ws(s):// (browser signaling URL) → http(s):// (server API URL for RoomServiceClient).
const httpUrl = (wsUrl: string) => wsUrl.replace(/^ws/, 'http');

// Same reason as livekit-token's withTimeout: Deno's fetch has no default
// timeout, and an unresponsive LiveKit host would otherwise hang the function.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
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
      return json({ error: 'LiveKit secrets not configured (LIVEKIT_URL/API_KEY/API_SECRET).' }, 500);
    }

    const body = (await req.json()) as RequestBody;
    const roomName = body.roomName;
    const kind: RoomKind = body.context?.kind ?? 'ministry_meeting';
    if (!roomName || !body.livekitToken) {
      return json({ error: 'roomName and livekitToken are required' }, 400);
    }
    if (!(kind in ROOM_TABLE)) return json({ error: 'Unsupported room kind' }, 400);

    // 1) Authenticate: the caller's LiveKit token must be one we signed, for
    //    THIS room, with join rights.
    let identity: string;
    try {
      const grants = await new TokenVerifier(LIVEKIT_API_KEY, LIVEKIT_API_SECRET).verify(body.livekitToken);
      if (!grants.sub || grants.video?.room !== roomName || !grants.video?.roomJoin) {
        return json({ error: 'Not a participant of this room' }, 403);
      }
      identity = grants.sub;
    } catch {
      return json({ error: 'Invalid or expired room token' }, 401);
    }
    if (identity.startsWith(AGENT_IDENTITY_PREFIX)) {
      return json({ error: 'Not a participant of this room' }, 403);
    }

    // 2) Membership: the caller must actually be connected to the room now.
    const svc = new RoomServiceClient(httpUrl(LIVEKIT_URL), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    const participants = await withTimeout(svc.listParticipants(roomName), 8000, 'listParticipants');
    if (!participants.some((p) => p.identity === identity)) {
      return json({ error: 'Not a participant of this room' }, 403);
    }

    // 3) Resolve the room server-side — never trust a client-supplied org or
    //    language.
    const admin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const { data: room, error: roomError } = await admin
      .from(ROOM_TABLE[kind])
      .select('id, ministry_id, source_language')
      .eq('room_name', roomName)
      .maybeSingle();
    if (roomError) throw roomError;
    if (!room) return json({ error: 'Room not found' }, 404);

    // 4) Atomic get-or-create + dispatch (one live session per room).
    const { data, error } = await admin.rpc('claim_caption_session', {
      p_org_id: room.ministry_id,
      p_room_id: room.id,
      p_room_kind: kind,
      p_room_name: roomName,
      p_source_language: room.source_language ?? 'en',
      p_started_by: identity,
    });
    if (error) throw error;

    return json(data);
  } catch (err) {
    console.error('[captions-start] error:', err);
    return json({ error: (err as Error).message ?? 'Unknown error' }, 500);
  }
});
