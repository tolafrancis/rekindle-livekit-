// supabase/functions/livekit-webhook/index.ts
//
// LiveKit server -> Supabase webhook receiver.
// Handles:
//   1. egress_ended / egress_updated: Flips recording status to completed/failed and records usage metering.
//   2. ingress_started: Auto-starts HLS broadcast egress and sets live_channels.is_live = true.
//   3. ingress_ended: Auto-stops HLS broadcast egress and sets live_channels.is_live = false.
//
// ⚠️ Deploy with JWT VERIFICATION OFF (verify_jwt = false in config.toml).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { WebhookReceiver, EgressStatus, EgressClient, SegmentedFileOutput, S3Upload } from 'https://esm.sh/livekit-server-sdk@2';

const httpUrl = (wsUrl: string) => wsUrl.replace(/^ws/, 'http');

// Storage-full and hours-quota gate check for ministry recording/broadcasting
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

// Resolves the channel owned by an ingress event via channel_streams.ingress_id or roomName fallback
async function resolveChannelIdForIngress(
  admin: ReturnType<typeof createClient>,
  ingressId?: string,
  roomName?: string,
): Promise<string | null> {
  if (ingressId) {
    const { data } = await admin.from('channel_streams').select('channel_id').eq('ingress_id', ingressId).maybeSingle();
    if (data?.channel_id) return data.channel_id;
  }
  if (roomName && roomName.startsWith('channel-')) {
    const channelIdFromRoom = roomName.replace(/^channel-/, '');
    if (channelIdFromRoom) {
      const { data } = await admin.from('live_channels').select('id').eq('id', channelIdFromRoom).maybeSingle();
      if (data?.id) return data.id;
    }
  }
  return null;
}

// Executes start-hls logic server-side when OBS starts publishing
async function autoStartHlsBroadcast(
  admin: ReturnType<typeof createClient>,
  egressClient: EgressClient,
  channelId: string,
  roomName: string,
  s3cfg: any,
  publicBase: string,
) {
  // Prevent duplicate egresses if already running
  const { data: cs } = await admin.from('channel_streams').select('hls_egress_id').eq('channel_id', channelId).maybeSingle();
  if (cs?.hls_egress_id) {
    console.log(`[livekit-webhook] HLS broadcast egress already running for channel ${channelId}`);
    await admin.from('live_channels').update({ is_live: true, is_hls_live: true }).eq('id', channelId);
    return;
  }

  // Quota and storage gate check (0270 alignment)
  const { data: channelData } = await admin.from('live_channels').select('ministry_id').eq('id', channelId).maybeSingle();
  const ministryId = (channelData as { ministry_id?: string } | null)?.ministry_id;
  if (ministryId) {
    const gate = await checkMinistryCanRecord(admin, ministryId, 'broadcast');
    if (!gate.allowed) {
      console.warn(`[livekit-webhook] Broadcast gate blocked auto-start for channel ${channelId} (ministry ${ministryId}): ${gate.reason}`);
      return;
    }
  }

  const ts = Date.now();
  const prefix = `broadcasts/${channelId}/${ts}`;
  const s3 = new S3Upload({ ...s3cfg, forcePathStyle: true });
  const output = new SegmentedFileOutput({
    filenamePrefix: `${prefix}/seg`,
    playlistName: `${prefix}/index.m3u8`,
    segmentDuration: 4,
    output: { case: 's3', value: s3 },
  });

  const info = await egressClient.startRoomCompositeEgress(roomName, { segments: output }, { layout: 'grid' });
  const playbackUrl = `${publicBase}/${prefix}/index.m3u8`;

  const { error: hlsInsertError } = await admin.from('livekit_recordings').insert({
    egress_id: info.egressId,
    room_name: roomName,
    kind: 'channel',
    channel_id: channelId,
    meeting_id: roomName,
    meeting_table: null,
    status: 'recording',
    filepath: prefix,
    playback_url: playbackUrl,
  });
  if (hlsInsertError) console.error('[livekit-webhook] failed to insert livekit_recordings row (ingress_started):', hlsInsertError);

  await admin.from('channel_streams').upsert(
    { channel_id: channelId, hls_egress_id: info.egressId, updated_at: new Date().toISOString() },
    { onConflict: 'channel_id' },
  );

  // Set is_live = true and update HLS playback URL
  await admin.from('live_channels').update({
    hls_playback_url: playbackUrl,
    is_hls_live: true,
    is_live: true,
  }).eq('id', channelId);

  console.log(`[livekit-webhook] Successfully auto-started broadcast for channel ${channelId}, egressId=${info.egressId}`);
}

// Executes stop-hls logic server-side when OBS disconnects
async function autoStopHlsBroadcast(
  admin: ReturnType<typeof createClient>,
  egressClient: EgressClient,
  channelId: string,
  roomName?: string,
) {
  let egressId: string | undefined;
  if (channelId) {
    const { data: cs } = await admin.from('channel_streams').select('hls_egress_id').eq('channel_id', channelId).maybeSingle();
    egressId = (cs as { hls_egress_id?: string } | null)?.hls_egress_id;
  } else if (roomName) {
    const { data } = await admin.from('livekit_recordings')
      .select('egress_id').eq('room_name', roomName).eq('status', 'recording')
      .order('started_at', { ascending: false }).limit(1).maybeSingle();
    egressId = (data as { egress_id?: string } | null)?.egress_id;
  }

  if (egressId) {
    await egressClient.stopEgress(egressId).catch((err) => {
      console.warn(`[livekit-webhook] stopEgress error for egress ${egressId}:`, err);
    });
    await admin.from('livekit_recordings').update({ status: 'processing', ended_at: new Date().toISOString() }).eq('egress_id', egressId);
  }

  if (channelId) {
    await admin.from('channel_streams').update({ hls_egress_id: null, updated_at: new Date().toISOString() }).eq('channel_id', channelId);
    await admin.from('live_channels').update({ is_hls_live: false, is_live: false }).eq('id', channelId);
  }

  console.log(`[livekit-webhook] Successfully auto-stopped broadcast for channel ${channelId}`);
}

// Metering ownership helper
async function resolveMinistryId(
  admin: ReturnType<typeof createClient>,
  rec: { kind?: string; channel_id?: string; meeting_table?: string; meeting_id?: string },
): Promise<string | null> {
  if (rec.channel_id) {
    const { data } = await admin.from('live_channels').select('ministry_id').eq('id', rec.channel_id).maybeSingle();
    return (data as { ministry_id?: string } | null)?.ministry_id ?? null;
  }
  if (rec.meeting_table === 'ministry_video_meetings' && rec.meeting_id) {
    const { data } = await admin.from('ministry_video_meetings').select('ministry_id').eq('id', rec.meeting_id).maybeSingle();
    return (data as { ministry_id?: string } | null)?.ministry_id ?? null;
  }
  if (rec.meeting_table === 'live_channel_video_meetings' && rec.meeting_id) {
    const { data: m } = await admin.from('live_channel_video_meetings').select('channel_id').eq('id', rec.meeting_id).maybeSingle();
    const channelId = (m as { channel_id?: string } | null)?.channel_id;
    if (!channelId) return null;
    const { data: c } = await admin.from('live_channels').select('ministry_id').eq('id', channelId).maybeSingle();
    return (c as { ministry_id?: string } | null)?.ministry_id ?? null;
  }
  return null;
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL');
    const KEY = Deno.env.get('LIVEKIT_API_KEY');
    const SECRET = Deno.env.get('LIVEKIT_API_SECRET');
    const SB_URL = Deno.env.get('SUPABASE_URL');
    const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!KEY || !SECRET || !SB_URL || !SB_SERVICE) {
      return new Response('Server configuration missing', { status: 500 });
    }

    const s3cfg = {
      accessKey: Deno.env.get('S3_ACCESS_KEY') ?? '',
      secret: Deno.env.get('S3_SECRET') ?? '',
      bucket: Deno.env.get('S3_BUCKET') ?? 'livekit-egress',
      region: Deno.env.get('S3_REGION') ?? 'us-east-1',
      endpoint: Deno.env.get('S3_ENDPOINT') ?? '',
    };
    const publicBase = Deno.env.get('S3_PUBLIC_BASE') ?? `${s3cfg.endpoint}/${s3cfg.bucket}`;

    // Verify LiveKit signature over raw request body
    const receiver = new WebhookReceiver(KEY, SECRET);
    const raw = await req.text();
    const event = await receiver.receive(raw, req.headers.get('Authorization') ?? undefined);

    const admin = createClient(SB_URL, SB_SERVICE);

    // ── 1. Ingress Events (Auto Start/Stop OBS Broadcast) ───────────────────
    if (event.event === 'ingress_started') {
      const info = event.ingressInfo;
      const ingressId = info?.ingressId;
      const roomName = info?.roomName ?? (info?.ingressId ? `channel-${info.ingressId}` : undefined);
      const channelId = await resolveChannelIdForIngress(admin, ingressId, roomName);

      if (channelId && roomName && LIVEKIT_URL) {
        const egressClient = new EgressClient(httpUrl(LIVEKIT_URL), KEY, SECRET);
        await autoStartHlsBroadcast(admin, egressClient, channelId, roomName, s3cfg, publicBase);
      } else {
        console.warn(`[livekit-webhook] ingress_started received, but could not resolve channel for ingressId=${ingressId}`);
      }
    } else if (event.event === 'ingress_ended') {
      const info = event.ingressInfo;
      const ingressId = info?.ingressId;
      const roomName = info?.roomName;
      const channelId = await resolveChannelIdForIngress(admin, ingressId, roomName);

      if (channelId && LIVEKIT_URL) {
        const egressClient = new EgressClient(httpUrl(LIVEKIT_URL), KEY, SECRET);
        await autoStopHlsBroadcast(admin, egressClient, channelId, roomName);
      } else {
        console.warn(`[livekit-webhook] ingress_ended received, but could not resolve channel for ingressId=${ingressId}`);
      }
    }

    // ── 2. Egress Lifecycle Events (Recording Finalization & Metering) ──────
    if (event.event === 'egress_ended' || event.event === 'egress_updated') {
      const info = event.egressInfo;
      if (info?.egressId) {
        const startNs = Number(info.startedAt ?? 0);
        const endNs = Number(info.endedAt ?? 0);
        const duration = startNs && endNs ? Math.max(0, Math.round((endNs - startNs) / 1e9)) : null;

        const ended = event.event === 'egress_ended';
        const failed = info.status === EgressStatus.EGRESS_FAILED || !!info.error;

        const patch: Record<string, unknown> = {
          status: ended ? (failed ? 'failed' : 'completed') : 'processing',
        };
        if (ended) patch.ended_at = new Date().toISOString();
        if (duration) patch.duration_seconds = duration;

        const { data: rows } = await admin
          .from('livekit_recordings')
          .update(patch)
          .eq('egress_id', info.egressId)
          .select('kind, channel_id, meeting_table, meeting_id, playback_url');
        const rec = (rows ?? [])[0] as
          { kind?: string; channel_id?: string; meeting_table?: string; meeting_id?: string; playback_url?: string } | undefined;

        if (ended && !failed && rec?.meeting_table && rec.meeting_id) {
          await admin.from(rec.meeting_table).update({
            recording_url: rec.playback_url,
            recording_status: 'completed',
            recording_duration_seconds: duration,
            recording_ended_at: new Date().toISOString(),
          }).eq('id', rec.meeting_id);
        }

        // Real bug found live (2026-08-21): a channel broadcast's live status
        // is otherwise cleared ONLY by the client — LiveChannelBroadcast.tsx's
        // endBroadcast() (in-browser "Go Live") or ChannelStreamConfig.tsx's
        // handleStopObsBroadcast() (OBS). Either one requires the client to
        // still be connected and actually run that code. A dead track (closed
        // tab, lost connection, crashed browser — anything short of a clean
        // "End Broadcast" click) still makes LiveKit itself end the egress
        // (its source disappeared) and fire this webhook server-side — but
        // nothing was clearing live_channels.is_live/is_hls_live or
        // channel_streams.hls_egress_id from that path, so the channel stayed
        // stuck "live" indefinitely with nothing left actually streaming
        // (confirmed live: a channel showing is_live=true almost 24h after
        // its egress had genuinely EGRESS_COMPLETE'd, "Source closed"). This
        // mirrors autoStopHlsBroadcast's own writes above (ingress_ended path)
        // — same cleanup, reached from the egress side instead of the
        // ingress side, and safe to run unconditionally on `ended` (not just
        // `!failed`): a FAILED egress just as surely means nothing is live
        // anymore. Idempotent/harmless if the client's own write already
        // succeeded — this is a backstop, not the primary path.
        if (ended && rec?.kind === 'channel' && rec.channel_id) {
          await admin.from('channel_streams').update({ hls_egress_id: null, updated_at: new Date().toISOString() }).eq('channel_id', rec.channel_id);
          await admin.from('live_channels').update({ is_hls_live: false, is_live: false }).eq('id', rec.channel_id);
        }

        if (ended && !failed && rec) {
          const ministryId = await resolveMinistryId(admin, rec);
          if (ministryId) {
            const bytes = (info.segmentResults ?? []).reduce(
              (sum: number, s: { size?: unknown }) => sum + Number(s.size ?? 0), 0,
            );
            const minutes = duration ? Math.ceil(duration / 60) : 0;
            await admin.rpc('increment_ministry_usage', {
              p_ministry_id: ministryId,
              p_bytes_delta: bytes,
              p_meeting_minutes_delta: rec.kind === 'meeting' ? minutes : 0,
              p_broadcast_minutes_delta: rec.kind === 'channel' ? minutes : 0,
            }).then(({ error }: { error: unknown }) => {
              if (error) console.error('[livekit-webhook] usage metering failed:', error);
            });
          }
        }
      }
    }

    return new Response('ok', { status: 200 });
  } catch (error) {
    console.error('livekit-webhook error:', error);
    return new Response('unauthorized', { status: 401 });
  }
});
