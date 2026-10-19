// =============================================================================
// Simulcast (restream to YouTube Live / Facebook Live) for the LiveKit edge
// functions (livekit-egress, livekit-webhook).
// -----------------------------------------------------------------------------
// A destination is saved once (server URL + stream key) and then mirrored as
// one RTMP Room Composite Egress for as long as the room is live. Before
// 2026-10-10 add-simulcast started that egress on the spot and never saved
// the key, so saving it before going live (the only time the dialog allows
// it for a channel) failed with "requested room does not exist", and nothing
// started the restream when the broadcast actually began. Saving and starting
// are now separate: save any time, and the go-live paths call
// startSimulcastEgresses().
// =============================================================================

import { EgressClient, StreamOutput, StreamProtocol } from 'https://esm.sh/livekit-server-sdk@2';

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface SimulcastScope {
  isMeeting: boolean;
  /** channel id, or meeting / webinar id. */
  targetId: string;
}

export const simulcastTable = (isMeeting: boolean) => (isMeeting ? 'meeting_simulcast_targets' : 'live_channel_simulcast_targets');
export const simulcastIdCol = (isMeeting: boolean) => (isMeeting ? 'meeting_id' : 'channel_id');

/** serverUrl + '/' + key, without the double slash a trailing '/' in the
 *  server URL (Facebook's default has one) would leave. */
export function joinRtmpUrl(serverUrl: string, streamKey: string): string {
  return `${serverUrl.trim().replace(/\/+$/, '')}/${streamKey.trim()}`;
}

/** LiveKit's "room does not exist" error, i.e. nobody is live in it yet. */
export function isRoomNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /room does not exist|room not found|not_found/i.test(msg);
}

const errMessage = (err: unknown) => (err instanceof Error ? err.message : String(err ?? 'Unknown error'));

/**
 * Starts an RTMP egress for every enabled destination of this channel/meeting
 * (or only `platform`). An egress already recorded on a row is stopped first,
 * so calling this again (a host reload, a re-run of go-live) never doubles a
 * stream. Each row's status/last_error says how it went; errors never throw.
 */
export async function startSimulcastEgresses(
  admin: Admin,
  egressClient: EgressClient,
  scope: SimulcastScope,
  roomName: string,
  platform?: string,
): Promise<{ platform: string; ok: boolean; error?: string }[]> {
  const table = simulcastTable(scope.isMeeting);
  const idCol = simulcastIdCol(scope.isMeeting);
  let q = admin.from(table).select('platform, server_url, stream_key, egress_id').eq(idCol, scope.targetId).eq('enabled', true);
  if (platform) q = q.eq('platform', platform);
  const { data, error } = await q;
  if (error) {
    console.error(`[simulcast] could not read ${table} for ${scope.targetId}:`, error);
    return [];
  }

  const results: { platform: string; ok: boolean; error?: string }[] = [];
  for (const row of (data ?? []) as { platform: string; server_url: string; stream_key: string | null; egress_id: string | null }[]) {
    if (!row.stream_key || !row.server_url) continue;
    if (row.egress_id) await egressClient.stopEgress(row.egress_id).catch(() => {});
    try {
      const stream = new StreamOutput({ protocol: StreamProtocol.RTMP, urls: [joinRtmpUrl(row.server_url, row.stream_key)] });
      const info = await egressClient.startRoomCompositeEgress(roomName, { stream }, { layout: 'grid' });
      await admin.from(table)
        .update({ egress_id: info.egressId, status: 'active', last_error: null, updated_at: new Date().toISOString() })
        .eq(idCol, scope.targetId).eq('platform', row.platform);
      results.push({ platform: row.platform, ok: true });
    } catch (err) {
      const message = errMessage(err);
      console.error(`[simulcast] ${row.platform} restream for ${roomName} failed to start:`, message);
      await admin.from(table)
        .update({ egress_id: null, status: 'error', last_error: message, updated_at: new Date().toISOString() })
        .eq(idCol, scope.targetId).eq('platform', row.platform);
      results.push({ platform: row.platform, ok: false, error: message });
    }
  }
  return results;
}

/** Stops every running restream of this channel/meeting and marks it idle. */
export async function stopSimulcastEgresses(admin: Admin, egressClient: EgressClient, scope: SimulcastScope): Promise<void> {
  const table = simulcastTable(scope.isMeeting);
  const idCol = simulcastIdCol(scope.isMeeting);
  const { data } = await admin.from(table).select('egress_id').eq(idCol, scope.targetId).not('egress_id', 'is', null);
  for (const row of (data ?? []) as { egress_id: string }[]) {
    await egressClient.stopEgress(row.egress_id).catch(() => {});
  }
  await admin.from(table)
    .update({ egress_id: null, status: 'idle', updated_at: new Date().toISOString() })
    .eq(idCol, scope.targetId).not('egress_id', 'is', null);
}
