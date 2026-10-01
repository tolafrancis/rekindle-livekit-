// supabase/functions/translation-submit-question/index.ts
//
// The "Conversation" tab's ask side — a /display listener types or speaks
// (via the browser's own Web Speech API, no server STT needed for this)
// a question in their own language. This translates it into the
// speaker's language and stores it as 'pending' for the speaker/admin to
// see, pin, or dismiss.
//
// Public, unauthenticated — same trust model as /display itself (the
// session ID in the URL is not a secret). Anonymous by default: asker_name
// is optional. Rate-limited to one question per 20s per anonymous browser
// fingerprint (generated client-side, stored in localStorage) — the only
// identity available when nothing else was collected.
//
// ── Deploy ────────────────────────────────────────────────────────────
//   Secrets needed: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
//   (all already set — reused from translation-listener-token /
//   detect-transcript-corrections respectively).
//
// ── Request ───────────────────────────────────────────────────────────
//   POST { sessionId, text, askerName?, fingerprint }
//     → 200 { id, speakerText }
//     → 400 { error: 'sessionId, text, and fingerprint are required' }
//     → 404 { error: 'session_not_found' }
//     → 403 { error: 'questions_disabled' }
//     → 429 { error: 'rate_limited', retryAfterMs }
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

const RATE_LIMIT_MS = 20_000;
const MAX_QUESTION_CHARS = 500;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed. Use POST.' }, 405);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Supabase secrets not configured.' }, 500);
    if (!OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY is not set in Supabase secrets.' }, 500);

    const body = (await req.json().catch(() => ({}))) as {
      sessionId?: string;
      text?: string;
      askerName?: string;
      fingerprint?: string;
    };
    const text = (body.text || '').trim();
    const fingerprint = (body.fingerprint || '').trim();
    if (!body.sessionId || !text || !fingerprint) {
      return json({ error: 'sessionId, text, and fingerprint are required' }, 400);
    }
    if (text.length > MAX_QUESTION_CHARS) {
      return json({ error: `Question is too long (max ${MAX_QUESTION_CHARS} characters).` }, 400);
    }

    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: session } = await service
      .from('translation_sessions')
      .select('id, service_id, ministry_id, source_language, target_language, status')
      .eq('id', body.sessionId)
      .maybeSingle();
    if (!session || session.status === 'ended' || session.status === 'error') {
      return json({ error: 'session_not_found' }, 404);
    }

    const { data: cfg } = await service
      .from('language_configs')
      .select('questions_enabled')
      .eq('ministry_id', session.ministry_id)
      .maybeSingle();
    if (cfg && cfg.questions_enabled === false) {
      return json({ error: 'questions_disabled' }, 403);
    }

    // Rate limit — most recent question from this fingerprint, anywhere
    // (not just this session), so someone can't dodge it by switching tabs.
    const { data: lastQuestion } = await service
      .from('translation_questions')
      .select('created_at')
      .eq('fingerprint', fingerprint)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastQuestion) {
      const elapsedMs = Date.now() - new Date(lastQuestion.created_at).getTime();
      if (elapsedMs < RATE_LIMIT_MS) {
        return json({ error: 'rate_limited', retryAfterMs: RATE_LIMIT_MS - elapsedMs }, 429);
      }
    }

    // The asker's own language is whatever they're currently listening in
    // — this session's target_language, exactly what TranslationDisplayPage
    // already knows itself.
    const speakerText = await translateText(text, session.target_language, session.source_language, OPENAI_API_KEY);

    const { data: inserted, error: insertError } = await service
      .from('translation_questions')
      .insert({
        session_id: session.id,
        service_id: session.service_id,
        ministry_id: session.ministry_id,
        asker_name: (body.askerName || '').trim() || null,
        original_text: text,
        original_language: session.target_language,
        speaker_text: speakerText || text,
        fingerprint,
      })
      .select('id')
      .single();
    if (insertError) throw insertError;

    return json({ id: inserted.id, speakerText: speakerText || text });
  } catch (error) {
    console.error('translation-submit-question error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
