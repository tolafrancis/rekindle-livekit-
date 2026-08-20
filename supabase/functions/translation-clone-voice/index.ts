// supabase/functions/translation-clone-voice/index.ts
//
// RLT Phase 2 (docs/rlt-voice-cloning-plan.md): turns an uploaded audio
// sample into a usable voice_id. This is the ONLY new mechanism Phase 2
// introduces — everything downstream (assigning the resulting voice to a
// language, the bot's TTS call) reuses Phase 1's translation_voices /
// getVoiceIdForLanguage exactly as-is. Cloning is just one more way to
// obtain a voice_id.
//
// Consent is handled outside this app entirely (explicit product
// decision, 2026-08-21) — this function does not capture or verify
// consent. It DOES still gate who can trigger a clone (ministry admin
// only) and scopes the result to that ministry (see translation-list-
// voices' own header comment for why that scoping matters).
//
// ── Deploy (Supabase dashboard or `supabase functions deploy`) ──────────
//   Secrets needed: ELEVENLABS_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY (project-wide, already set for other
//   functions in this project).
//
// ── Request ───────────────────────────────────────────────────────────────
//   POST { ministryId, samplePath, label, customVoiceId? }, Authorization: Bearer <user JWT>
//     samplePath: the object path within the translation-voice-samples
//     bucket the client already uploaded to directly (its own upload
//     policy — migration 0282 — already scopes that to admins of
//     ministryId, so this function only needs to READ it back).
//
//     customVoiceId (Phase 3, migration 0283): when present, RE-RECORDS an
//     EXISTING cloned voice instead of creating a new one — calls the
//     provider's edit-voice endpoint (keeps the same external voice_id, so
//     every language currently assigned to it stays correctly assigned,
//     nothing to reassign) instead of its create endpoint, and updates the
//     existing translation_custom_voices row instead of inserting one.
//     The old sample is deleted from storage once the new one is saved.
//
//     → 200 { id, voice_id, label }
//     → 400 { error: 'ministryId, samplePath, and label are required' }
//     → 401 { error: 'unauthorized' }
//     → 403 { error: 'not_authorized_for_ministry' }
//     → 404 { error: 'sample_not_found' }        the newly uploaded sample
//     → 404 { error: 'custom_voice_not_found' }  customVoiceId doesn't exist
//                                                 or belongs to another ministry
//     → 502 { error: 'provider_error' }   TTS provider's clone/edit call failed
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
  samplePath: string;
  label: string;
  customVoiceId?: string;
}

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

    const body = (await req.json().catch(() => ({}))) as Partial<RequestBody>;
    if (!body.ministryId || !body.samplePath || !body.label) {
      return json({ error: 'ministryId, samplePath, and label are required' }, 400);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);
    // User-scoped client — used both to verify identity/authorization AND,
    // deliberately, to make the final DB write below (create_custom_voice),
    // so auth.uid() inside that SECURITY DEFINER function resolves to the
    // real admin, not an ambiguous service-role caller.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);

    // Checked BEFORE the costly provider call, not just relied on via
    // create_custom_voice's own internal check at the end — cloning
    // consumes real provider quota/cost per attempt, so an unauthorized
    // request should never reach that call at all.
    const { data: isAdmin, error: adminErr } = await userClient.rpc('is_group_admin', {
      p_ministry_id: body.ministryId,
      p_user_id: userData.user.id,
    });
    if (adminErr || !isAdmin) return json({ error: 'not_authorized_for_ministry' }, 403);

    // Re-record path (Phase 3): resolve the existing row FIRST, before
    // touching the provider, so a bad customVoiceId fails fast with a
    // clear error instead of burning a provider call for nothing.
    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let existing: { external_voice_id: string; sample_path: string | null } | null = null;
    if (body.customVoiceId) {
      const { data: row, error: rowErr } = await service
        .from('translation_custom_voices')
        .select('external_voice_id, sample_path')
        .eq('id', body.customVoiceId)
        .eq('ministry_id', body.ministryId)
        .maybeSingle();
      if (rowErr || !row) return json({ error: 'custom_voice_not_found' }, 404);
      existing = row;
    }

    // Service-role only for the storage READ — the sample was uploaded
    // through the client's own authenticated session under an upload
    // policy already scoped to admins of this exact ministry (0282), so
    // this is just retrieving what that policy already allowed.
    const { data: sampleBlob, error: downloadErr } = await service.storage
      .from('translation-voice-samples')
      .download(body.samplePath);
    if (downloadErr || !sampleBlob) {
      console.error('translation-clone-voice: sample download failed:', downloadErr?.message);
      return json({ error: 'sample_not_found' }, 404);
    }

    const form = new FormData();
    form.append('name', body.label);
    form.append('files', sampleBlob, 'sample');

    // Edit (same voice_id, new/added samples) vs. create (brand new
    // voice_id) — see this file's header comment for why re-recording
    // deliberately keeps the same voice_id rather than cloning fresh.
    const providerUrl = existing
      ? `https://api.elevenlabs.io/v1/voices/${existing.external_voice_id}/edit`
      : 'https://api.elevenlabs.io/v1/voices/add';
    const providerRes = await fetch(providerUrl, {
      method: 'POST',
      headers: { 'xi-api-key': TTS_API_KEY },
      body: form,
    });
    if (!providerRes.ok) {
      console.error('translation-clone-voice: provider error', providerRes.status, await providerRes.text().catch(() => ''));
      return json({ error: 'provider_error' }, 502);
    }

    let voiceId: string;
    if (existing) {
      // Edit responds { status: 'ok' }, no voice_id — it's unchanged by design.
      voiceId = existing.external_voice_id;
      const { error: updateErr } = await userClient.rpc('update_custom_voice', {
        p_id: body.customVoiceId,
        p_label: body.label,
        p_sample_path: body.samplePath,
      });
      if (updateErr) {
        console.error('translation-clone-voice: update_custom_voice failed:', updateErr.message);
        return json({ error: 'save_failed' }, 500);
      }
      // Clean up the sample this one replaced — best-effort, a leftover
      // file here is just wasted storage, not a correctness problem.
      if (existing.sample_path && existing.sample_path !== body.samplePath) {
        await service.storage.from('translation-voice-samples').remove([existing.sample_path]).catch(() => {});
      }
      return json({ id: body.customVoiceId, voice_id: voiceId, label: body.label });
    }

    const cloneData = (await providerRes.json()) as { voice_id?: string };
    if (!cloneData.voice_id) {
      console.error('translation-clone-voice: provider response had no voice_id', cloneData);
      return json({ error: 'provider_error' }, 502);
    }
    voiceId = cloneData.voice_id;

    // Reuses Phase 1's exact write path — see this file's header comment.
    const { data: customVoiceId, error: insertErr } = await userClient.rpc('create_custom_voice', {
      p_ministry_id: body.ministryId,
      p_external_voice_id: voiceId,
      p_label: body.label,
      p_sample_path: body.samplePath,
      p_provider: 'elevenlabs',
    });
    if (insertErr) {
      // The clone now exists on the provider even though saving our own
      // reference to it failed — log the orphaned voice_id loudly so it
      // can be found and cleaned up rather than silently wasting a slot.
      console.error(
        `translation-clone-voice: create_custom_voice failed after a successful provider clone ` +
        `(orphaned voice_id ${voiceId}):`, insertErr.message,
      );
      return json({ error: 'save_failed' }, 500);
    }

    return json({ id: customVoiceId, voice_id: voiceId, label: body.label });
  } catch (error) {
    console.error('translation-clone-voice error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
