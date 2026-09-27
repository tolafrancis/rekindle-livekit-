// supabase/functions/scripture-passage/index.ts
//
// Live Scripture (phase 1): fetches licensed Bible text from API.Bible so the
// API key never reaches the browser. The public-domain KJV doesn't come
// through here at all; the app ships it (apps/*/public/scripture/kjv.json).
//
// Nothing is stored or cached here: API.Bible's terms don't allow keeping
// licensed text, so every call goes to the provider and the answer is only
// passed straight back to the operator's screen.
//
// ── Deploy ──────────────────────────────────────────────────────────────────
//   Secrets: API_BIBLE_KEY (from https://scripture.api.bible), plus the
//   project-wide SUPABASE_URL / SUPABASE_ANON_KEY.
//
// ── Request ─────────────────────────────────────────────────────────────────
//   POST, Authorization: Bearer <user JWT>
//   { action: 'versions', ministryId, language?: 'eng' }
//     → 200 { versions: Array<{ id, abbreviation, name, language }> }
//   { action: 'passage', ministryId, bibleId, passageId: 'JHN.3.16-JHN.3.18' }
//     → 200 { reference, text, copyright }
//   The speaker link (no signed-in user) sends { sessionId, speakerToken }
//   in place of ministryId; the token is checked by
//   speaker_scripture_settings (migration 0374).
//   → 400 bad input · 401 not signed in · 403 not a member of ministryId
//   → 503 { error: 'not_configured' } API_BIBLE_KEY missing
//   → 502 { error: 'provider_error' } API.Bible failed
// ─────────────────────────────────────────────────────────────────────────────

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

const API_BASE = 'https://api.scripture.api.bible/v1';

// USFM passage ids: JHN.3, JHN.3.16, JHN.3.16-JHN.3.18
const PASSAGE_ID = /^[1-3A-Z]{3}\.\d{1,3}(\.\d{1,3}(-[1-3A-Z]{3}\.\d{1,3}\.\d{1,3})?)?$/;
const BIBLE_ID = /^[A-Za-z0-9-]{1,64}$/;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed. Use POST.' }, 405);

  try {
    const API_BIBLE_KEY = Deno.env.get('API_BIBLE_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return json({ error: 'Supabase secrets not configured (SUPABASE_URL/SUPABASE_ANON_KEY).' }, 500);
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      ministryId?: string;
      /** Speaker link (/speak/:sessionId): its session + token instead of a signed-in user. */
      sessionId?: string;
      speakerToken?: string;
      language?: string;
      bibleId?: string;
      passageId?: string;
    };

    // Every call counts against the platform's API.Bible quota, so only
    // members of the ministry running the service, or that service's own
    // speaker link, can make one.
    if (body.sessionId && body.speakerToken) {
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: ctx, error: ctxErr } = await anonClient.rpc('speaker_scripture_settings', {
        p_session_id: body.sessionId,
        p_speaker_token: body.speakerToken,
      });
      if (ctxErr || !ctx?.ministry_id) return json({ error: 'unauthorized' }, 401);
    } else {
      if (!body.ministryId) return json({ error: 'ministryId is required' }, 400);
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return json({ error: 'unauthorized' }, 401);
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);
      const { data: isMember, error: memberErr } = await userClient.rpc('is_group_member', {
        p_ministry_id: body.ministryId,
        p_user_id: userData.user.id,
      });
      if (memberErr || !isMember) return json({ error: 'not_a_member' }, 403);
    }

    if (!API_BIBLE_KEY) return json({ error: 'not_configured' }, 503);
    const headers = { 'api-key': API_BIBLE_KEY };

    if (body.action === 'versions') {
      const language = /^[a-z]{3}$/.test(body.language || '') ? body.language : 'eng';
      const res = await fetch(`${API_BASE}/bibles?language=${language}`, { headers });
      if (!res.ok) {
        console.error('scripture-passage: versions error', res.status, await res.text().catch(() => ''));
        return json({ error: 'provider_error' }, 502);
      }
      const data = (await res.json()) as { data?: any[] };
      const versions = (data.data || []).map((b) => ({
        id: b.id,
        abbreviation: b.abbreviationLocal || b.abbreviation || b.name,
        name: b.nameLocal || b.name,
        language: b.language?.id || language,
      }));
      return json({ versions });
    }

    if (body.action === 'passage') {
      if (!body.bibleId || !BIBLE_ID.test(body.bibleId)) return json({ error: 'invalid bibleId' }, 400);
      if (!body.passageId || !PASSAGE_ID.test(body.passageId)) return json({ error: 'invalid passageId' }, 400);
      const params = new URLSearchParams({
        'content-type': 'text',
        'include-notes': 'false',
        'include-titles': 'false',
        'include-chapter-numbers': 'false',
        'include-verse-numbers': 'true',
        'include-verse-spans': 'false',
      });
      const res = await fetch(
        `${API_BASE}/bibles/${encodeURIComponent(body.bibleId)}/passages/${encodeURIComponent(body.passageId)}?${params}`,
        { headers },
      );
      if (!res.ok) {
        console.error('scripture-passage: passage error', res.status, await res.text().catch(() => ''));
        return json({ error: res.status === 404 ? 'not_found' : 'provider_error' }, res.status === 404 ? 404 : 502);
      }
      const data = (await res.json()) as { data?: { reference?: string; content?: string; copyright?: string } };
      // Plain-text content marks verses as "[16] For God…"; keep the numbers
      // for multi-verse passages, drop a lone leading one.
      let text = (data.data?.content || '').replace(/\s+/g, ' ').trim();
      text = text.replace(/\[(\d+)\]\s*/g, '$1 ');
      if (!/\[\d+\].*\[\d+\]/.test(data.data?.content || '')) text = text.replace(/^\d+\s+/, '');
      return json({
        reference: data.data?.reference || null,
        text,
        copyright: (data.data?.copyright || '').replace(/\s+/g, ' ').trim() || null,
      });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (error) {
    console.error('scripture-passage error:', error);
    return json({ error: 'internal_error' }, 500);
  }
});
