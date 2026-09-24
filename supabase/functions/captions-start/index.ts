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
//   In the room (meeting participants, webinar host/speakers):
//     { roomName, livekitToken, context: { kind: 'ministry_meeting'|'ministry_webinar' } }
//     (Live Broadcast channels: kind 'channel', roomName 'channel-<channel id>')
//   Audiences watching over HLS (never in the LiveKit room):
//     { hls: true, webinarId }   or   { hls: true, channelId }
//       → { session_id, status: 'starting'|'active', reused }
//
// HLS viewers can't present a room token, so they're checked the same way
// watching is: a webinar must be live and either public or the caller a
// signed-in ministry member (the "read ministry webinars" policy, migration
// 0354); a channel broadcast must be live (it's public to anyone watching).
//
// Usage is logged per org; personal (non-ministry) channels log it against
// the channel owner instead (migration 0375).
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { RoomServiceClient, TokenVerifier } from 'https://esm.sh/livekit-server-sdk@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type RoomKind = 'ministry_meeting' | 'ministry_webinar' | 'channel';

interface RequestBody {
  roomName?: string;
  livekitToken?: string;
  context?: { kind?: RoomKind };
  hls?: boolean;
  webinarId?: string;
  channelId?: string;
}

// Meeting and webinar rooms, keyed by context.kind. Both tables carry
// room_name, ministry_id and (migration 0372) source_language. Channels are
// resolved from the room name instead (CHANNEL_ROOM below).
const ROOM_TABLE: Record<Exclude<RoomKind, 'channel'>, string> = {
  ministry_meeting: 'ministry_video_meetings',
  ministry_webinar: 'ministry_webinars',
};

// A channel broadcast's LiveKit room is always "channel-<channel id>"
// (LiveChannelBroadcast.tsx joins it under exactly that name).
const CHANNEL_ROOM = /^channel-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;


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
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return json({ error: 'LiveKit secrets not configured (LIVEKIT_URL/API_KEY/API_SECRET).' }, 500);
    }

    const body = (await req.json()) as RequestBody;
    const admin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // ── Channel audience over HLS ──────────────────────────────────────────
    if (body.hls && body.channelId) {
      const { data: channel, error: channelError } = await admin
        .from('live_channels')
        .select('id, ministry_id, owner_id, is_live, is_hls_live, source_language')
        .eq('id', body.channelId)
        .maybeSingle();
      if (channelError) throw channelError;
      if (!channel) return json({ error: 'Channel not found' }, 404);
      if (!channel.is_live && !channel.is_hls_live) return json({ error: 'This broadcast is not live' }, 409);

      const roomName = `channel-${channel.id}`;
      const { data, error } = await admin.rpc('claim_caption_session', {
        p_org_id: channel.ministry_id,
        p_room_id: channel.id,
        p_room_kind: 'channel',
        p_room_name: roomName,
        p_source_language: channel.source_language ?? 'en',
        p_started_by: 'hls:viewer',
        p_owner_user_id: channel.owner_id,
      });
      if (error) throw error;

      await admin
        .from('caption_sessions')
        .update({ hls_viewer_seen_at: new Date().toISOString() })
        .eq('id', data.session_id);

      return json({ ...data, room_name: roomName });
    }

    // ── Webinar audience over HLS ──────────────────────────────────────────
    if (body.hls) {
      if (!body.webinarId) return json({ error: 'webinarId or channelId is required' }, 400);

      const { data: webinar, error: webinarError } = await admin
        .from('ministry_webinars')
        .select('id, ministry_id, room_name, status, is_public, source_language')
        .eq('id', body.webinarId)
        .maybeSingle();
      if (webinarError) throw webinarError;
      if (!webinar) return json({ error: 'Webinar not found' }, 404);
      if (webinar.status !== 'live') return json({ error: 'This webinar is not live' }, 409);

      const userClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      });
      const { data: { user } } = await userClient.auth.getUser();

      if (!webinar.is_public) {
        if (!user) return json({ error: 'Sign in to use captions for this webinar' }, 401);
        const { data: isMember, error: memberError } = await admin.rpc('is_group_member', {
          p_ministry_id: webinar.ministry_id,
          p_user_id: user.id,
        });
        if (memberError) throw memberError;
        if (!isMember) return json({ error: 'Not a member of this ministry' }, 403);
      }

      const { data, error } = await admin.rpc('claim_caption_session', {
        p_org_id: webinar.ministry_id,
        p_room_id: webinar.id,
        p_room_kind: 'ministry_webinar',
        p_room_name: webinar.room_name,
        p_source_language: webinar.source_language ?? 'en',
        p_started_by: `hls:${user?.id ?? 'guest'}`,
      });
      if (error) throw error;

      // Count this viewer straight away, so the agent doesn't see "nobody
      // watching captions" before the viewer's first heartbeat.
      await admin
        .from('caption_sessions')
        .update({ hls_viewer_seen_at: new Date().toISOString() })
        .eq('id', data.session_id);

      return json({ ...data, room_name: webinar.room_name });
    }

    // ── In the room ────────────────────────────────────────────────────────
    const roomName = body.roomName;
    const kind: RoomKind = body.context?.kind ?? 'ministry_meeting';
    if (!roomName || !body.livekitToken) {
      return json({ error: 'roomName and livekitToken are required' }, 400);
    }
    if (kind !== 'channel' && !(kind in ROOM_TABLE)) return json({ error: 'Unsupported room kind' }, 400);

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
    let room: { id: string; ministry_id: string | null; owner_id?: string | null; source_language: string | null } | null;
    if (kind === 'channel') {
      const channelId = CHANNEL_ROOM.exec(roomName)?.[1];
      if (!channelId) return json({ error: 'Room not found' }, 404);
      const { data, error: roomError } = await admin
        .from('live_channels')
        .select('id, ministry_id, owner_id, source_language')
        .eq('id', channelId)
        .maybeSingle();
      if (roomError) throw roomError;
      room = data;
    } else {
      const { data, error: roomError } = await admin
        .from(ROOM_TABLE[kind])
        .select('id, ministry_id, source_language')
        .eq('room_name', roomName)
        .maybeSingle();
      if (roomError) throw roomError;
      room = data;
    }
    if (!room) return json({ error: 'Room not found' }, 404);
    if (!room.ministry_id && !room.owner_id) return json({ error: 'Room has no owner to log caption usage against' }, 400);

    // 4) Atomic get-or-create + dispatch (one live session per room).
    const { data, error } = await admin.rpc('claim_caption_session', {
      p_org_id: room.ministry_id,
      p_room_id: room.id,
      p_room_kind: kind,
      p_room_name: roomName,
      p_source_language: room.source_language ?? 'en',
      p_started_by: identity,
      p_owner_user_id: room.owner_id ?? null,
    });
    if (error) throw error;

    return json(data);
  } catch (err) {
    console.error('[captions-start] error:', err);
    return json({ error: (err as Error).message ?? 'Unknown error' }, 500);
  }
});
