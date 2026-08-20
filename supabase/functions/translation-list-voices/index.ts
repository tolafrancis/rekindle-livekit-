// supabase/functions/translation-list-voices/index.ts
//
// RLT Phase 1 voice picker (docs/rlt-voice-cloning-plan.md): the settings
// UI needs a real list of available TTS voices — name, category, and a
// playable preview clip — instead of asking an admin to already know a
// voice ID by heart. This proxies the TTS provider's own voice catalog so
// the provider's API key never reaches the browser.
//
// Ministry-scoped (added for Phase 2, 2026-08-21): the TTS account is
// SHARED across every ministry on the platform. The provider's own voice
// list makes no distinction between "our house library" and "a voice
// ministry X cloned" — without filtering, ministry Y would see and could
// freely assign a voice ministry X cloned (and got consent for, outside
// this app) the moment it exists. This function now cross-references
// translation_custom_voices for the CALLING ministry and only returns:
// the provider's own always-present 'premade' voices + this ministry's
// own cloned/library-added voices. A voice added by a different ministry
// (however it got there) is excluded entirely, not just unlabeled.
//
// ── Deploy (Supabase dashboard or `supabase functions deploy`) ──────────
//   Secrets needed: ELEVENLABS_API_KEY (already set for the bot's own
//   TTS calls) and SUPABASE_URL / SUPABASE_ANON_KEY (project-wide).
//
// ── Request ───────────────────────────────────────────────────────────────
//   POST { ministryId: string }, Authorization: Bearer <user JWT>
//     → 200 { voices: Array<{ voice_id, name, preview_url, category, is_cloned }> }
//     → 400 { error: 'ministryId is required' }
//     → 401 { error: 'unauthorized' }      no signed-in user
//     → 403 { error: 'not_a_member' }      signed in, but not a member of ministryId
//     → 502 { error: 'provider_error' }    TTS provider's own API call failed
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
  is_cloned: boolean;
}

// 'premade' is the provider's own always-present, built-in default voices
// — safe to show every ministry unconditionally. Every OTHER category
// ('cloned', 'generated', 'professional', 'famous', 'high_quality') can be
// something a specific ministry added to this SHARED account, either by
// cloning or (Phase 3b, 2026-08-21) by pulling a voice in from the shared
// Voice Library — so all of them are excluded unless the voice is also in
// this ministry's own translation_custom_voices. Widened from just
// {'cloned','generated','professional'} once library-added voices turned
// out to commonly land in 'famous'/'high_quality' too — a category-based
// allowlist has to name every category that CAN be ministry-specific, not
// just the ones a first pass happened to think of.
const STOCK_CATEGORIES = new Set(['premade']);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed. Use POST.' }, 405);

  try {
    const TTS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    if (!TTS_API_KEY) return json({ error: 'TTS provider key not configured.' }, 500);
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return json({ error: 'Supabase secrets not configured (SUPABASE_URL/SUPABASE_ANON_KEY).' }, 500);
    }

    const body = (await req.json().catch(() => ({}))) as { ministryId?: string };
    if (!body.ministryId) return json({ error: 'ministryId is required' }, 400);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);

    // translation_custom_voices' own member-select RLS is the real gate
    // here — an empty result for a non-member ministryId is indistinguishable
    // from "member, but no cloned voices yet" from this query alone, so
    // check membership explicitly rather than silently returning a
    // stock-only list to someone who isn't part of this ministry at all.
    const { data: isMember, error: memberErr } = await userClient.rpc('is_group_member', {
      p_ministry_id: body.ministryId,
      p_user_id: userData.user.id,
    });
    if (memberErr || !isMember) return json({ error: 'not_a_member' }, 403);

    const { data: ownCustomVoices } = await userClient
      .from('translation_custom_voices')
      .select('external_voice_id')
      .eq('ministry_id', body.ministryId);
    const ownVoiceIds = new Set((ownCustomVoices || []).map((r: any) => r.external_voice_id as string));

    const res = await fetch('https://api.elevenlabs.io/v2/voices?page_size=100', {
      headers: { 'xi-api-key': TTS_API_KEY },
    });
    if (!res.ok) {
      console.error('translation-list-voices: provider error', res.status, await res.text().catch(() => ''));
      return json({ error: 'provider_error' }, 502);
    }
    const data = (await res.json()) as { voices?: any[] };
    const voices: VoiceOut[] = (data.voices || [])
      .filter((v) => STOCK_CATEGORIES.has(v.category) || ownVoiceIds.has(v.voice_id))
      .map((v) => ({
        voice_id: v.voice_id,
        name: v.name,
        preview_url: v.preview_url ?? null,
        category: v.category ?? null,
        is_cloned: ownVoiceIds.has(v.voice_id),
      }));

    return json({ voices });
  } catch (error) {
    console.error('translation-list-voices error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
