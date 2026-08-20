// supabase/functions/translation-delete-custom-voice/index.ts
//
// RLT Phase 2 (docs/rlt-voice-cloning-plan.md): deletes a ministry's own
// cloned voice — from the TTS provider, from translation_custom_voices,
// from the uploaded sample in storage, AND clears it from any language
// it's currently assigned to (translation_voices) so a deleted voice never
// leaves a language silently pointing at a voice_id that no longer exists.
//
// ── Deploy (Supabase dashboard or `supabase functions deploy`) ──────────
//   Secrets needed: ELEVENLABS_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY (project-wide).
//
// ── Request ───────────────────────────────────────────────────────────────
//   POST { customVoiceId }, Authorization: Bearer <user JWT>
//     → 200 { ok: true, clearedLanguages: string[] }  clearedLanguages is
//       every target_language this voice was assigned to and just got
//       reverted to the ministry default — tell the admin, don't just
//       silently change their settings.
//     → 401 { error: 'unauthorized' }
//     → 403 { error: 'not_authorized_for_ministry' }
//     → 404 { error: 'not_found' }
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
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!TTS_API_KEY) return json({ error: 'TTS provider key not configured.' }, 500);
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: 'Supabase secrets not configured.' }, 500);
    }

    const body = (await req.json().catch(() => ({}))) as { customVoiceId?: string };
    if (!body.customVoiceId) return json({ error: 'customVoiceId is required' }, 400);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);

    // Service role to look the row up regardless of who's asking (member-
    // select RLS would already let a non-admin member see it too — the
    // real gate is the is_group_admin check right after this).
    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: row, error: rowErr } = await service
      .from('translation_custom_voices')
      .select('id, ministry_id, provider, external_voice_id, sample_path')
      .eq('id', body.customVoiceId)
      .maybeSingle();
    if (rowErr || !row) return json({ error: 'not_found' }, 404);

    const { data: isAdmin, error: adminErr } = await userClient.rpc('is_group_admin', {
      p_ministry_id: row.ministry_id,
      p_user_id: userData.user.id,
    });
    if (adminErr || !isAdmin) return json({ error: 'not_authorized_for_ministry' }, 403);

    // Clear any language currently assigned to this voice BEFORE deleting
    // it from the provider — otherwise a live session for that language
    // would start failing TTS calls against a voice_id that no longer
    // exists, silently, the next time it runs.
    const { data: affected } = await service
      .from('translation_voices')
      .select('target_language')
      .eq('ministry_id', row.ministry_id)
      .eq('voice_id', row.external_voice_id);
    const clearedLanguages = (affected || []).map((r: any) => r.target_language as string);
    if (clearedLanguages.length > 0) {
      await service
        .from('translation_voices')
        .delete()
        .eq('ministry_id', row.ministry_id)
        .eq('voice_id', row.external_voice_id);
    }

    // Best-effort against the provider — don't let a provider-side failure
    // block removing the admin's own reference to it; log loudly instead,
    // since a failed delete here leaves an orphaned voice on the shared
    // account rather than a broken local state.
    if (row.provider === 'elevenlabs') {
      const delRes = await fetch(`https://api.elevenlabs.io/v1/voices/${row.external_voice_id}`, {
        method: 'DELETE',
        headers: { 'xi-api-key': TTS_API_KEY },
      });
      if (!delRes.ok) {
        console.error(
          `translation-delete-custom-voice: provider delete failed for ${row.external_voice_id}:`,
          delRes.status, await delRes.text().catch(() => ''),
        );
      }
    }

    const { error: deleteRowErr } = await userClient.rpc('delete_custom_voice_row', { p_id: row.id });
    if (deleteRowErr) {
      console.error('translation-delete-custom-voice: delete_custom_voice_row failed:', deleteRowErr.message);
      return json({ error: 'delete_failed' }, 500);
    }

    if (row.sample_path) {
      await service.storage.from('translation-voice-samples').remove([row.sample_path]).catch(() => {});
    }

    return json({ ok: true, clearedLanguages });
  } catch (error) {
    console.error('translation-delete-custom-voice error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
