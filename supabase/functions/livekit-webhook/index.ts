// supabase/functions/livekit-webhook/index.ts
//
// LiveKit server -> Supabase webhook receiver.
// Handles:
//   1. egress_ended / egress_updated: Flips recording status to completed/failed and records usage metering.
//   2. ingress_started: Auto-starts HLS broadcast egress and sets live_channels.is_live = true.
//   3. ingress_ended: Auto-stops HLS broadcast egress and sets live_channels.is_live = false.
//   4. participant_joined / participant_left: records real join/leave times for
//      the standalone Interactive Meetings API's "api-" rooms only (migration
//      0347) — the pay-as-you-go billing basis for that API.
//
// ⚠️ Deploy with JWT VERIFICATION OFF (verify_jwt = false in config.toml).
// ⚠️ Also confirm in the LiveKit Cloud project settings that this webhook is
//    subscribed to participant_joined/participant_left, not just the
//    ingress/egress events already in use — #4 silently collects nothing
//    otherwise. See migration 0347's header comment.

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
  // livePlaylistName (2026-09-22, same fix as livekit-egress's start-hls
  // action — see its comment for the full root cause): without this,
  // playlistName alone is an ever-growing EVENT manifest that never trims
  // old segments, which for a long OBS broadcast eventually made periodic
  // playlist refreshes slow/heavy enough to intermittently trip hls.js's
  // load-time budgets — showing up live as repeated "disconnecting and
  // reconnecting". live.m3u8 is a proper bounded sliding-window manifest;
  // playlistName is kept unchanged as the eventual VOD/recording source.
  const output = new SegmentedFileOutput({
    filenamePrefix: `${prefix}/seg`,
    playlistName: `${prefix}/index.m3u8`,
    livePlaylistName: `${prefix}/live.m3u8`,
    segmentDuration: 4,
    output: { case: 's3', value: s3 },
  });

  const info = await egressClient.startRoomCompositeEgress(roomName, { segments: output }, { layout: 'grid' });
  const playbackUrl = `${publicBase}/${prefix}/index.m3u8`;
  const livePlaybackUrl = `${publicBase}/${prefix}/live.m3u8`;

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
    hls_playback_url: livePlaybackUrl,
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
  if (rec.meeting_table === 'ministry_webinars' && rec.meeting_id) {
    const { data } = await admin.from('ministry_webinars').select('ministry_id').eq('id', rec.meeting_id).maybeSingle();
    return (data as { ministry_id?: string } | null)?.ministry_id ?? null;
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

        // Real bug found live (2026-09-23): the old unconditional
        // `status: ended ? ... : 'processing'` mislabeled a perfectly
        // healthy, still-recording egress as "processing" on every ordinary
        // egress_updated tick — confirmed live against an actively-recording
        // row. Worse, a duplicate or out-of-order webhook delivery (this
        // codebase's own pre-test review flagged this as untested) could
        // silently revert an already-finalized row from 'completed'/'failed'
        // back to 'processing', and a REDELIVERED egress_ended would re-run
        // every one-time downstream effect below — including usage
        // metering, double-counting minutes/bytes. Reading the current
        // status first closes both gaps: a row that's already finalized is
        // never touched again, by any later event for that egress_id.
        const { data: currentRow } = await admin
          .from('livekit_recordings').select('status').eq('egress_id', info.egressId).maybeSingle();
        const alreadyFinal = (currentRow as { status?: string } | null)?.status === 'completed'
          || (currentRow as { status?: string } | null)?.status === 'failed';

        let rows: { kind?: string; channel_id?: string; meeting_table?: string; meeting_id?: string; playback_url?: string }[] | null = null;
        if (!alreadyFinal) {
          const patch: Record<string, unknown> = {};
          if (ended) {
            patch.status = failed ? 'failed' : 'completed';
            patch.ended_at = new Date().toISOString();
          } else if (info.status === EgressStatus.EGRESS_ENDING) {
            patch.status = 'processing';
          } else {
            // EGRESS_STARTING / EGRESS_ACTIVE or anything else non-terminal —
            // genuinely still recording, not "processing".
            patch.status = 'recording';
          }
          if (duration) patch.duration_seconds = duration;

          const { data } = await admin
            .from('livekit_recordings')
            .update(patch)
            .eq('egress_id', info.egressId)
            .select('kind, channel_id, meeting_table, meeting_id, playback_url');
          rows = data;
        }
        const rec = (rows ?? [])[0] as
          { kind?: string; channel_id?: string; meeting_table?: string; meeting_id?: string; playback_url?: string } | undefined;

        if (ended && !alreadyFinal && !failed && rec?.meeting_table && rec.meeting_id) {
          // Webinar-only gate (2026-09-22, real bug reported live: toggling
          // Recording off at creation still showed "Watch the recording"
          // after the webinar ended). A webinar's HLS Egress (start-hls) is
          // what the AUDIENCE watches live — it always runs and always
          // doubles as a VOD in livekit_recordings, regardless of
          // enable_recording (there's no separate "live but not recorded"
          // mode for webinars the way a plain meeting's manual Record
          // button is fully optional). That's fine for the underlying
          // livekit_recordings row (service-role-only, not host-facing) —
          // but the HOST-FACING signal on ministry_webinars must respect
          // the toggle they actually chose, so skip exposing it there when
          // they turned recording off.
          let shouldExpose = true;
          if (rec.kind === 'webinar') {
            const { data: w } = await admin.from('ministry_webinars').select('enable_recording').eq('id', rec.meeting_id).maybeSingle();
            shouldExpose = (w as { enable_recording?: boolean } | null)?.enable_recording !== false;
          }
          if (shouldExpose) {
            await admin.from(rec.meeting_table).update({
              recording_url: rec.playback_url,
              recording_status: 'completed',
              recording_duration_seconds: duration,
              recording_ended_at: new Date().toISOString(),
            }).eq('id', rec.meeting_id);
          }
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

        // Same backstop as the channel one above, extended to webinars
        // (2026-09-21) — found live: a webinar left open in another tab with
        // no explicit "End webinar" click (browser closed, crash, lost
        // connection — anything short of that button) still makes LiveKit
        // end the egress and fire this webhook, but nothing was flipping
        // ministry_webinars.status off 'live', so it stayed "live" and
        // joinable indefinitely even though nothing was actually streaming.
        // Only touches rows still stuck in 'live'/'ending' — never overwrites
        // an explicit 'cancelled', or a status this same webhook/client
        // already finished transitioning.
        if (ended && rec?.kind === 'webinar' && rec.meeting_id) {
          await admin.from('webinar_polls')
            .update({ status: 'closed', closed_at: new Date().toISOString() })
            .eq('webinar_id', rec.meeting_id).eq('status', 'open');
          await admin.from('ministry_webinars')
            .update({ status: 'ended', ended_at: new Date().toISOString() })
            .eq('id', rec.meeting_id).in('status', ['live', 'ending']);
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
              // A webinar is one-to-many like a channel broadcast, not a
              // two-way meeting — meters against broadcast hours.
              p_broadcast_minutes_delta: rec.kind === 'channel' || rec.kind === 'webinar' ? minutes : 0,
            }).then(({ error }: { error: unknown }) => {
              if (error) console.error('[livekit-webhook] usage metering failed:', error);
            });
          }
        }
      }
    }

    // ── 2b. Room Finished (safety net, no egress dependency) ────────────────
    // Real gap found in a pre-test pipeline review (2026-09-23): "is live"
    // was derived entirely from application-level writes and the egress
    // backstop above — neither fires if a webinar's HLS Egress never
    // actually started (e.g. it failed immediately, expectVideo mismatch,
    // quota gate) but the host's room still genuinely closed. room_finished
    // is LiveKit's own authoritative "this room is completely empty and
    // closed" signal, independent of whether any egress ever ran — a
    // last-resort backstop underneath the egress-based ones, not a
    // replacement for them (egress-driven paths above already cover the
    // common case and also close out the recording/VOD side, which this
    // can't). Scoped to webinars only (ministry_webinars.room_name is a
    // confirmed, unique column to look up by) — channels/meetings have no
    // equally reliable room-name-to-row mapping available here without
    // risking a wrong guess.
    if (event.event === 'room_finished') {
      const roomName = event.room?.name;
      if (roomName?.startsWith('webinar-')) {
        await admin.from('ministry_webinars')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('room_name', roomName).in('status', ['live', 'ending']);
      }

      // Server-side backstop for translation/captions cost leak (2026-09-23,
      // captions pipeline review, F-CAP-5) — the client-side
      // stopTranslationForRoom (webinarControl.ts / MinistryInteractiveMeetings.tsx)
      // is the primary path and already covers a clean end-meeting/end-webinar
      // click; this catches the case that has none of that client code run
      // at all (crash, force-quit, killed tab). room_finished only fires once
      // LiveKit itself confirms the room is genuinely empty and closed, so
      // this can't fire while a session is still legitimately in progress.
      // Room-agnostic (not scoped to webinar- rooms) since any room kind can
      // carry an active translation session.
      if (roomName) {
        const { data: liveSessions } = await admin
          .from('translation_sessions')
          .select('id')
          .eq('livekit_room_name', roomName)
          .in('status', ['initialising', 'joining', 'active', 'paused']);
        if (liveSessions && liveSessions.length > 0) {
          await Promise.all(
            liveSessions.map((s: { id: string }) =>
              admin.rpc('stop_bot_session', { p_session_id: s.id }).then(({ error }) => {
                if (error) console.error(`[livekit-webhook] room_finished stop_bot_session failed for ${s.id}:`, error.message);
              }),
            ),
          );
        }
      }
    }

    // ── 3. Developer API Meeting Participants (usage metering) ──────────────
    // Scoped to api_meetings' "api-" room-name prefix ONLY — every other room
    // (ministry/consumer meetings, translation sessions, live channels) is
    // untouched by this block. See migration 0347's header comment for why
    // pay-as-you-go billing needs real participant join/leave times rather
    // than api_meetings.duration_minutes (a booked-at-creation estimate, not
    // measured time).
    if (event.event === 'participant_joined' || event.event === 'participant_left') {
      const roomName = event.room?.name;
      const identity = event.participant?.identity;
      if (roomName?.startsWith('api-') && identity) {
        const { data: meeting } = await admin
          .from('api_meetings')
          .select('id, owner_user_id')
          .eq('room_name', roomName)
          .maybeSingle();
        if (meeting) {
          if (event.event === 'participant_joined') {
            await admin.from('api_meeting_participants').insert({
              meeting_id: meeting.id,
              owner_user_id: meeting.owner_user_id,
              participant_identity: identity,
              joined_at: new Date().toISOString(),
            });
          } else {
            // Closes only the LATEST still-open row for this identity — a
            // reconnect after a network blip opens a second row rather than
            // reusing the first (see the table's own left_at doc comment),
            // so there can legitimately be more than one to choose from.
            const { data: openRow } = await admin
              .from('api_meeting_participants')
              .select('id')
              .eq('meeting_id', meeting.id)
              .eq('participant_identity', identity)
              .is('left_at', null)
              .order('joined_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (openRow) {
              await admin.from('api_meeting_participants').update({ left_at: new Date().toISOString() }).eq('id', openRow.id);
            }
          }
        }
      }
    }

    // ── 3b. Webinar Attendance (server-side backstop, close-only) ───────────
    // Real gap found in a pre-test pipeline review (2026-09-23): attendance
    // for every meeting kind except Developer API rooms relies ENTIRELY on
    // client-side self-reporting (trackMeetingParticipant, meeting_attendance
    // table — see 0356's own doc comment acknowledging "an inherent limit of
    // any client-side leave signal: tab-close won't fire cleanup"). A
    // crashed tab, force-quit app, or killed process leaves a row with no
    // left_at/is_active=false forever, permanently inflating "currently
    // watching" counts and skewing average-duration analytics.
    //
    // Deliberately does NOT insert on participant_joined — the client's own
    // trackMeetingParticipant already does that with richer context
    // (is_guest at the true moment of join, etc.), and inserting here too
    // would double-count every normal join (both writers firing for the
    // same real attendee). This only CLOSES a row the client already
    // created, whenever LiveKit itself confirms that identity actually left
    // the room — a floor under the existing self-reporting, not a second
    // writer competing with it. Scoped to webinars for the same reason as
    // the room_finished backstop above (ministry_webinars.room_name is a
    // confirmed, reliable lookup key).
    if (event.event === 'participant_left') {
      const roomName = event.room?.name;
      const identity = event.participant?.identity;
      if (roomName?.startsWith('webinar-') && identity
        && !identity.startsWith('rlt-bot-') && !identity.endsWith('-screenshare')) {
        const { data: webinar } = await admin
          .from('ministry_webinars').select('id').eq('room_name', roomName).maybeSingle();
        const webinarId = (webinar as { id?: string } | null)?.id;
        if (webinarId) {
          const { data: openRow } = await admin
            .from('meeting_attendance')
            .select('id')
            .eq('meeting_id', webinarId)
            .eq('meeting_table', 'ministry_webinars')
            .eq('user_id', identity)
            .eq('is_active', true)
            .order('joined_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (openRow) {
            await admin.from('meeting_attendance')
              .update({ left_at: new Date().toISOString(), is_active: false })
              .eq('id', (openRow as { id: string }).id);
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
