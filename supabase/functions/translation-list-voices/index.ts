// supabase/functions/translation-list-voices/index.ts
//
// RLT Phase 1 voice picker (docs/rlt-voice-cloning-plan.md): the settings
// UI needs a real list of available TTS voices — name, category, and a
// playable preview clip — instead of asking an admin to already know a
// voice ID by heart. This proxies the TTS provider's own voice catalog so
// the provider's API key never reaches the browser.
//
// ── Deploy (Supabase dashboard) ──────────────────────────────────────────
//   1. Edge Functions → "Deploy a new function" → name it exactly:
//      translation-list-voices
//   2. Paste this whole file as its index.ts and deploy.
//   3. Secrets needed: ELEVENLABS_API_KEY (already set for the bot's own
//      TTS calls) and SUPABASE_URL / SUPABASE_ANON_KEY (project-wide).
//
// ── Request ───────────────────────────────────────────────────────────────
//   GET (or POST), Authorization: Bearer <user JWT>
//     → 200 { voices: Array<{ voice_id, name, preview_url, category }> }
//     → 401 { error: 'unauthorized' }   no signed-in user — this proxies our
//                                       own TTS account's catalog and counts
//                                       against its usage, so it's gated
//                                       behind auth even though the voice
//                                       list itself isn't sensitive data.
//     → 502 { error: 'provider_error' } TTS provider's own API call failed
// ───────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

interface VoiceOut {
  voice_id: string;
  name: string;
  preview_url: string | null;
  category: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const TTS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    if (!TTS_API_KEY) return json({ error: 'TTS provider key not configured.' }, 500);
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return json({ error: 'Supabase secrets not configured (SUPABASE_URL/SUPABASE_ANON_KEY).' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);

    const res = await fetch('https://api.elevenlabs.io/v2/voices?page_size=100', {
      headers: { 'xi-api-key': TTS_API_KEY },
    });
    if (!res.ok) {
      console.error('translation-list-voices: provider error', res.status, await res.text().catch(() => ''));
      return json({ error: 'provider_error' }, 502);
    }
    const data = (await res.json()) as { voices?: any[] };
    const voices: VoiceOut[] = (data.voices || []).map((v) => ({
      voice_id: v.voice_id,
      name: v.name,
      preview_url: v.preview_url ?? null,
      category: v.category ?? null,
    }));

    return json({ voices });
  } catch (error) {
    console.error('translation-list-voices error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
