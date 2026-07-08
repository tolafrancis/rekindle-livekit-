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
//   { action:'list-recordings', channelId? , roomName? }            → { recordings: [...] }
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
      if (body.channelId) q = q.eq('channel_id', body.channelId);
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

      const ts = Date.now();
      const prefix = `recordings/${body.roomName}/${ts}`;
      const s3 = new S3Upload({ ...s3cfg, forcePathStyle: true });
      const output = new SegmentedFileOutput({
        filenamePrefix: `${prefix}/seg`,
        playlistName: `${prefix}/index.m3u8`,
        segmentDuration: 4,
        s3,
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

    // ── 6A · Host broadcast → HLS Egress ─────────────────────────────────────
    if (action === 'start-hls') {
      if (!body.roomName || !body.channelId) return json({ error: 'roomName + channelId required' }, 400);
      const ts = Date.now();
      const prefix = `broadcasts/${body.channelId}/${ts}`;
      const s3 = new S3Upload({ ...s3cfg, forcePathStyle: true });
      const output = new SegmentedFileOutput({
        filenamePrefix: `${prefix}/seg`,
        playlistName: `${prefix}/index.m3u8`,
        segmentDuration: 4,
        s3,
      });
      const info = await egressClient.startRoomCompositeEgress(body.roomName, { segments: output }, { layout: 'grid' });
      const playbackUrl = `${publicBase}/${prefix}/index.m3u8`;

      // The broadcast HLS doubles as the channel VOD (§12) — track it as a recording too.
      await admin.from('livekit_recordings').insert({
        egress_id: info.egressId, room_name: body.roomName, kind: 'channel',
        channel_id: body.channelId, status: 'recording', filepath: prefix, playback_url: playbackUrl,
      });
      await admin.from('channel_streams').upsert(
        { channel_id: body.channelId, hls_egress_id: info.egressId, updated_at: new Date().toISOString() },
        { onConflict: 'channel_id' },
      );
      await admin.from('live_channels').update({ hls_playback_url: playbackUrl, is_hls_live: true }).eq('id', body.channelId);
      return json({ egressId: info.egressId, playbackUrl });
    }

    if (action === 'stop-hls') {
      if (!body.channelId) return json({ error: 'channelId required' }, 400);
      const { data: cs } = await admin.from('channel_streams').select('hls_egress_id').eq('channel_id', body.channelId).maybeSingle();
      const egressId = (cs as { hls_egress_id?: string } | null)?.hls_egress_id;
      if (egressId) {
        await egressClient.stopEgress(egressId).catch(() => {});
        await admin.from('livekit_recordings').update({ status: 'processing', ended_at: new Date().toISOString() }).eq('egress_id', egressId);
        await admin.from('channel_streams').update({ hls_egress_id: null, updated_at: new Date().toISOString() }).eq('channel_id', body.channelId);
      }
      await admin.from('live_channels').update({ is_hls_live: false }).eq('id', body.channelId);
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
