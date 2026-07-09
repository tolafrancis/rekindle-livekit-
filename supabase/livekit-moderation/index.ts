// supabase/livekit-moderation/index.ts
//
// Phase 3 (§3A) — SERVER-ENFORCED moderation for LiveKit. Daily moderation was
// client-cooperative (host sends an app-message; the target voluntarily mutes
// itself). LiveKit enforces it at the SFU: a muted track stops publishing whether
// or not the client cooperates; a removed participant is disconnected.
//
// The caller is authorized as host/co-host SERVER-SIDE (host from the DB, co-host
// from LiveKit participant metadata) — never from a client flag.
//
// ── Deploy (Supabase dashboard) ──────────────────────────────────────────────
//   1. Edge Functions → "Deploy a new function" → name it exactly: livekit-moderation
//   2. Paste this whole file as its index.ts and deploy.
//   3. Secrets: reuses LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET +
//      SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY (all project-wide).
//
// ── Actions (POST JSON body) ─────────────────────────────────────────────────
//   { action:'mute-track',  roomName, identity, source:'microphone'|'camera', muted?:true }
//   { action:'mute-all',    roomName, source, except?:string[] }
//   { action:'remove-participant', roomName, identity }
//   { action:'set-role',    roomName, identity, role }         // metadata + publish grant
//   { action:'lock',        roomName, locked:boolean }          // room metadata
//   { action:'admit-waiting',  roomName, identity, context? }   // waiting-room → admitted
//   { action:'reject-waiting', roomName, identity, context? }   // waiting-room → rejected
//   context = { kind?, meetingId?, channelId? } — for server-side host derivation.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { RoomServiceClient, TrackSource } from 'https://esm.sh/livekit-server-sdk@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HOST_TABLE: Record<string, string> = {
  meeting: 'meetings',
  ministry_meeting: 'ministry_video_meetings',
  channel_meeting: 'live_channel_video_meetings',
};

interface Body {
  action: string;
  roomName: string;
  identity?: string;
  source?: 'microphone' | 'camera';
  muted?: boolean;
  except?: string[];
  role?: string;
  locked?: boolean;
  context?: { kind?: string; meetingId?: string; channelId?: string };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

const httpUrl = (wsUrl: string) => wsUrl.replace(/^ws/, 'http');

async function isDbHost(admin: ReturnType<typeof createClient>, userId: string, ctx: Body['context']): Promise<boolean> {
  const c = ctx ?? {};

  // Counselling: session.counsellor_id → counsellors.id → counsellors.user_id (two hops).
  if (c.kind === 'counselling' && c.meetingId) {
    const { data: s } = await admin
      .from('counselling_sessions').select('counsellor_id').eq('id', c.meetingId).maybeSingle();
    const counsellorId = (s as { counsellor_id?: string } | null)?.counsellor_id;
    if (counsellorId) {
      const { data: cr } = await admin
        .from('counsellors').select('user_id').eq('id', counsellorId).maybeSingle();
      if ((cr as { user_id?: string } | null)?.user_id === userId) return true;
    }
  }

  const table = HOST_TABLE[c.kind ?? 'meeting'];
  if (c.meetingId && table) {
    const { data } = await admin.from(table).select('host_id').eq('id', c.meetingId).maybeSingle();
    if (data && (data as { host_id?: string }).host_id === userId) return true;
  }
  if (c.channelId) {
    const { data } = await admin.from('live_channels').select('owner_id').eq('id', c.channelId).maybeSingle();
    if (data && (data as { owner_id?: string }).owner_id === userId) return true;
  }
  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL');
    const KEY = Deno.env.get('LIVEKIT_API_KEY');
    const SECRET = Deno.env.get('LIVEKIT_API_SECRET');
    const SB_URL = Deno.env.get('SUPABASE_URL');
    const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY');
    const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!LIVEKIT_URL || !KEY || !SECRET) return json({ error: 'LiveKit secrets not configured' }, 500);

    const body = (await req.json()) as Body;
    if (!body.roomName || !body.action) return json({ error: 'roomName and action required' }, 400);

    // Authenticate caller.
    const userClient = createClient(SB_URL!, SB_ANON!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SB_URL!, SB_SERVICE!);
    const svc = new RoomServiceClient(httpUrl(LIVEKIT_URL), KEY, SECRET);

    // Authorize as host (DB) or co-host (LiveKit metadata).
    let authorized = await isDbHost(admin, user.id, body.context);
    if (!authorized) {
      try {
        const me = await svc.getParticipant(body.roomName, user.id);
        const role = me?.metadata ? JSON.parse(me.metadata).role : undefined;
        authorized = role === 'co-host' || role === 'host';
      } catch { /* not in room */ }
    }
    if (!authorized) return json({ error: 'Not authorized to moderate this room' }, 403);

    const sourceEnum = body.source === 'camera' ? TrackSource.CAMERA : TrackSource.MICROPHONE;

    switch (body.action) {
      case 'mute-track': {
        if (!body.identity) return json({ error: 'identity required' }, 400);
        const p = await svc.getParticipant(body.roomName, body.identity);
        const track = p.tracks.find((t) => t.source === sourceEnum);
        if (track) await svc.mutePublishedTrack(body.roomName, body.identity, track.sid, body.muted ?? true);
        return json({ success: true });
      }

      case 'mute-all': {
        const except = new Set(body.except ?? []);
        except.add(user.id); // never mute the moderator
        const participants = await svc.listParticipants(body.roomName);
        for (const p of participants) {
          if (except.has(p.identity)) continue;
          const role = p.metadata ? (() => { try { return JSON.parse(p.metadata).role; } catch { return undefined; } })() : undefined;
          if (role === 'host' || role === 'co-host') continue;
          const track = p.tracks.find((t) => t.source === sourceEnum);
          if (track) await svc.mutePublishedTrack(body.roomName, p.identity, track.sid, true);
        }
        return json({ success: true });
      }

      case 'remove-participant': {
        if (!body.identity) return json({ error: 'identity required' }, 400);
        await svc.removeParticipant(body.roomName, body.identity).catch(() => {});
        return json({ success: true });
      }

      case 'set-role': {
        if (!body.identity || !body.role) return json({ error: 'identity and role required' }, 400);
        const canPublish = body.role === 'host' || body.role === 'co-host' || body.role === 'speaker';
        await svc.updateParticipant(
          body.roomName,
          body.identity,
          JSON.stringify({ role: body.role }),
          { canPublish, canSubscribe: true, canPublishData: true },
        );
        return json({ success: true });
      }

      case 'lock': {
        await svc.updateRoomMetadata(body.roomName, JSON.stringify({ locked: !!body.locked }));
        return json({ success: true });
      }

      case 'admit-waiting':
      case 'reject-waiting': {
        if (!body.identity) return json({ error: 'identity required' }, 400);
        const meetingKey = body.context?.meetingId ?? body.roomName;
        const status = body.action === 'admit-waiting' ? 'admitted' : 'rejected';
        await admin
          .from('meeting_waiting_room')
          .update({ status })
          .eq('meeting_id', meetingKey)
          .eq('user_id', body.identity);
        return json({ success: true });
      }

      default:
        return json({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (error) {
    console.error('livekit-moderation error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
