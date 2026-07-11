// Supabase Edge Function: daily-recordings
// Lists a channel's Daily cloud recordings and mints time-limited access links.
// Deploy with the DAILY_API_KEY secret set (same key the daily-room function uses).
//
// Actions:
//   { action: 'list',  channelId }        -> { recordings: [{ id, start_ts, duration }] }
//   { action: 'link',  recordingId }      -> { download_link, expires }
//
// Channel rooms are named `channel-<channelId>` (see useDailyRoom), so we filter
// the recordings list by room_name. Access links are signed, time-limited URLs to
// the .mp4 in Daily's (or your custom) S3 bucket.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DAILY_API = 'https://api.daily.co/v1';

interface DailyRecording {
  id: string;
  room_name: string;
  start_ts: number;
  status?: string;
  duration?: number;
}

async function daily(path: string, key: string) {
  const res = await fetch(`${DAILY_API}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Daily API ${res.status}: ${body}`);
  }
  return res.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const key = Deno.env.get('DAILY_API_KEY');
    if (!key) throw new Error('DAILY_API_KEY is not configured');

    const { action, channelId, recordingId } = await req.json();

    if (action === 'list') {
      if (!channelId) throw new Error('channelId is required');
      const roomName = `channel-${channelId}`;
      // List the most recent recordings (max 100), then filter to this channel's
      // room. Daily returns them reverse-chronologically already.
      const data = await daily('/recordings?limit=100', key);
      const all: DailyRecording[] = data?.data ?? [];
      const recordings = all
        .filter((r) => r.room_name === roomName)
        // only finished recordings have a usable duration / file
        .filter((r) => r.status === undefined || r.status === 'finished')
        .map((r) => ({ id: r.id, start_ts: r.start_ts, duration: r.duration ?? 0 }));
      return new Response(JSON.stringify({ recordings }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'link') {
      if (!recordingId) throw new Error('recordingId is required');
      // valid_for_secs max 12h for custom buckets; default 1h. Use 2h.
      const link = await daily(`/recordings/${recordingId}/access-link?valid_for_secs=7200`, key);
      return new Response(JSON.stringify({
        download_link: link?.download_link ?? null,
        expires: link?.expires ?? null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
