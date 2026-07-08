// supabase/channel-simulcast/index.ts
//
// STANDALONE edge function — restream (simulcast) a channel's Mux live stream to
// YouTube Live / Facebook Live. This is intentionally SEPARATE from
// `manage-stream-input` so it can never affect meetings/webinars. Deploy it as a
// brand-new function named `channel-simulcast`.
//
// ── Deploy (Supabase dashboard) ──────────────────────────────────────────────
//   1. Edge Functions → "Deploy a new function" → name it exactly: channel-simulcast
//   2. Paste this whole file as its index.ts and deploy.
//   3. Secrets: this reuses the SAME project secrets your other functions use —
//      MUX_TOKEN_ID, MUX_TOKEN_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//      SUPABASE_ANON_KEY. They're project-wide, so nothing new to add.
//   4. Run migration 0015_live_channel_simulcast_targets.sql in the SQL editor.
//   5. This version resolves the Mux stream id from the `mux_streams` ledger
//      (not live_channels.mux_live_stream_id). Deploy it BEFORE running
//      0016_drop_live_channels_mux_live_stream_id.sql.
//
// Actions (POST JSON body): { action, channelId, platform?, serverUrl?, streamKey? }
//   - 'add-simulcast'    { channelId, platform, serverUrl, streamKey }
//   - 'remove-simulcast' { channelId, platform }
//   - 'list-simulcast'   { channelId }
// Stream keys are write-only: responses never include them (only `hasKey`).
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const MUX_API = 'https://api.mux.com';
type Platform = 'youtube' | 'facebook';
const PLATFORMS: Platform[] = ['youtube', 'facebook'];

function muxAuthHeader(): string {
  const id = Deno.env.get('MUX_TOKEN_ID') ?? '';
  const secret = Deno.env.get('MUX_TOKEN_SECRET') ?? '';
  return 'Basic ' + btoa(`${id}:${secret}`);
}

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

interface MuxLiveStream {
  id: string;
  status: 'idle' | 'active' | 'disabled';
  stream_key?: string;
}

async function getMuxStream(streamId: string): Promise<MuxLiveStream | null> {
  const res = await fetch(`${MUX_API}/video/v1/live-streams/${streamId}`, {
    headers: { Authorization: muxAuthHeader() },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Mux get live-stream failed: ${res.status}`);
  const j = await res.json();
  return j.data as MuxLiveStream;
}

async function deleteMuxTarget(streamId: string, targetId: string): Promise<void> {
  const res = await fetch(`${MUX_API}/video/v1/live-streams/${streamId}/simulcast-targets/${targetId}`, {
    method: 'DELETE',
    headers: { Authorization: muxAuthHeader() },
  });
  if (!res.ok && res.status !== 404) throw new Error(`Mux delete target failed: ${res.status}`);
}

/**
 * Resolve the channel's Mux live stream id from the authoritative `mux_streams`
 * ledger, which `manage-stream-input` keeps current — including after a
 * re-provision (e.g. toggling recording mints a brand-new stream). Reading it
 * here means there is no stale-id risk and no need to scan Mux's live-stream
 * list. (`mux_streams` is keyed by scope_type + scope_id; channels use 'channel'.)
 */
async function resolveMuxStreamId(
  supabase: ReturnType<typeof adminClient>,
  channelId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('mux_streams')
    .select('mux_live_stream_id')
    .eq('scope_type', 'channel')
    .eq('scope_id', channelId)
    .maybeSingle();
  return (data?.mux_live_stream_id as string | undefined) ?? null;
}

/** Resolve caller from the JWT and confirm they own the channel. */
async function requireChannelOwner(authHeader: string, channelId: string): Promise<
  | { ok: true }
  | { ok: false; res: Response }
> {
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return { ok: false, res: json({ error: 'Unauthorized' }, 401) };

  const supabase = adminClient();
  const { data: channel } = await supabase
    .from('live_channels')
    .select('owner_id')
    .eq('id', channelId)
    .maybeSingle();
  if (!channel) return { ok: false, res: json({ error: 'Channel not found' }, 404) };
  if (channel.owner_id !== user.id) {
    return { ok: false, res: json({ error: 'Only the channel owner can change restream destinations' }, 403) };
  }
  return { ok: true };
}

/** Strip stream_key before returning a row to the client. */
function publicRow(row: Record<string, unknown>): Record<string, unknown> {
  const { stream_key, ...rest } = row as { stream_key?: string };
  return { ...rest, hasKey: Boolean(stream_key) };
}

const ROW_COLS = 'id, channel_id, platform, server_url, stream_key, mux_target_id, enabled, source, status, last_error, created_at, updated_at';

async function addSimulcast(body: Record<string, unknown>, authHeader: string): Promise<Response> {
  const channelId = String(body.channelId ?? '');
  const platform = body.platform as Platform;
  const serverUrl = String(body.serverUrl ?? '').trim();
  const streamKey = String(body.streamKey ?? '').trim();
  if (!channelId || !PLATFORMS.includes(platform) || !serverUrl || !streamKey) {
    return json({ error: 'channelId, platform (youtube|facebook), serverUrl and streamKey are required' }, 400);
  }

  const auth = await requireChannelOwner(authHeader, channelId);
  if (!auth.ok) return auth.res;

  const supabase = adminClient();
  const streamId = await resolveMuxStreamId(supabase, channelId);
  if (!streamId) {
    return json({ error: 'no_mux_stream', message: 'This channel has no live stream yet. Open Broadcast setup and let it provision first.' }, 409);
  }

  const stream = await getMuxStream(streamId);
  if (stream && stream.status === 'active') {
    return json({ error: 'stream_active', message: 'Stop the broadcast before changing restream destinations.' }, 409);
  }

  // Replace any existing Mux target for this platform first (avoid orphans).
  const { data: existing } = await supabase
    .from('live_channel_simulcast_targets')
    .select('mux_target_id')
    .eq('channel_id', channelId)
    .eq('platform', platform)
    .maybeSingle();
  if (existing?.mux_target_id) {
    await deleteMuxTarget(streamId, existing.mux_target_id as string).catch(() => {});
  }

  let muxTargetId: string;
  try {
    const res = await fetch(`${MUX_API}/video/v1/live-streams/${streamId}/simulcast-targets`, {
      method: 'POST',
      headers: { Authorization: muxAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: serverUrl, stream_key: streamKey, passthrough: platform }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      await supabase.from('live_channel_simulcast_targets').upsert({
        channel_id: channelId, platform, server_url: serverUrl, stream_key: streamKey,
        enabled: true, source: 'manual', status: 'error', last_error: `Mux create failed: ${res.status}`,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'channel_id,platform' });
      console.error('[channel-simulcast] mux create failed', res.status, errText);
      return json({ error: 'mux_create_failed', message: `Mux rejected the target (${res.status}).` }, 502);
    }
    const j = await res.json();
    muxTargetId = j.data.id as string;
  } catch (err) {
    console.error('[channel-simulcast] mux create threw', err);
    return json({ error: 'mux_create_failed', message: 'Could not reach Mux to create the target.' }, 502);
  }

  const { data: row, error } = await supabase
    .from('live_channel_simulcast_targets')
    .upsert({
      channel_id: channelId, platform, server_url: serverUrl, stream_key: streamKey,
      mux_target_id: muxTargetId, enabled: true, source: 'manual', status: 'idle', last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'channel_id,platform' })
    .select(ROW_COLS)
    .single();
  if (error || !row) return json({ error: 'db_upsert_failed', message: error?.message ?? 'Could not save the target.' }, 500);

  return json({ success: true, target: publicRow(row) });
}

async function removeSimulcast(body: Record<string, unknown>, authHeader: string): Promise<Response> {
  const channelId = String(body.channelId ?? '');
  const platform = body.platform as Platform;
  if (!channelId || !PLATFORMS.includes(platform)) {
    return json({ error: 'channelId and platform (youtube|facebook) are required' }, 400);
  }

  const auth = await requireChannelOwner(authHeader, channelId);
  if (!auth.ok) return auth.res;

  const supabase = adminClient();
  const { data: existing } = await supabase
    .from('live_channel_simulcast_targets')
    .select('mux_target_id')
    .eq('channel_id', channelId)
    .eq('platform', platform)
    .maybeSingle();

  if (existing?.mux_target_id) {
    const streamId = await resolveMuxStreamId(supabase, channelId);
    if (streamId) {
      const stream = await getMuxStream(streamId);
      if (stream && stream.status === 'active') {
        return json({ error: 'stream_active', message: 'Stop the broadcast before changing restream destinations.' }, 409);
      }
      try { await deleteMuxTarget(streamId, existing.mux_target_id as string); }
      catch (err) { console.error('[channel-simulcast] mux delete failed', err); }
    }
  }

  await supabase
    .from('live_channel_simulcast_targets')
    .delete()
    .eq('channel_id', channelId)
    .eq('platform', platform);

  return json({ success: true, platform });
}

async function listSimulcast(body: Record<string, unknown>, authHeader: string): Promise<Response> {
  const channelId = String(body.channelId ?? '');
  if (!channelId) return json({ error: 'channelId is required' }, 400);

  const auth = await requireChannelOwner(authHeader, channelId);
  if (!auth.ok) return auth.res;

  const supabase = adminClient();
  const { data: rows, error } = await supabase
    .from('live_channel_simulcast_targets')
    .select(ROW_COLS)
    .eq('channel_id', channelId);
  if (error) return json({ error: 'db_list_failed', message: error.message }, 500);

  return json({ success: true, targets: (rows ?? []).map(publicRow) });
}

serve(async (req) => {
  // CORS preflight — always answer, so the browser never reports "Failed to send a request".
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed. Use POST.' }, 405);

    const authHeader = req.headers.get('authorization') ?? '';
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? '');

    switch (action) {
      case 'add-simulcast':    return await addSimulcast(body, authHeader);
      case 'remove-simulcast': return await removeSimulcast(body, authHeader);
      case 'list-simulcast':   return await listSimulcast(body, authHeader);
      default:
        return json({ error: `Unknown action: ${action || '(none)'}`, validActions: ['add-simulcast', 'remove-simulcast', 'list-simulcast'] }, 400);
    }
  } catch (err) {
    // Always return WITH cors headers, even on crash.
    console.error('[channel-simulcast] error', err);
    return json({ error: 'internal', message: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
});
