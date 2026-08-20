// supabase/functions/translation-add-library-voice/index.ts
//
// RLT (docs/rlt-voice-cloning-plan.md, Phase 3b, 2026-08-21): the second
// half of the library-search flow — adds a voice found via
// translation-search-voice-library into the shared TTS account, and
// records it in translation_custom_voices scoped to the requesting
// ministry, reusing the exact same table/mechanism Phase 2's cloning
// already uses (is_cloned = false here — "added from the shared library,"
// not "cloned from our own audio sample" — same downstream handling
// either way: translation-list-voices only shows it to the ministry that
// added it, per its own ministry-scoping).
//
// Admin-gated the same way as cloning: adding a voice to the shared
// account is a real, if small, action worth restricting to ministry
// admins, not every member.
//
// ── Deploy (Supabase dashboard or `supabase functions deploy`) ──────────
//   Secrets needed: ELEVENLABS_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY.
//
// ── Request ───────────────────────────────────────────────────────────────
//   POST { ministryId, publicOwnerId, voiceId, label }, Authorization: Bearer <user JWT>
//     publicOwnerId, voiceId: from a translation-search-voice-library result
//     (its public_owner_id / voice_id — NOT the same shape as a regular
//     voice_id once added; the provider mints a NEW one for this account).
//
//     → 200 { id, voice_id, label }
//     → 400 { error: 'ministryId, publicOwnerId, voiceId, and label are required' }
//     → 401 { error: 'unauthorized' }
//     → 403 { error: 'not_authorized_for_ministry' }
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

interface RequestBody {
  ministryId: string;
  publicOwnerId: string;
  voiceId: string;
  label: string;
}

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

    const body = (await req.json().catch(() => ({}))) as Partial<RequestBody>;
    if (!body.ministryId || !body.publicOwnerId || !body.voiceId || !body.label) {
      return json({ error: 'ministryId, publicOwnerId, voiceId, and label are required' }, 400);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);

    const { data: isAdmin, error: adminErr } = await userClient.rpc('is_group_admin', {
      p_ministry_id: body.ministryId,
      p_user_id: userData.user.id,
    });
    if (adminErr || !isAdmin) return json({ error: 'not_authorized_for_ministry' }, 403);

    const addRes = await fetch(
      `https://api.elevenlabs.io/v1/voices/add/${body.publicOwnerId}/${body.voiceId}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': TTS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_name: body.label }),
      },
    );
    if (!addRes.ok) {
      console.error('translation-add-library-voice: provider error', addRes.status, await addRes.text().catch(() => ''));
      return json({ error: 'provider_error' }, 502);
    }
    // Returns a NEW voice_id for this account — not the shared library's
    // original one (see this file's header comment).
    const addData = (await addRes.json()) as { voice_id?: string };
    if (!addData.voice_id) {
      console.error('translation-add-library-voice: provider response had no voice_id', addData);
      return json({ error: 'provider_error' }, 502);
    }

    // Reuses Phase 2's exact write path — is_cloned=false distinguishes
    // "added from the shared library" from "cloned from our own sample"
    // for display purposes only; both are handled identically everywhere
    // downstream (the picker, the bot's TTS call).
    const { data: customVoiceId, error: insertErr } = await userClient.rpc('create_custom_voice', {
      p_ministry_id: body.ministryId,
      p_external_voice_id: addData.voice_id,
      p_label: body.label,
      p_sample_path: null,
      p_provider: 'elevenlabs',
    });
    if (insertErr) {
      console.error(
        `translation-add-library-voice: create_custom_voice failed after a successful provider add ` +
        `(orphaned voice_id ${addData.voice_id}):`, insertErr.message,
      );
      return json({ error: 'save_failed' }, 500);
    }

    return json({ id: customVoiceId, voice_id: addData.voice_id, label: body.label });
  } catch (error) {
    console.error('translation-add-library-voice error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
