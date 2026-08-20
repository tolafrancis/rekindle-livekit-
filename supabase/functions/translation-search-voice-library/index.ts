// supabase/functions/translation-search-voice-library/index.ts
//
// RLT (docs/rlt-voice-cloning-plan.md, Phase 3b, 2026-08-21): real gap
// found live — the picker's catalog (translation-list-voices) only shows
// voices already sitting in this account's own collection, and the
// account came with almost no non-English voices in it. The TTS
// provider's actual library of voices in every language (including
// Vietnamese) lives at a SEPARATE endpoint, `/v1/shared-voices` — this
// function searches THAT, filterable by language, so an admin can find a
// real Vietnamese (or any other language) voice and add it to the
// account (see translation-add-library-voice) instead of having nothing
// to pick from for that language.
//
// Read-only search against the provider's PUBLIC library — no ministry-
// specific data is touched or returned, so this only requires being
// signed in (prevents anonymous scraping/quota drain), not membership in
// any particular ministry.
//
// ── Deploy (Supabase dashboard or `supabase functions deploy`) ──────────
//   Secrets needed: ELEVENLABS_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY.
//
// ── Request ───────────────────────────────────────────────────────────────
//   POST { language?: string, page?: number }, Authorization: Bearer <user JWT>
//     language: e.g. "vi" for Vietnamese — omit to browse unfiltered.
//     → 200 { voices: Array<{ voice_id, public_owner_id, name, language,
//              accent, gender, preview_url, category }>, hasMore: boolean }
//     → 401 { error: 'unauthorized' }
//     → 502 { error: 'provider_error' }
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed. Use POST.' }, 405);

  try {
    const TTS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    if (!TTS_API_KEY) return json({ error: 'TTS provider key not configured.' }, 500);
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return json({ error: 'Supabase secrets not configured.' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);

    const body = (await req.json().catch(() => ({}))) as { language?: string; page?: number };

    const params = new URLSearchParams({ page_size: '50' });
    if (body.language) params.set('language', body.language);
    if (body.page) params.set('page', String(body.page));

    const res = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${params.toString()}`, {
      headers: { 'xi-api-key': TTS_API_KEY },
    });
    if (!res.ok) {
      console.error('translation-search-voice-library: provider error', res.status, await res.text().catch(() => ''));
      return json({ error: 'provider_error' }, 502);
    }
    const data = (await res.json()) as { voices?: any[]; has_more?: boolean };
    const voices = (data.voices || []).map((v) => ({
      voice_id: v.voice_id,
      public_owner_id: v.public_owner_id,
      name: v.name,
      language: v.language ?? null,
      accent: v.accent ?? null,
      gender: v.gender ?? null,
      preview_url: v.preview_url ?? null,
      category: v.category ?? null,
    }));

    return json({ voices, hasMore: !!data.has_more });
  } catch (error) {
    console.error('translation-search-voice-library error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
