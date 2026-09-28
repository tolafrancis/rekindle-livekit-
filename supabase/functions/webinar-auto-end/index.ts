// Supabase Edge Function: webinar-auto-end
// =====================================================================
// Ends webinars nobody pressed End on, so they don't stay "live" forever.
// The livekit-webhook backstops (egress_ended, room_finished) only fire when
// LiveKit actually had a room and an egress to finish; a webinar whose host
// closed the tab before the room opened, or whose webhook never arrived,
// had nothing to move it off 'live'. This sweep asks LiveKit directly.
//
// Every run, for each webinar that's backstage, live or ending:
//   • Host, a confirmed co-host, or the host's OBS ingress in the LiveKit
//     room → host_absent_since is cleared.
//   • Nobody running it in the room → host_absent_since is stamped the first
//     time; once it's older than HOST_ABSENT_GRACE_MINUTES:
//       - live/ending → ended (egress stopped, captions bot stopped, open
//         polls closed, room closed for anyone still in it);
//       - backstage → back to 'scheduled', so the host can open it again.
//   • Live for longer than its booked duration + MAX_OVERRUN_MINUTES → ended
//     either way, as a hard cap.
//   • Stuck in 'ending' (the host's own End didn't finish) for longer than
//     the grace period → ended.
//
// Schedule: supabase/cron-setup-webinar-auto-end.sql (pg_cron, every 5 min).
// Calling it is harmless for anyone holding a valid JWT: it only ever acts
// on the rules above and is idempotent, so gateway verify_jwt is enough.
//
// Secrets: LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET +
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (all project-wide already).
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { EgressClient, RoomServiceClient } from 'https://esm.sh/livekit-server-sdk@2';

const HOST_ABSENT_GRACE_MINUTES = 10;
const MAX_OVERRUN_MINUTES = 120;
const MS_PER_MINUTE = 60_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

const httpUrl = (wsUrl: string) => wsUrl.replace(/^ws/, 'http');

interface WebinarRow {
  id: string;
  host_id: string;
  room_name: string;
  status: 'backstage' | 'live' | 'ending';
  duration_minutes: number | null;
  started_at: string | null;
  backstage_started_at: string | null;
  host_absent_since: string | null;
  updated_at: string;
}

type Admin = ReturnType<typeof createClient>;

// Deno's fetch has no default timeout; a hung LiveKit call would hang the
// whole sweep (same reason livekit-token wraps its calls).
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)),
  ]);
}

async function endWebinar(
  admin: Admin, egress: EgressClient, rooms: RoomServiceClient, w: WebinarRow, reason: string,
): Promise<void> {
  const now = new Date().toISOString();

  const { data: recs } = await admin
    .from('livekit_recordings').select('egress_id')
    .eq('room_name', w.room_name).eq('status', 'recording');
  for (const r of (recs ?? []) as Array<{ egress_id: string }>) {
    await withTimeout(egress.stopEgress(r.egress_id), 10_000).catch((err) =>
      console.warn(`[webinar-auto-end] stopEgress ${r.egress_id} failed:`, err));
    await admin.from('livekit_recordings')
      .update({ status: 'processing', ended_at: now })
      .eq('egress_id', r.egress_id).eq('status', 'recording');
  }

  const { data: sessions } = await admin
    .from('translation_sessions').select('id')
    .eq('livekit_room_name', w.room_name)
    .in('status', ['initialising', 'joining', 'active', 'paused']);
  for (const s of (sessions ?? []) as Array<{ id: string }>) {
    const { error } = await admin.rpc('stop_bot_session', { p_session_id: s.id });
    if (error) console.error(`[webinar-auto-end] stop_bot_session ${s.id} failed:`, error.message);
  }

  await admin.from('webinar_polls')
    .update({ status: 'closed', closed_at: now })
    .eq('webinar_id', w.id).eq('status', 'open');

  await admin.from('ministry_webinars')
    .update({ status: 'ended', ended_at: now, ended_reason: reason, host_absent_since: null, updated_at: now })
    .eq('id', w.id).in('status', ['live', 'ending', 'backstage']);

  // Anyone still connected (a speaker left alone on stage) is disconnected;
  // a room that's already gone is fine.
  await withTimeout(rooms.deleteRoom(w.room_name), 10_000).catch(() => {});
  console.log(`[webinar-auto-end] ended webinar ${w.id} (${reason})`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL');
    const KEY = Deno.env.get('LIVEKIT_API_KEY');
    const SECRET = Deno.env.get('LIVEKIT_API_SECRET');
    const SB_URL = Deno.env.get('SUPABASE_URL');
    const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!LIVEKIT_URL || !KEY || !SECRET) return json({ error: 'LiveKit secrets not configured' }, 500);

    const admin = createClient(SB_URL!, SB_SERVICE!);
    const rooms = new RoomServiceClient(httpUrl(LIVEKIT_URL), KEY, SECRET);
    const egress = new EgressClient(httpUrl(LIVEKIT_URL), KEY, SECRET);

    const { data, error } = await admin
      .from('ministry_webinars')
      .select('id, host_id, room_name, status, duration_minutes, started_at, backstage_started_at, host_absent_since, updated_at')
      .in('status', ['backstage', 'live', 'ending']);
    if (error) return json({ error: error.message }, 500);
    const webinars = (data ?? []) as WebinarRow[];

    const nowMs = Date.now();
    const graceMs = HOST_ABSENT_GRACE_MINUTES * MS_PER_MINUTE;
    const summary = { checked: webinars.length, ended: 0, returnedToScheduled: 0 };

    for (const w of webinars) {
      try {
        if (w.status === 'ending' && nowMs - new Date(w.updated_at).getTime() > graceMs) {
          await endWebinar(admin, egress, rooms, w, 'end_incomplete');
          summary.ended++;
          continue;
        }

        if (w.status === 'live' && w.started_at) {
          const capMs = ((w.duration_minutes ?? 60) + MAX_OVERRUN_MINUTES) * MS_PER_MINUTE;
          if (nowMs - new Date(w.started_at).getTime() > capMs) {
            await endWebinar(admin, egress, rooms, w, 'max_duration');
            summary.ended++;
            continue;
          }
        }

        const { data: coHosts } = await admin
          .from('webinar_speakers').select('user_id')
          .eq('webinar_id', w.id).eq('role', 'co-host').eq('status', 'confirmed');
        const runners = new Set<string>([w.host_id, ...((coHosts ?? []) as Array<{ user_id: string | null }>)
          .map((c) => c.user_id).filter((id): id is string => !!id)]);

        let participants: Array<{ identity: string }> = [];
        try {
          participants = await withTimeout(rooms.listParticipants(w.room_name), 10_000);
        } catch {
          participants = []; // no room = nobody in it
        }
        // An OBS/RTMP ingress (livekit-ingress, identity `host-<webinarId>`)
        // is the host broadcasting from outside the app, so it counts too.
        const hostPresent = participants.some((p) => runners.has(p.identity) || p.identity === `host-${w.id}`);

        if (hostPresent) {
          if (w.host_absent_since) {
            await admin.from('ministry_webinars').update({ host_absent_since: null }).eq('id', w.id);
          }
          continue;
        }

        if (!w.host_absent_since) {
          await admin.from('ministry_webinars')
            .update({ host_absent_since: new Date(nowMs).toISOString() })
            .eq('id', w.id).is('host_absent_since', null);
          continue;
        }
        if (nowMs - new Date(w.host_absent_since).getTime() < graceMs) continue;

        if (w.status === 'backstage') {
          // Never went live: nothing to finalize, so let the host come back to it.
          await admin.from('ministry_webinars')
            .update({ status: 'scheduled', host_absent_since: null, updated_at: new Date().toISOString() })
            .eq('id', w.id).eq('status', 'backstage');
          await withTimeout(rooms.deleteRoom(w.room_name), 10_000).catch(() => {});
          summary.returnedToScheduled++;
        } else {
          await endWebinar(admin, egress, rooms, w, 'host_absent');
          summary.ended++;
        }
      } catch (err) {
        console.error(`[webinar-auto-end] webinar ${w.id} failed:`, err);
      }
    }

    return json({ success: true, ...summary });
  } catch (error) {
    console.error('webinar-auto-end error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
