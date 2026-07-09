// supabase/livekit-token/index.ts
//
// Phase 1 control plane for the LiveKit migration. Replaces the two-call Daily
// flow (get-or-create-room + generate-token in `daily-room`) with a single
// locally-signed JWT. This is the LINCHPIN of the migration — the grant it mints
// IS the permission model (see plan §7).
//
// 🔒 Closes the auth hole: the old flow trusted a browser boolean
//    (`isOwner: options.isHost`) and minted an owner token from it, so any user
//    could request host powers. This function IGNORES any client-supplied role
//    and derives host/speaker status SERVER-SIDE from the DB.
//
// ── Deploy (Supabase dashboard) ──────────────────────────────────────────────
//   1. Edge Functions → "Deploy a new function" → name it exactly: livekit-token
//   2. Paste this whole file as its index.ts and deploy.
//   3. Add project secrets (Edge Functions → Secrets):
//        LIVEKIT_URL      ws(s):// URL the browser connects to (e.g. wss://livekit.you.com)
//        LIVEKIT_API_KEY  same key as livekit.yaml / egress.yaml / ingress.yaml
//        LIVEKIT_API_SECRET  (>= 32 chars)
//      SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are project-wide.
//   4. Run migration 0145_meeting_waiting_room.sql in the SQL editor (waiting-room gate).
//
// ── Actions (POST JSON body) ─────────────────────────────────────────────────
//   { action: 'token', roomName, userName, viewerOnly?, enableWaitingRoom?, context? }
//       → { url, token, role }  |  { waiting: true }  |  403 { error:'locked' }
//   { action: 'grant-publish', roomName, identity? }        // speaker-promote (§1D)
//       → { success: true }
//   { action: 'delete-room',  roomName, context? }          // endMeetingForAll (§1E)
//   { action: 'create-room',  roomName, maxParticipants?, emptyTimeout?, context? }  // presets (§1E)
//
//   context = { kind?: 'meeting'|'ministry_meeting'|'channel_meeting'|'channel',
//               meetingId?, channelId? }  — used ONLY for server-side role derivation.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessToken, RoomServiceClient } from 'https://esm.sh/livekit-server-sdk@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Role = 'host' | 'speaker' | 'attendee' | 'viewer';

interface RequestBody {
  action?: 'token' | 'grant-publish' | 'delete-room' | 'create-room';
  roomName: string;
  userName?: string;
  viewerOnly?: boolean;
  enableWaitingRoom?: boolean;
  context?: {
    kind?: 'meeting' | 'ministry_meeting' | 'channel_meeting' | 'channel' | 'counselling';
    meetingId?: string;
    channelId?: string;
  };
  identity?: string;        // grant-publish target (defaults to caller)
  maxParticipants?: number; // create-room preset
  emptyTimeout?: number;    // create-room preset (seconds)
}

// meetings tables that carry host_id, keyed by context.kind.
// NOTE: 'ministry_video_meetings' and 'live_channel_video_meetings' are confirmed
// to have host_id (verified at their insert sites). The plain 'meetings' table's
// host column is UNCONFIRMED — rows are created outside the client. If it isn't
// 'host_id', change it here. Failure is safe: an unknown column yields no host
// match, so a caller is never wrongly granted host. Confirm with:
//   select column_name from information_schema.columns where table_name='meetings';
const HOST_TABLE: Record<string, string> = {
  meeting: 'meetings',
  ministry_meeting: 'ministry_video_meetings',
  channel_meeting: 'live_channel_video_meetings',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

// ws(s):// (browser signaling URL) → http(s):// (server API URL for RoomServiceClient).
const httpUrl = (wsUrl: string) => wsUrl.replace(/^ws/, 'http');

/**
 * Derive the caller's role from the DB. NEVER trusts the client. Absent any
 * server-verifiable proof of host/speaker, the caller is an attendee (or viewer
 * when viewerOnly is requested) — the hole stays closed by default.
 */
async function resolveRole(
  admin: ReturnType<typeof createClient>,
  userId: string,
  body: RequestBody,
): Promise<Role> {
  const ctx = body.context ?? {};

  // Counselling: counselling_sessions.counsellor_id → counsellors.id → counsellors.user_id.
  // Two hops because counsellor_id references the counsellors row, not auth.users.
  // Fail-safe: any miss/error leaves the caller as attendee (never wrongly host).
  if (ctx.kind === 'counselling' && ctx.meetingId) {
    const { data: s } = await admin
      .from('counselling_sessions').select('counsellor_id').eq('id', ctx.meetingId).maybeSingle();
    const counsellorId = (s as { counsellor_id?: string } | null)?.counsellor_id;
    if (counsellorId) {
      const { data: c } = await admin
        .from('counsellors').select('user_id').eq('id', counsellorId).maybeSingle();
      if ((c as { user_id?: string } | null)?.user_id === userId) return 'host';
    }
  }

  // Host: meetings.host_id / ministry_video_meetings.host_id /
  // live_channel_video_meetings.host_id, or live_channels.owner_id for broadcast.
  const table = HOST_TABLE[ctx.kind ?? 'meeting'];
  if (ctx.meetingId && table) {
    const { data } = await admin.from(table).select('host_id').eq('id', ctx.meetingId).maybeSingle();
    if (data && (data as { host_id?: string }).host_id === userId) return 'host';
  }
  if (ctx.channelId) {
    const { data } = await admin.from('live_channels').select('owner_id').eq('id', ctx.channelId).maybeSingle();
    if (data && (data as { owner_id?: string }).owner_id === userId) return 'host';
  }

  // Speaker: a row in live_channel_speakers for this channel + user (promoted).
  if (ctx.channelId) {
    const { data } = await admin
      .from('live_channel_speakers')
      .select('user_id')
      .eq('channel_id', ctx.channelId)
      .eq('user_id', userId)
      .maybeSingle();
    if (data) return 'speaker';
  }

  return body.viewerOnly ? 'viewer' : 'attendee';
}

/** The grant matrix (plan §7) as code. */
function grantFor(role: Role, room: string) {
  const base = { room, roomJoin: true, canSubscribe: true, canPublishData: true };
  switch (role) {
    case 'host':
      return { ...base, canPublish: true, roomAdmin: true };
    case 'speaker':
    case 'attendee':
      return { ...base, canPublish: true };
    case 'viewer':
      return { ...base, canPublish: false };
  }
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
    if (!body.roomName) return json({ error: 'roomName is required' }, 400);

    // 1) Authenticate the caller via their Supabase JWT.
    const userClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    // Service-role client for role lookups (bypasses RLS so host detection is reliable).
    const admin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const svc = new RoomServiceClient(httpUrl(LIVEKIT_URL), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

    const action = body.action ?? 'token';
    const role = await resolveRole(admin, user.id, body);
    const isHost = role === 'host';

    // ── Non-token admin actions ────────────────────────────────────────────
    if (action === 'delete-room') {
      if (!isHost) return json({ error: 'Only the host can end the meeting' }, 403);
      await svc.deleteRoom(body.roomName).catch(() => {}); // idempotent
      return json({ success: true });
    }

    if (action === 'create-room') {
      if (!isHost) return json({ error: 'Only the host can preset the room' }, 403);
      await svc.createRoom({
        name: body.roomName,
        emptyTimeout: body.emptyTimeout ?? 300,
        maxParticipants: body.maxParticipants ?? 0,
      }).catch(() => {}); // already exists = fine
      return json({ success: true });
    }

    if (action === 'grant-publish') {
      // Speaker-promote (§1D): viewer-only tokens have canPublish:false, so the
      // SFU rejects publishing until permissions are widened server-side.
      const target = body.identity ?? user.id;
      // Promoting someone else requires host; promoting yourself requires a
      // verified speaker row (you were accepted as a speaker).
      const allowed = target === user.id ? role === 'speaker' || isHost : isHost;
      if (!allowed) return json({ error: 'Not permitted to grant publish' }, 403);
      await svc.updateParticipant(body.roomName, target, undefined, {
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });
      return json({ success: true });
    }

    // ── action === 'token' ───────────────────────────────────────────────────

    // Gate: locked room (§1C) — enforced at issuance, replacing the advisory
    // client-side lock. Read the room's metadata; if it doesn't exist yet
    // (auto-create), it isn't locked.
    if (!isHost) {
      try {
        const rooms = await svc.listRooms([body.roomName]);
        const meta = rooms[0]?.metadata ? JSON.parse(rooms[0].metadata) : {};
        if (meta.locked) return json({ error: 'locked' }, 403);
      } catch { /* room not present / API blip → treat as unlocked */ }
    }

    // Gate: waiting room (§1C/§3D) — non-hosts get queued instead of a token,
    // UNLESS a host has already admitted them (status='admitted' → fall through
    // and mint the token; that's how admitFromWaitingRoom lets the client back in).
    if (body.enableWaitingRoom && !isHost) {
      const meetingKey = body.context?.meetingId ?? body.roomName;
      const { data: existing } = await admin
        .from('meeting_waiting_room')
        .select('status')
        .eq('meeting_id', meetingKey)
        .eq('user_id', user.id)
        .maybeSingle();

      if ((existing as { status?: string } | null)?.status === 'rejected') {
        return json({ error: 'rejected' }, 403);
      }
      if ((existing as { status?: string } | null)?.status !== 'admitted') {
        await admin.from('meeting_waiting_room').upsert(
          {
            meeting_id: meetingKey,
            user_id: user.id,
            name: body.userName ?? user.email ?? 'Guest',
            status: 'waiting',
          },
          { onConflict: 'meeting_id,user_id' },
        );
        return json({ waiting: true });
      }
      // admitted → continue to mint the token below.
    }

    // Mint the JWT.
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: user.id,
      name: body.userName ?? user.email ?? 'Guest',
      metadata: JSON.stringify({ role }),
      ttl: '2h',
    });
    at.addGrant(grantFor(role, body.roomName));

    return json({ url: LIVEKIT_URL, token: await at.toJwt(), role });
  } catch (error) {
    console.error('livekit-token error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
