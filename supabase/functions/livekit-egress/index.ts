// supabase/livekit-egress/index.ts
//
// Phase 5 (§12) — meeting recording via LiveKit Egress, replacing Daily/Mux cloud
// recording. Records the room composite to S3 as HLS segments (VOD-playable) and
// tracks every output in the livekit_recordings table (self-hosted = we own the
// bookkeeping; nothing auto-stops or auto-lists — see plan §6F / risk register).
//
// Phase 6 extends this same function with HLS-broadcast egress (start-hls) and
// per-destination RTMP egress (simulcast).
//
// ── Deploy (Supabase dashboard) ──────────────────────────────────────────────
//   1. Edge Functions → "Deploy a new function" → name it exactly: livekit-egress
//   2. Paste this whole file as its index.ts and deploy.
//   3. Secrets (in addition to LIVEKIT_URL/API_KEY/API_SECRET + SUPABASE_*):
//        S3_ACCESS_KEY, S3_SECRET, S3_BUCKET, S3_REGION, S3_ENDPOINT
//        S3_PUBLIC_BASE  (public base URL for playback; defaults to S3_ENDPOINT/S3_BUCKET)
//   4. Run migration 0146_livekit_recordings.sql.
//
// ── Actions (POST JSON body) ─────────────────────────────────────────────────
//   { action:'start-recording', roomName, meetingId?, context? }   → { egressId, recordingId, playbackUrl }
//   { action:'stop-recording',  roomName, egressId?, context? }
//   { action:'list-recordings', channelId? , meetingId?, roomName? } → { recordings: [...] }
//   6A broadcast: { action:'start-hls', roomName, channelId, context } → { egressId, playbackUrl }
//                 { action:'stop-hls',  channelId, context }
//   6C simulcast: { action:'add-simulcast',    roomName, channelId, platform, rtmpUrl, context }
//                 { action:'remove-simulcast', channelId, platform, context }
//                 { action:'list-simulcast',   channelId }
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { EgressClient, SegmentedFileOutput, S3Upload, StreamOutput, StreamProtocol } from 'https://esm.sh/livekit-server-sdk@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HOST_TABLE: Record<string, string> = {
  meeting: 'meetings',
  ministry_meeting: 'ministry_video_meetings',
  channel_meeting: 'live_channel_video_meetings',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

const httpUrl = (wsUrl: string) => wsUrl.replace(/^ws/, 'http');

// Resolves the ministry that owns a would-be recording, from the same
// context shape isDbHost checks. A plain 'meeting' kind is an individual
// user's meeting — no ministry, no enforcement applies.
async function resolveMinistryIdFromContext(
  admin: ReturnType<typeof createClient>,
  ctxKind: string,
  meetingId: string | undefined,
  channelId: string | null | undefined,
): Promise<string | null> {
  if (ctxKind === 'channel') {
    if (!channelId) return null;
    const { data } = await admin.from('live_channels').select('ministry_id').eq('id', channelId).maybeSingle();
    return (data as { ministry_id?: string } | null)?.ministry_id ?? null;
  }
  if (ctxKind === 'ministry_meeting' && meetingId) {
    const { data } = await admin.from('ministry_video_meetings').select('ministry_id').eq('id', meetingId).maybeSingle();
    return (data as { ministry_id?: string } | null)?.ministry_id ?? null;
  }
  if (ctxKind === 'channel_meeting' && meetingId) {
    const { data: m } = await admin.from('live_channel_video_meetings').select('channel_id').eq('id', meetingId).maybeSingle();
    const cId = (m as { channel_id?: string } | null)?.channel_id;
    if (!cId) return null;
    const { data: c } = await admin.from('live_channels').select('ministry_id').eq('id', cId).maybeSingle();
    return (c as { ministry_id?: string } | null)?.ministry_id ?? null;
  }
  return null;
}

// Storage-full (add-on ministries only) and hours-quota (all ministries)
// gates, checked right before starting a new egress — a recording is the
// thing that consumes both. `kind` is 'meeting' or 'broadcast' (channel).
async function checkMinistryCanRecord(
  admin: ReturnType<typeof createClient>,
  ministryId: string,
  kind: 'meeting' | 'broadcast',
): Promise<{ allowed: boolean; reason?: string }> {
  const [{ data: storageRows }, { data: hoursRows }] = await Promise.all([
    admin.rpc('get_ministry_storage_status', { p_ministry_id: ministryId }),
    admin.rpc('get_ministry_hours_status', { p_ministry_id: ministryId }),
  ]);
  const storage = (storageRows as { is_full?: boolean }[] | null)?.[0];
  if (storage?.is_full) {
    return { allowed: false, reason: 'Storage full — this ministry has used its full storage allotment. Buy more storage or delete old content before recording.' };
  }
  const hours = (hoursRows as {
    meeting_hours_exhausted?: boolean; broadcast_hours_exhausted?: boolean;
  }[] | null)?.[0];
  if (kind === 'meeting' && hours?.meeting_hours_exhausted) {
    return { allowed: false, reason: 'This ministry has used all its meeting hours for this month. Upgrade or wait until next month to record more.' };
  }
  if (kind === 'broadcast' && hours?.broadcast_hours_exhausted) {
    return { allowed: false, reason: 'This ministry has used all its live-broadcast hours for this month. Upgrade or wait until next month to record more.' };
  }
  return { allowed: true };
}

async function isDbHost(admin: ReturnType<typeof createClient>, userId: string, ctx: any): Promise<boolean> {
  const c = ctx ?? {};
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

    const s3cfg = {
      accessKey: Deno.env.get('S3_ACCESS_KEY') ?? '',
      secret: Deno.env.get('S3_SECRET') ?? '',
      bucket: Deno.env.get('S3_BUCKET') ?? 'livekit-egress',
      region: Deno.env.get('S3_REGION') ?? 'us-east-1',
      endpoint: Deno.env.get('S3_ENDPOINT') ?? '',
    };
    const publicBase = Deno.env.get('S3_PUBLIC_BASE') ?? `${s3cfg.endpoint}/${s3cfg.bucket}`;

    const body = await req.json();
    const action = body.action as string;

    const admin = createClient(SB_URL!, SB_SERVICE!);

    // list-recordings is a read — no host check (VOD list). Returns MuxRecording shape.
    if (action === 'list-recordings') {
      let q = admin.from('livekit_recordings').select('*').order('started_at', { ascending: false });
      // meetingId is the stable identifier callers actually have (a meeting's DB
      // id); room_name is the generated LiveKit room string, which the caller
      // rarely knows and must not be confused with meetingId (they used to be
      // passed interchangeably, which meant this query never matched anything).
      if (body.channelId) q = q.eq('channel_id', body.channelId);
      else if (body.meetingId) q = q.eq('meeting_id', body.meetingId);
      else if (body.roomName) q = q.eq('room_name', body.roomName);
      const { data } = await q;
      const recordings = (data ?? [])
        .filter((r: any) => r.status !== 'failed')
        .map((r: any) => ({
          uid: r.id,
          created: r.started_at,
          duration: r.duration_seconds ?? 0,
          hls: r.playback_url,
          thumbnail: '',
          download: r.playback_url,
        }));
      return json({ recordings });
    }

    if (action === 'list-simulcast') {
      const { data } = await admin
        .from('live_channel_simulcast_targets')
        .select('*')
        .eq('channel_id', body.channelId);
      // Same shape as channel-simulcast (stream keys omitted; hasKey substitute).
      return json({
        success: true,
        targets: (data ?? []).map((t: any) => ({ ...t, hasKey: !!t.egress_id, mux_target_id: t.mux_target_id ?? null })),
      });
    }

    // start/stop require an authenticated host.
    const userClient = createClient(SB_URL!, SB_ANON!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (!(await isDbHost(admin, user.id, body.context))) return json({ error: 'Only the host can record' }, 403);

    const egressClient = new EgressClient(httpUrl(LIVEKIT_URL), KEY, SECRET);

    if (action === 'start-recording') {
      if (!body.roomName) return json({ error: 'roomName required' }, 400);

      // Determine where this recording lives from the meeting kind:
      //  - a meeting kind → write back to that meetings table's recording_* columns
      //    (so RecordingManager / meeting VOD viewers show it), kind='meeting'
      //  - 'channel' (broadcast) → channel VOD (livekit_recordings.channel_id), kind='channel'
      const ctxKind = body.context?.kind ?? 'meeting';
      const meetingTable = HOST_TABLE[ctxKind]; // undefined for 'channel'
      const isChannelBroadcast = ctxKind === 'channel';

      const startMeetingId = body.context?.meetingId ?? body.meetingId ?? body.roomName;
      const startChannelId = isChannelBroadcast ? (body.context?.channelId ?? body.channelId ?? null) : null;
      const startMinistryId = await resolveMinistryIdFromContext(admin, ctxKind, startMeetingId, startChannelId);
      if (startMinistryId) {
        const gate = await checkMinistryCanRecord(admin, startMinistryId, isChannelBroadcast ? 'broadcast' : 'meeting');
        if (!gate.allowed) return json({ error: gate.reason }, 403);
      }

      const ts = Date.now();
      const prefix = `recordings/${body.roomName}/${ts}`;
      const s3 = new S3Upload({ ...s3cfg, forcePathStyle: true });
      const output = new SegmentedFileOutput({
        filenamePrefix: `${prefix}/seg`,
        playlistName: `${prefix}/index.m3u8`,
        segmentDuration: 4,
        output: { case: 's3', value: s3 },
      });
      const info = await egressClient.startRoomCompositeEgress(body.roomName, { segments: output }, { layout: 'grid' });
      const playbackUrl = `${publicBase}/${prefix}/index.m3u8`;

      const { data: row } = await admin.from('livekit_recordings').insert({
        egress_id: info.egressId,
        room_name: body.roomName,
        kind: isChannelBroadcast ? 'channel' : 'meeting',
        channel_id: isChannelBroadcast ? (body.context?.channelId ?? body.channelId ?? null) : null,
        meeting_id: body.context?.meetingId ?? body.meetingId ?? body.roomName,
        meeting_table: meetingTable ?? null,
        status: 'recording',
        filepath: prefix,
        playback_url: playbackUrl,
      }).select('id').maybeSingle();

      // Mark the meeting row as recording (best-effort — column set may vary by table).
      if (meetingTable && body.context?.meetingId) {
        await admin.from(meetingTable).update({
          recording_status: 'recording',
          recording_started_at: new Date().toISOString(),
        }).eq('id', body.context.meetingId);
      }

      return json({ egressId: info.egressId, recordingId: (row as { id?: string } | null)?.id, playbackUrl });
    }

    // ── 6A · Live HLS Egress ─────────────────────────────────────────────────
    // Two scopes:
    //   channel broadcast (context.kind='channel') → writes live_channels.hls_playback_url
    //   meeting webinar   (context.kind=<meeting kind>) → writes <meetings table>.hls_playback_url
    // Either way the audience's HlsPlayer picks the URL up via Supabase realtime.
    if (action === 'start-hls') {
      if (!body.roomName) return json({ error: 'roomName required' }, 400);
      const ctxKind = body.context?.kind;
      const isChannel = ctxKind === 'channel';
      const meetingTable = HOST_TABLE[ctxKind ?? ''];
      const meetingId = body.context?.meetingId;
      const channelId = body.channelId ?? body.context?.channelId;
      if (isChannel && !channelId) return json({ error: 'channelId required for channel broadcast' }, 400);
      if (!isChannel && !(meetingTable && meetingId)) return json({ error: 'meeting context required' }, 400);

      const hlsMinistryId = await resolveMinistryIdFromContext(admin, ctxKind ?? '', meetingId, channelId);
      if (hlsMinistryId) {
        const gate = await checkMinistryCanRecord(admin, hlsMinistryId, isChannel ? 'broadcast' : 'meeting');
        if (!gate.allowed) return json({ error: gate.reason }, 403);
      }

      const ts = Date.now();
      const prefix = `broadcasts/${isChannel ? channelId : meetingId}/${ts}`;
      const s3 = new S3Upload({ ...s3cfg, forcePathStyle: true });
      const output = new SegmentedFileOutput({
        filenamePrefix: `${prefix}/seg`,
        playlistName: `${prefix}/index.m3u8`,
        segmentDuration: 4,
        output: { case: 's3', value: s3 },
      });
      const info = await egressClient.startRoomCompositeEgress(body.roomName, { segments: output }, { layout: 'grid' });
      const playbackUrl = `${publicBase}/${prefix}/index.m3u8`;

      // The live HLS doubles as the VOD (§12) — track it as a recording too.
      await admin.from('livekit_recordings').insert({
        egress_id: info.egressId,
        room_name: body.roomName,
        kind: isChannel ? 'channel' : 'meeting',
        channel_id: isChannel ? channelId : null,
        meeting_id: meetingId ?? body.roomName,
        meeting_table: isChannel ? null : meetingTable,
        status: 'recording',
        filepath: prefix,
        playback_url: playbackUrl,
      });

      if (isChannel) {
        await admin.from('channel_streams').upsert(
          { channel_id: channelId, hls_egress_id: info.egressId, updated_at: new Date().toISOString() },
          { onConflict: 'channel_id' },
        );
        await admin.from('live_channels').update({ hls_playback_url: playbackUrl, is_hls_live: true }).eq('id', channelId);
      } else {
        await admin.from(meetingTable).update({ hls_playback_url: playbackUrl }).eq('id', meetingId);
      }
      return json({ egressId: info.egressId, playbackUrl });
    }

    if (action === 'stop-hls') {
      const ctxKind = body.context?.kind;
      const isChannel = ctxKind === 'channel';
      const meetingTable = HOST_TABLE[ctxKind ?? ''];
      const meetingId = body.context?.meetingId;
      const channelId = body.channelId ?? body.context?.channelId;

      let egressId: string | undefined;
      if (isChannel && channelId) {
        const { data: cs } = await admin.from('channel_streams').select('hls_egress_id').eq('channel_id', channelId).maybeSingle();
        egressId = (cs as { hls_egress_id?: string } | null)?.hls_egress_id;
      } else if (body.roomName) {
        const { data } = await admin.from('livekit_recordings')
          .select('egress_id').eq('room_name', body.roomName).eq('status', 'recording')
          .order('started_at', { ascending: false }).limit(1).maybeSingle();
        egressId = (data as { egress_id?: string } | null)?.egress_id;
      }

      if (egressId) {
        await egressClient.stopEgress(egressId).catch(() => {});
        await admin.from('livekit_recordings').update({ status: 'processing', ended_at: new Date().toISOString() }).eq('egress_id', egressId);
      }
      if (isChannel && channelId) {
        await admin.from('channel_streams').update({ hls_egress_id: null, updated_at: new Date().toISOString() }).eq('channel_id', channelId);
        await admin.from('live_channels').update({ is_hls_live: false }).eq('id', channelId);
      } else if (meetingTable && meetingId) {
        // Leave hls_playback_url in place — it becomes the VOD link once Egress finalises.
      }
      return json({ success: true });
    }

    // ── 6C · Simulcast-out → one RTMP Egress per destination ──────────────────
    if (action === 'add-simulcast') {
      if (!body.roomName || !body.channelId || !body.rtmpUrl || !body.platform) {
        return json({ error: 'roomName, channelId, platform, rtmpUrl required' }, 400);
      }
      const stream = new StreamOutput({ protocol: StreamProtocol.RTMP, urls: [body.rtmpUrl] });
      const info = await egressClient.startRoomCompositeEgress(body.roomName, { stream }, { layout: 'grid' });
      await admin.from('live_channel_simulcast_targets').upsert(
        { channel_id: body.channelId, platform: body.platform, enabled: true, egress_id: info.egressId },
        { onConflict: 'channel_id,platform' },
      );
      return json({ success: true, egressId: info.egressId });
    }

    if (action === 'remove-simulcast') {
      if (!body.channelId || !body.platform) return json({ error: 'channelId + platform required' }, 400);
      const { data: tgt } = await admin
        .from('live_channel_simulcast_targets')
        .select('egress_id')
        .eq('channel_id', body.channelId).eq('platform', body.platform).maybeSingle();
      const egressId = (tgt as { egress_id?: string } | null)?.egress_id;
      if (egressId) await egressClient.stopEgress(egressId).catch(() => {});
      await admin.from('live_channel_simulcast_targets')
        .update({ enabled: false, egress_id: null })
        .eq('channel_id', body.channelId).eq('platform', body.platform);
      return json({ success: true });
    }

    if (action === 'stop-recording') {
      let egressId = body.egressId as string | undefined;
      if (!egressId) {
        const { data } = await admin
          .from('livekit_recordings')
          .select('egress_id')
          .eq('room_name', body.roomName)
          .eq('status', 'recording')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        egressId = (data as { egress_id?: string } | null)?.egress_id;
      }
      if (egressId) {
        await egressClient.stopEgress(egressId).catch(() => {});
        await admin.from('livekit_recordings')
          .update({ status: 'processing', ended_at: new Date().toISOString() })
          .eq('egress_id', egressId);
      }
      return json({ success: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error('livekit-egress error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
