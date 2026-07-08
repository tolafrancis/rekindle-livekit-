// supabase/livekit-ingress/index.ts
//
// Phase 6 (§6B) — OBS/encoder ingest via LiveKit Ingress, replacing Mux RTMP ingest.
// An RTMP (or WHIP) feed lands here and is published INTO the channel's room as a
// participant; a separate HLS Egress (livekit-egress start-hls) composites the room
// for the audience. Ingress and Egress are decoupled (unlike Mux, which was one
// stream in+out) — see plan §6B.
//
// ── Deploy (Supabase dashboard) ──────────────────────────────────────────────
//   1. Edge Functions → "Deploy a new function" → name it exactly: livekit-ingress
//   2. Paste this file and deploy.
//   3. Secrets: LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET + SUPABASE_*.
//   4. Requires the ingress service running (livekit/docker-compose.yml) and
//      migration 0147 (channel_streams).
//
// ── Actions (POST JSON body) ─────────────────────────────────────────────────
//   { action:'create', channelId, roomName }  → { serverUrl, streamKey, ingressId }
//   { action:'get',    channelId }             → { serverUrl, ingressId, hasKey }
//   { action:'delete', channelId }             → { success: true }
// (streamKey is returned ONLY on create — LiveKit does not re-expose it.)
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
    if (!body.channelId) return json({ error: 'channelId required' }, 400);

    // Authenticate + authorize as the channel owner.
    const userClient = createClient(SB_URL!, SB_ANON!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SB_URL!, SB_SERVICE!);
    const { data: ch } = await admin.from('live_channels').select('owner_id').eq('id', body.channelId).maybeSingle();
    if (!ch || (ch as { owner_id?: string }).owner_id !== user.id) return json({ error: 'Not the channel owner' }, 403);

    const ingressClient = new IngressClient(httpUrl(LIVEKIT_URL), KEY, SECRET);

    if (body.action === 'create') {
      if (!body.roomName) return json({ error: 'roomName required' }, 400);
      const info = await ingressClient.createIngress(IngressInput.RTMP_INPUT, {
        name: `channel-${body.channelId}`,
        roomName: body.roomName,
        participantIdentity: `obs-${body.channelId}`,
        participantName: 'OBS / Encoder',
      });
      await admin.from('channel_streams').upsert(
        { channel_id: body.channelId, ingress_id: info.ingressId, ingress_url: info.url, updated_at: new Date().toISOString() },
        { onConflict: 'channel_id' },
      );
      return json({ serverUrl: info.url, streamKey: info.streamKey, ingressId: info.ingressId });
    }

    if (body.action === 'get') {
      const { data: cs } = await admin.from('channel_streams').select('ingress_id, ingress_url').eq('channel_id', body.channelId).maybeSingle();
      const row = cs as { ingress_id?: string; ingress_url?: string } | null;
      return json({ serverUrl: row?.ingress_url ?? null, ingressId: row?.ingress_id ?? null, hasKey: false });
    }

    if (body.action === 'delete') {
      const { data: cs } = await admin.from('channel_streams').select('ingress_id').eq('channel_id', body.channelId).maybeSingle();
      const ingressId = (cs as { ingress_id?: string } | null)?.ingress_id;
      if (ingressId) await ingressClient.deleteIngress(ingressId).catch(() => {});
      await admin.from('channel_streams').update({ ingress_id: null, ingress_url: null, updated_at: new Date().toISOString() }).eq('channel_id', body.channelId);
      return json({ success: true });
    }

    return json({ error: `Unknown action: ${body.action}` }, 400);
  } catch (error) {
    console.error('livekit-ingress error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
