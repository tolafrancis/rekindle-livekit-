// supabase/functions/translation-pin-question/index.ts
//
// The "Conversation" tab's pin side — the speaker (browser_speaker
// sessions, via speaker_token) or a ministry/platform admin (authenticated,
// via MinistryTranslationServiceManager's Questions panel) picks one
// pending question to surface to EVERY listener under the service, in
// each listener's own language. Needs a real OpenAI call per sibling
// language, which is why this is an edge function rather than a plain
// RPC (translation-submit-question's reasoning applies the same way here).
//
// Only one question is pinned per service at a time — pinning a new one
// dismisses whatever was pinned before it, so /display's pinned banner
// is never ambiguous about which question is "the" current one.
//
// ── Deploy ────────────────────────────────────────────────────────────
//   Secrets needed: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   SUPABASE_ANON_KEY, OPENAI_API_KEY (all already set).
//
// ── Request ───────────────────────────────────────────────────────────
//   POST { questionId, speakerToken?, answerText? }
//        (Authorization header instead of speakerToken for the admin path;
//         answerText is an optional written reply, typed in the SPEAKER's
//         language and translated for every listener alongside the question)
//     → 200 { ok: true }
//     → 400 { error: 'questionId is required' }
//     → 401 { error: 'invalid_speaker_token' } | { error: 'unauthorized' }
//     → 404 { error: 'question_not_found' }
// ─────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { translateText } from '../_shared/translateText.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed. Use POST.' }, 405);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      return json({ error: 'Supabase secrets not configured.' }, 500);
    }
    if (!OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY is not set in Supabase secrets.' }, 500);

    const body = (await req.json().catch(() => ({}))) as { questionId?: string; speakerToken?: string; answerText?: string };
    if (!body.questionId) return json({ error: 'questionId is required' }, 400);
    const answerText = (body.answerText || '').trim().slice(0, 1000);

    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: question } = await service
      .from('translation_questions')
      .select('id, session_id, service_id, ministry_id, original_text, original_language, speaker_text')
      .eq('id', body.questionId)
      .maybeSingle();
    if (!question) return json({ error: 'question_not_found' }, 404);

    // Dual auth — same shape as dismiss_translation_question (SQL RPC),
    // just re-implemented here since this handler can't call a Postgres
    // function partway through and still keep using the service-role
    // client for everything else in one request.
    if (body.speakerToken) {
      const { data: session } = await service
        .from('translation_sessions')
        .select('speaker_token_hash, source_type')
        .eq('id', question.session_id)
        .maybeSingle();
      const tokenHash = await sha256Hex(body.speakerToken);
      if (!session || session.source_type !== 'browser_speaker' || session.speaker_token_hash !== tokenHash) {
        return json({ error: 'invalid_speaker_token' }, 401);
      }
    } else {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return json({ error: 'unauthorized' }, 401);
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: 'unauthorized' }, 401);
      const { data: isAdmin } = await service.rpc('is_group_admin', { p_ministry_id: question.ministry_id, p_user_id: user.id });
      const { data: isPlatformAdmin } = await service.rpc('is_content_admin', { p_user_id: user.id });
      if (!isAdmin && !isPlatformAdmin) return json({ error: 'unauthorized' }, 401);
    }

    // Every language a listener under this service could currently be
    // viewing in — every non-ended sibling session's target_language,
    // deduplicated. The asker's own language (original_text) and the
    // speaker's (speaker_text) are already translated from submit time;
    // everything else needs a fresh call.
    const { data: siblingSessions } = await service
      .from('translation_sessions')
      .select('source_language, target_language')
      .eq('service_id', question.service_id)
      .neq('status', 'ended');

    const languagesNeeded = new Set<string>();
    (siblingSessions || []).forEach((s) => {
      languagesNeeded.add(s.target_language);
      languagesNeeded.add(s.source_language);
    });

    const translations: Record<string, string> = {
      [question.original_language]: question.original_text,
    };
    const speakerLanguage = (siblingSessions || []).find((s) => true)?.source_language;
    if (speakerLanguage && question.speaker_text) translations[speakerLanguage] = question.speaker_text;

    const toTranslate = Array.from(languagesNeeded).filter((lang) => !(lang in translations));
    const results = await Promise.all(
      toTranslate.map((lang) =>
        translateText(question.original_text, question.original_language, lang, OPENAI_API_KEY)
          .then((text) => ({ lang, text }))
          .catch((err) => {
            console.error(`[translation-pin-question] translate to ${lang} failed:`, err);
            return { lang, text: question.original_text }; // fall back to original rather than leaving the language missing
          }),
      ),
    );
    results.forEach(({ lang, text }) => { translations[lang] = text; });

    // Written answer, if the speaker typed one — in the speaker's language,
    // fanned out to the same set of languages as the question.
    const answerTranslations: Record<string, string> = {};
    if (answerText) {
      const answerSource = speakerLanguage || question.original_language;
      const answerLanguages = new Set<string>([...languagesNeeded, question.original_language]);
      const answers = await Promise.all(
        Array.from(answerLanguages).map((lang) =>
          translateText(answerText, answerSource, lang, OPENAI_API_KEY, 'answer')
            .then((text) => ({ lang, text: text || answerText }))
            .catch((err) => {
              console.error(`[translation-pin-question] answer translate to ${lang} failed:`, err);
              return { lang, text: answerText };
            }),
        ),
      );
      answers.forEach(({ lang, text }) => { answerTranslations[lang] = text; });
    }

    // Unpin whatever was pinned before, then pin this one — only one
    // pinned question per service at a time (see header comment).
    await service.from('translation_questions').update({ status: 'dismissed' }).eq('service_id', question.service_id).eq('status', 'pinned');
    const { error: pinError } = await service
      .from('translation_questions')
      .update({
        status: 'pinned',
        pinned_at: new Date().toISOString(),
        pinned_translations: translations,
        answer_text: answerText || null,
        pinned_answer_translations: answerTranslations,
      })
      .eq('id', question.id);
    if (pinError) throw pinError;

    return json({ ok: true });
  } catch (error) {
    console.error('translation-pin-question error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
