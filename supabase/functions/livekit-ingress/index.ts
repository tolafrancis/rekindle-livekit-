// supabase/functions/livekit-ingress/index.ts
//
// OBS/encoder ingest for live channels — an RTMP Ingress that publishes into the
// channel's LiveKit room, same as a browser host would. One ingress per channel;
// tracked on channel_streams (channel_id primary key), alongside hls_egress_id
// which livekit-egress already reads/writes on this same table. See 0272 for the
// one new column this needs (ingress_stream_key).
//
// ── Deploy (Supabase dashboard) ──────────────────────────────────────────────
//   1. Edge Functions → "Deploy a new function" → name it exactly: livekit-ingress
//   2. Paste this whole file as its index.ts and deploy.
//   3. Secrets: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, SUPABASE_URL,
//      SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (all already set — shared
//      with livekit-egress).
//   4. Run migration 0272_channel_streams_ingress_key.sql.
//
// ── Actions (POST JSON body) ─────────────────────────────────────────────────
//   { action:'create', channelId, roomName } → { ingressId, serverUrl, streamKey }
//   { action:'get',    channelId, roomName } → { ingressId, serverUrl, streamKey } | { ingressId: null }
//   { action:'delete', channelId, roomName } → { success: true }
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { IngressClient, IngressInput } from 'https://esm.sh/livekit-server-sdk@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

const httpUrl = (wsUrl: string) => wsUrl.replace(/^ws/, 'http');

// Ingress create/get both hand back a live RTMP stream key — unlike egress's
// list-recordings (playback URLs, meant to be public), this is a write
// credential that lets anyone publish into the channel as its host. Every
// action here requires the authenticated caller to own the channel — mirrors
// the channel branch of livekit-egress's isDbHost, just channel-only (ingress
// has no meeting-kind variant).
async function isChannelOwner(admin: ReturnType<typeof createClient>, userId: string, channelId: string | undefined): Promise<boolean> {
  if (!channelId) return false;
  const { data } = await admin.from('live_channels').select('owner_id').eq('id', channelId).maybeSingle();
  return !!data && (data as { owner_id?: string }).owner_id === userId;
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

    const body = await req.json();
    const action = body.action as string;
    const channelId = body.channelId as string | undefined;
    if (!channelId) return json({ error: 'channelId required' }, 400);

    const admin = createClient(SB_URL!, SB_SERVICE!);

    // Every action manages/reveals a live stream credential — auth required for all three.
    const userClient = createClient(SB_URL!, SB_ANON!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (!(await isChannelOwner(admin, user.id, channelId))) return json({ error: 'Only the channel owner can manage ingest' }, 403);

    const ingressClient = new IngressClient(httpUrl(LIVEKIT_URL), KEY, SECRET);

    if (action === 'get') {
      const { data } = await admin
        .from('channel_streams')
        .select('ingress_id, ingress_url, ingress_stream_key')
        .eq('channel_id', channelId)
        .maybeSingle();
      const row = data as { ingress_id?: string | null; ingress_url?: string | null; ingress_stream_key?: string | null } | null;
      if (!row?.ingress_id) return json({ ingressId: null });
      return json({ ingressId: row.ingress_id, serverUrl: row.ingress_url ?? '', streamKey: row.ingress_stream_key ?? '' });
    }

    if (action === 'create') {
      if (!body.roomName) return json({ error: 'roomName required' }, 400);

      // Idempotent — provisionChannelStream() calls this directly (no delete
      // first), so a channel that already has an ingress must hand back the
      // existing one rather than creating a duplicate.
      const { data: existing } = await admin
        .from('channel_streams')
        .select('ingress_id, ingress_url, ingress_stream_key')
        .eq('channel_id', channelId)
        .maybeSingle();
      const existingRow = existing as { ingress_id?: string | null; ingress_url?: string | null; ingress_stream_key?: string | null } | null;
      if (existingRow?.ingress_id) {
        return json({ ingressId: existingRow.ingress_id, serverUrl: existingRow.ingress_url ?? '', streamKey: existingRow.ingress_stream_key ?? '' });
      }

      // NOTE: field names (ingressId/url/streamKey) match livekit-server-sdk@2's
      // documented IngressInfo shape but aren't exercised against a live create
      // call in this environment — verify against the actual response before
      // relying on this in production, same caveat as egress's bytes_used note.
      const info = await ingressClient.createIngress(IngressInput.RTMP_INPUT, {
        name: `channel-${channelId}`,
        roomName: body.roomName,
        participantIdentity: `host-${channelId}`,
        participantName: 'Host',
      });

      const { error: upsertError } = await admin.from('channel_streams').upsert(
        {
          channel_id: channelId,
          ingress_id: info.ingressId,
          ingress_url: info.url,
          ingress_stream_key: info.streamKey,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'channel_id' },
      );
      // The Ingress already exists on LiveKit's side even if this write fails —
      // surface it loudly rather than silently losing the mapping (see
      // livekit-egress's insertError handling for why this matters).
      if (upsertError) console.error('[livekit-ingress] failed to persist channel_streams row:', upsertError);

      return json({ ingressId: info.ingressId, serverUrl: info.url, streamKey: info.streamKey });
    }

    if (action === 'delete') {
      const { data } = await admin
        .from('channel_streams')
        .select('ingress_id')
        .eq('channel_id', channelId)
        .maybeSingle();
      const ingressId = (data as { ingress_id?: string } | null)?.ingress_id;

      if (ingressId) await ingressClient.deleteIngress(ingressId).catch(() => {});

      // Null out the ingress columns only — this row also carries hls_egress_id
      // for the same channel, so it must not be deleted wholesale.
      await admin.from('channel_streams').update({
        ingress_id: null,
        ingress_url: null,
        ingress_stream_key: null,
        updated_at: new Date().toISOString(),
      }).eq('channel_id', channelId);

      return json({ success: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error('livekit-ingress error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
