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
//   { action:'track-participant', event:'join'|'leave', meetingId, participantId,
//     participantName?, isGuest?, context? } → { success: true }
//   { action:'list-participants', meetingId, context } → { participants: [...], totalCount }  (host only)
//   6A broadcast: { action:'start-hls', roomName, channelId, context } → { egressId, playbackUrl }
//                 { action:'stop-hls',  channelId, context }
//   6C simulcast: { action:'add-simulcast',    roomName, channelId, platform, rtmpUrl, context }
//                 { action:'remove-simulcast', channelId, platform, context }
//                 { action:'list-simulcast',   channelId }
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { EgressClient, RoomServiceClient, SegmentedFileOutput, EncodedFileOutput, S3Upload, StreamOutput, StreamProtocol, TrackSource } from 'https://esm.sh/livekit-server-sdk@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HOST_TABLE: Record<string, string> = {
  meeting: 'meetings',
  ministry_meeting: 'ministry_video_meetings',
  channel_meeting: 'live_channel_video_meetings',
  ministry_webinar: 'ministry_webinars',
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
  if (ctxKind === 'ministry_webinar' && meetingId) {
    const { data } = await admin.from('ministry_webinars').select('ministry_id').eq('id', meetingId).maybeSingle();
    return (data as { ministry_id?: string } | null)?.ministry_id ?? null;
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

// Track Composite Egress (channel broadcasts, see start-hls below) needs the
// host's track SIDs to already exist server-side at the moment it's called —
// unlike Room Composite it never picks up a track published after it starts.
// The host joins muted and taps mic/camera client-side; even after the client
// sees isMicOn/isCameraOn flip, the publish still has to round-trip to the
// LiveKit server before listParticipants() reflects it. A single lookup right
// after the client's own fixed delay was racing that — most commonly losing
// the video track, which is exactly the "host video never shows up" bug: a
// Track Composite job started audio-only stays audio-only forever, it never
// gets a second chance at the video track. Retry a few times, and don't
// hand back a call the caller can start on if a REQUIRED track never showed.
async function resolveHostTracks(
  roomService: RoomServiceClient,
  roomName: string,
  hostIdentity: string,
  needsVideo: boolean,
): Promise<{ audioTrackId?: string; videoTrackId?: string }> {
  const attempts = 6;
  let last: { audioTrackId?: string; videoTrackId?: string } = {};
  for (let i = 0; i < attempts; i++) {
    try {
      const participants = await roomService.listParticipants(roomName);
      const hostP = participants.find((p) => p.identity === hostIdentity);
      let audioTrackId: string | undefined;
      let videoTrackId: string | undefined;
      for (const t of hostP?.tracks ?? []) {
        if (t.source === TrackSource.MICROPHONE) audioTrackId = t.sid;
        if (t.source === TrackSource.CAMERA) videoTrackId = t.sid;
      }
      last = { audioTrackId, videoTrackId };
      const haveEnough = (audioTrackId || videoTrackId) && (!needsVideo || videoTrackId);
      if (haveEnough) return last;
    } catch (lookupErr) {
      console.warn(`[livekit-egress] host track lookup attempt ${i + 1}/${attempts} failed:`, lookupErr);
    }
    if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return last;
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

    // list-recordings is a read — no host check for meetings/channels (VOD
    // list, unchanged, see the config.toml note this was intentional there).
    // Webinar rows get real enforcement below (2026-09-22) — a webinar's
    // recording can be marked private, and the URL itself must not be handed
    // back to anyone who merely knows the webinar's id. Returns the shared
    // ChannelRecording/MeetingRecording shape.
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
      let rows = (data ?? []).filter((r: any) => r.status !== 'failed');

      const webinarRows = rows.filter((r: any) => r.kind === 'webinar' && r.meeting_id);
      if (webinarRows.length > 0) {
        const webinarIds = [...new Set(webinarRows.map((r: any) => r.meeting_id))];
        const { data: webinars } = await admin
          .from('ministry_webinars')
          .select('id, ministry_id, recording_visibility')
          .in('id', webinarIds);
        const byId = new Map((webinars ?? []).map((w: any) => [w.id, w]));
        const privateIds = webinarIds.filter((id) => byId.get(id)?.recording_visibility === 'private');

        if (privateIds.length > 0) {
          const userClient = createClient(SB_URL!, SB_ANON!, {
            global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
          });
          const { data: { user: caller } } = await userClient.auth.getUser();
          const authorized = new Set<string>();
          if (caller) {
            for (const webinarId of privateIds) {
              const w = byId.get(webinarId);
              if (!w) continue;
              const [{ data: isManager }, { data: isAdmin }] = await Promise.all([
                admin.rpc('is_webinar_manager', { p_webinar_id: webinarId, p_user_id: caller.id }),
                admin.rpc('is_group_admin', { p_ministry_id: w.ministry_id, p_user_id: caller.id }),
              ]);
              if (isManager || isAdmin) authorized.add(webinarId);
            }
          }
          rows = rows.filter((r: any) => r.kind !== 'webinar' || !privateIds.includes(r.meeting_id) || authorized.has(r.meeting_id));
        }
      }

      const recordings = rows.map((r: any) => ({
        uid: r.id,
        created: r.started_at,
        duration: r.duration_seconds ?? 0,
        hls: r.playback_url,
        thumbnail: '',
        // Real MP4 file, when this recording was made with the file output
        // (see start-recording). Older rows have no download_url — omit the
        // button rather than hand back the .m3u8 playlist, which isn't a
        // downloadable file and just opens the browser's raw HLS handling.
        download: r.download_url ?? null,
      }));
      return json({ recordings });
    }

    if (action === 'list-simulcast') {
      const isMeeting = body.context?.kind && body.context.kind !== 'channel';
      const table = isMeeting ? 'meeting_simulcast_targets' : 'live_channel_simulcast_targets';
      const idCol = isMeeting ? 'meeting_id' : 'channel_id';
      const targetId = body.meetingId ?? body.channelId ?? body.context?.meetingId ?? body.context?.channelId;
      const { data } = await admin
        .from(table)
        .select('*')
        .eq(idCol, targetId);
      // Same shape as channel-simulcast (stream keys omitted; hasKey substitute).
      return json({
        success: true,
        targets: (data ?? []).map((t: any) => ({ ...t, hasKey: !!t.egress_id, mux_target_id: t.mux_target_id ?? null })),
      });
    }

    // track-participant is a self-report (any current participant, including
    // guests with no Supabase auth session — see meeting_attendance's header
    // comment) — no host check, and no egress/roomService needed.
    if (action === 'track-participant') {
      const { meetingId, participantId, participantName, isGuest, event } = body;
      if (!meetingId || !participantId || !event) return json({ error: 'meetingId, participantId and event required' }, 400);
      const meetingTable = HOST_TABLE[body.context?.kind ?? 'ministry_meeting'] ?? 'ministry_video_meetings';

      if (event === 'join') {
        const { data: existing } = await admin
          .from('meeting_attendance')
          .select('id')
          .eq('meeting_id', meetingId)
          .eq('user_id', participantId)
          .eq('is_active', true)
          .maybeSingle();
        if (existing) {
          await admin.from('meeting_attendance').update({ is_active: true, left_at: null }).eq('id', existing.id);
        } else {
          await admin.from('meeting_attendance').insert({
            meeting_id: meetingId,
            meeting_table: meetingTable,
            user_id: participantId,
            user_name: participantName || 'Guest',
            is_guest: !!isGuest,
            joined_at: new Date().toISOString(),
            is_active: true,
          });
        }
      } else {
        await admin
          .from('meeting_attendance')
          .update({ is_active: false, left_at: new Date().toISOString() })
          .eq('meeting_id', meetingId)
          .eq('user_id', participantId)
          .eq('is_active', true);
      }
      return json({ success: true });
    }

    // start/stop require an authenticated host.
    const userClient = createClient(SB_URL!, SB_ANON!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (!(await isDbHost(admin, user.id, body.context))) return json({ error: 'Only the host can record' }, 403);

    const egressClient = new EgressClient(httpUrl(LIVEKIT_URL), KEY, SECRET);
    const roomService = new RoomServiceClient(httpUrl(LIVEKIT_URL), KEY, SECRET);

    // list-participants — per-meeting attendance analytics. Host-only (auth
    // already checked above): names + join times are participant PII.
    if (action === 'list-participants') {
      const { data } = await admin
        .from('meeting_attendance')
        .select('user_id, user_name, is_guest, joined_at, left_at, is_active')
        .eq('meeting_id', body.meetingId)
        .order('joined_at', { ascending: true });
      const rows = data ?? [];
      // A guest who reconnects gets a second row (their id is per-tab, not a
      // stable identity) — a signed-in member's id is stable, so collapse
      // theirs to first-joined/last-left for an accurate head count.
      const byUser = new Map<string, { userId: string; userName: string; isGuest: boolean; joinedAt: string; leftAt: string | null; isActive: boolean }>();
      for (const r of rows as any[]) {
        const key = r.is_guest ? `${r.user_id}:${r.joined_at}` : r.user_id;
        const cur = byUser.get(key);
        if (!cur || new Date(r.joined_at) < new Date(cur.joinedAt)) {
          byUser.set(key, {
            userId: r.user_id, userName: r.user_name, isGuest: r.is_guest,
            joinedAt: r.joined_at, leftAt: r.left_at, isActive: r.is_active,
          });
        }
      }
      const participants = Array.from(byUser.values()).sort(
        (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
      );
      return json({ participants, totalCount: participants.length });
    }

    if (action === 'start-recording') {
      if (!body.roomName) return json({ error: 'roomName required' }, 400);

      // Determine where this recording lives from the meeting kind:
      //  - a meeting kind → write back to that meetings table's recording_* columns
      //    (so RecordingManager / meeting VOD viewers show it), kind='meeting'
      //  - 'channel' (broadcast) → channel VOD (livekit_recordings.channel_id), kind='channel'
      const ctxKind = body.context?.kind ?? 'meeting';
      const meetingTable = HOST_TABLE[ctxKind]; // undefined for 'channel'
      const isChannelBroadcast = ctxKind === 'channel';
      const isWebinar = ctxKind === 'ministry_webinar';
      // A webinar is one-to-many like a channel broadcast, not a two-way
      // meeting — meters against broadcast hours, same as a channel.
      const recordingKind: 'meeting' | 'channel' | 'webinar' =
        isChannelBroadcast ? 'channel' : isWebinar ? 'webinar' : 'meeting';

      const startMeetingId = body.context?.meetingId ?? body.meetingId ?? body.roomName;
      const startChannelId = isChannelBroadcast ? (body.context?.channelId ?? body.channelId ?? null) : null;
      const startMinistryId = await resolveMinistryIdFromContext(admin, ctxKind, startMeetingId, startChannelId);
      if (startMinistryId) {
        const gate = await checkMinistryCanRecord(admin, startMinistryId, isChannelBroadcast || isWebinar ? 'broadcast' : 'meeting');
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
      // A single MP4 alongside the HLS segments, purely so "Download" has a real
      // file to hand the browser — the .m3u8 playlist alone can't be downloaded
      // (it's a manifest pointing at dozens of .ts segments, not one file).
      // Same encode, no extra render pass — Egress just multiplexes both outputs.
      const fileOutput = new EncodedFileOutput({
        filepath: `${prefix}/recording.mp4`,
        output: { case: 's3', value: s3 },
      });
      const info = await egressClient.startRoomCompositeEgress(body.roomName, { segments: output, file: fileOutput }, { layout: 'grid' });
      const playbackUrl = `${publicBase}/${prefix}/index.m3u8`;
      const downloadUrl = `${publicBase}/${prefix}/recording.mp4`;

      const { data: row, error: insertError } = await admin.from('livekit_recordings').insert({
        egress_id: info.egressId,
        room_name: body.roomName,
        kind: recordingKind,
        channel_id: isChannelBroadcast ? (body.context?.channelId ?? body.channelId ?? null) : null,
        meeting_id: body.context?.meetingId ?? body.meetingId ?? body.roomName,
        meeting_table: meetingTable ?? null,
        status: 'recording',
        filepath: prefix,
        playback_url: playbackUrl,
        download_url: downloadUrl,
      }).select('id').maybeSingle();
      // The Egress has already started billing on LiveKit's side even if this insert
      // fails — surface it loudly rather than silently losing the tracking row (as
      // happened for every recording before the meeting_table column existed).
      if (insertError) console.error('[livekit-egress] failed to insert livekit_recordings row:', insertError);

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
      const isWebinarHls = ctxKind === 'ministry_webinar';
      const meetingTable = HOST_TABLE[ctxKind ?? ''];
      const meetingId = body.context?.meetingId;
      const channelId = body.channelId ?? body.context?.channelId;
      if (isChannel && !channelId) return json({ error: 'channelId required for channel broadcast' }, 400);
      if (!isChannel && !(meetingTable && meetingId)) return json({ error: 'meeting context required' }, 400);

      const hlsMinistryId = await resolveMinistryIdFromContext(admin, ctxKind ?? '', meetingId, channelId);
      if (hlsMinistryId) {
        const gate = await checkMinistryCanRecord(admin, hlsMinistryId, isChannel || isWebinarHls ? 'broadcast' : 'meeting');
        if (!gate.allowed) return json({ error: gate.reason }, 403);
      }

      const ts = Date.now();
      const prefix = `broadcasts/${isChannel ? channelId : meetingId}/${ts}`;
      const s3 = new S3Upload({ ...s3cfg, forcePathStyle: true });
      // segmentDuration halved to 2s (2026-09-22, live-watched path only —
      // start-recording's plain VOD output above is untouched, latency is
      // irrelevant there). A segment can't be handed to a viewer until it's
      // fully written and uploaded, so shorter segments are the actual lever
      // for how close to real-time playback can safely sit — this directly
      // lowers the floor HlsPlayer's targetLatencySeconds is bounded by,
      // for both channel broadcasts and webinars (this action is shared).
      const output = new SegmentedFileOutput({
        filenamePrefix: `${prefix}/seg`,
        playlistName: `${prefix}/index.m3u8`,
        segmentDuration: 2,
        output: { case: 's3', value: s3 },
      });

      // Cold-start fix (2026-08-19, channel broadcasts; extended 2026-09-21 to
      // webinars): Room Composite Egress spins up a full compositor (a
      // headless browser rendering a grid layout) — real, measured cost on
      // top of an already-slow first segment, and the direct cause of a
      // production 404 an attendee hit joining a webinar right as it went
      // live (the .m3u8 didn't exist yet). A channel broadcast or webinar is
      // realistically one active speaker (the host) at a time, so Track
      // Composite Egress — encoding their raw published tracks directly, no
      // layout render step — cold-starts faster. `user.id` IS the host here
      // (isDbHost already confirmed it for this exact request), so their
      // track SIDs are resolved directly rather than trusting any
      // client-supplied ID. Interactive Meetings' own webinar mode
      // (ctxKind='ministry_meeting') keeps Room Composite (unchanged below) —
      // co-hosted/multi-speaker is a more central case there, and Track
      // Composite can't automatically pick up whoever's on screen the way
      // Room Composite does; a webinar with real co-hosts still gets the
      // Room Composite fallback below whenever a video track isn't resolved.
      //
      // Regression fix (2026-08-19, same day): the caller's `expectVideo` flag
      // (client's own video-mode toggle) says whether a video track is
      // actually expected. If it is, and resolveHostTracks never finds one
      // (host tapped camera late, or its publish hadn't round-tripped yet),
      // Track Composite would otherwise lock onto audio-only forever — Track
      // Composite never picks up a track published after it starts, unlike
      // Room Composite. That was the "participant can no longer see host
      // video" bug: audio played, video never appeared. Fall back to Room
      // Composite in that case so video isn't silently lost.
      const expectVideo = !!body.expectVideo;
      let info: Awaited<ReturnType<typeof egressClient.startRoomCompositeEgress>>;
      if (isChannel || isWebinarHls) {
        const { audioTrackId, videoTrackId } = await resolveHostTracks(roomService, body.roomName, user!.id, expectVideo);
        const canUseTrackComposite = (audioTrackId || videoTrackId) && (!expectVideo || videoTrackId);

        if (canUseTrackComposite) {
          info = await egressClient.startTrackCompositeEgress(
            body.roomName,
            { segments: output },
            { audioTrackId, videoTrackId },
          );
        } else {
          // Safety net: either no track was published at all, or this is a
          // video broadcast and the video track specifically never showed up
          // after retrying — Room Composite doesn't need one upfront and will
          // pick up tracks as they appear, so video is never silently lost.
          // For a webinar this also correctly covers real co-hosted/multi-
          // speaker cases (no single "the host's" tracks to lock onto).
          console.warn(
            `[livekit-egress] ${isChannel ? 'channel broadcast' : 'webinar'} falling back to Room Composite (expectVideo=${expectVideo}, audio=${!!audioTrackId}, video=${!!videoTrackId})`,
          );
          info = await egressClient.startRoomCompositeEgress(body.roomName, { segments: output }, { layout: 'grid' });
        }
      } else {
        info = await egressClient.startRoomCompositeEgress(body.roomName, { segments: output }, { layout: 'grid' });
      }
      const playbackUrl = `${publicBase}/${prefix}/index.m3u8`;

      // The live HLS doubles as the VOD (§12) — track it as a recording too.
      const { error: hlsInsertError } = await admin.from('livekit_recordings').insert({
        egress_id: info.egressId,
        room_name: body.roomName,
        kind: isChannel ? 'channel' : isWebinarHls ? 'webinar' : 'meeting',
        channel_id: isChannel ? channelId : null,
        meeting_id: meetingId ?? body.roomName,
        meeting_table: isChannel ? null : meetingTable,
        status: 'recording',
        filepath: prefix,
        playback_url: playbackUrl,
      });
      if (hlsInsertError) console.error('[livekit-egress] failed to insert livekit_recordings row (start-hls):', hlsInsertError);

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
      const targetId = body.meetingId ?? body.channelId ?? body.context?.meetingId ?? body.context?.channelId;
      if (!body.roomName || !targetId || !body.rtmpUrl || !body.platform) {
        return json({ error: 'roomName, targetId (channelId/meetingId), platform, rtmpUrl required' }, 400);
      }
      const isMeeting = body.context?.kind && body.context.kind !== 'channel';
      const table = isMeeting ? 'meeting_simulcast_targets' : 'live_channel_simulcast_targets';
      const idCol = isMeeting ? 'meeting_id' : 'channel_id';
      const stream = new StreamOutput({ protocol: StreamProtocol.RTMP, urls: [body.rtmpUrl] });
      const info = await egressClient.startRoomCompositeEgress(body.roomName, { stream }, { layout: 'grid' });
      await admin.from(table).upsert(
        { [idCol]: targetId, platform: body.platform, enabled: true, egress_id: info.egressId },
        { onConflict: `${idCol},platform` },
      );
      return json({ success: true, egressId: info.egressId });
    }

    if (action === 'remove-simulcast') {
      const targetId = body.meetingId ?? body.channelId ?? body.context?.meetingId ?? body.context?.channelId;
      if (!targetId || !body.platform) return json({ error: 'targetId + platform required' }, 400);
      const isMeeting = body.context?.kind && body.context.kind !== 'channel';
      const table = isMeeting ? 'meeting_simulcast_targets' : 'live_channel_simulcast_targets';
      const idCol = isMeeting ? 'meeting_id' : 'channel_id';
      const { data: tgt } = await admin
        .from(table)
        .select('egress_id')
        .eq(idCol, targetId).eq('platform', body.platform).maybeSingle();
      const egressId = (tgt as { egress_id?: string } | null)?.egress_id;
      if (egressId) await egressClient.stopEgress(egressId).catch(() => {});
      await admin.from(table)
        .update({ enabled: false, egress_id: null })
        .eq(idCol, targetId).eq('platform', body.platform);
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
