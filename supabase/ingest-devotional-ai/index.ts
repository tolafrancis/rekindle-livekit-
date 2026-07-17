// supabase/ingest-devotional-ai/index.ts
//
// Daily AI generator for devotional STREAMS (see docs/devotional-stream-automation-plan.md).
// For every ACTIVE `kind='ai'` row in devotional_stream_sources it writes one original
// devotional for today into public.devotionals, scoped to that stream.
//
// Design notes that matter:
//   • Scripture TEXT always comes from the Bible API, never the model — models misquote
//     verses. The model only CHOOSES the reference and writes the reflection around it.
//   • Inserts are DRAFTS (is_published = false) for an admin to approve, so a bad
//     generation never reaches users.
//   • Idempotent: skips when a row already exists for (stream_id, today); the DB also
//     enforces uq_devotionals_stream_day so a double-fire can't duplicate.
//   • Columns mirror the admin devotional form exactly (message = body, scripture =
//     reference), so generated entries render identically to hand-authored ones.
//
// ── Deploy (Supabase dashboard) ──────────────────────────────────────────────
//   1. Edge Functions → new function named exactly: ingest-devotional-ai
//   2. Paste this whole file as its index.ts and deploy.
//   3. Requires migration 0161 + the existing `meeting-ai` function (OPENAI_API_KEY).
//   4. Schedule it with supabase/cron-setup-devotional-streams.sql
//
// Manual run:  POST /functions/v1/ingest-devotional-ai   { }            → all active
//              POST /functions/v1/ingest-devotional-ai   { streamId }   → just one (Run now)
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

/** Today as YYYY-MM-DD (UTC). Streams are global; schedule_date is a DATE, and the
 *  client resolves "today" locally against it, so one early-UTC run is correct. */
const todayUtc = (): string => new Date().toISOString().slice(0, 10);

/** Models like to wrap JSON in prose or ``` fences. Pull the first JSON object out. */
function parseJsonLoose(text: string): any {
  const cleaned = (text ?? '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* fall through */ }
    }
    return null;
  }
}

/** Verse text from bible-api.com (free, public-domain translations) — same service the
 *  admin "Load scripture" button uses (packages/features/src/bibleApi.ts). */
async function fetchScripture(reference: string, version = 'kjv'): Promise<string> {
  const ref = (reference || '').trim();
  if (!ref) throw new Error('empty scripture reference');
  const url = version && version !== 'web'
    ? `https://bible-api.com/${encodeURIComponent(ref)}?translation=${version}`
    : `https://bible-api.com/${encodeURIComponent(ref)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`scripture lookup failed for "${ref}" (${res.status})`);
  const data = await res.json();
  const text = data?.text
    || (Array.isArray(data?.verses) ? data.verses.map((v: any) => v.text).join(' ') : '');
  const clean = (text || '').trim();
  if (!clean) throw new Error(`no text returned for "${ref}"`);
  return clean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed. Use POST.' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  /** Call the existing meeting-ai proxy (holds OPENAI_API_KEY). */
  const ai = async (system: string, user: string, temperature: number): Promise<string> => {
    const { data, error } = await admin.functions.invoke('meeting-ai', {
      body: { system, user, temperature, maxTokens: 1200 },
    });
    if (error) throw new Error(`meeting-ai: ${error.message}`);
    if (!data?.text) throw new Error('meeting-ai returned no text');
    return data.text as string;
  };

  try {
    const body = await req.json().catch(() => ({}));
    const onlyStreamId: string | undefined = body?.streamId;
    const day = todayUtc();

    let q = admin.from('devotional_stream_sources').select('*').eq('kind', 'ai').eq('is_active', true);
    if (onlyStreamId) q = q.eq('stream_id', onlyStreamId);
    const { data: sources, error: srcErr } = await q;
    if (srcErr) throw srcErr;

    const results: any[] = [];

    for (const src of sources ?? []) {
      const streamId = (src as any).stream_id as string;
      let status = 'ok';
      try {
        // 1. Idempotency — never write twice for the same stream+day.
        const { data: existing } = await admin
          .from('devotionals')
          .select('id')
          .eq('stream_id', streamId)
          .eq('schedule_date', day)
          .maybeSingle();
        if (existing) {
          status = 'skipped';
          results.push({ streamId, status });
          await admin.from('devotional_stream_sources')
            .update({ last_run_at: new Date().toISOString(), last_status: status, updated_at: new Date().toISOString() })
            .eq('stream_id', streamId);
          continue;
        }

        // 2. Avoid repeating recent passages in this stream.
        const { data: recent } = await admin
          .from('devotionals')
          .select('scripture')
          .eq('stream_id', streamId)
          .order('schedule_date', { ascending: false })
          .limit(30);
        const avoid = (recent ?? []).map((r: any) => r.scripture).filter(Boolean);

        // 3. Model CHOOSES the reference (themed rotation driven by the editable prompt).
        const refRaw = await ai(
          'You select Bible passages for a daily devotional series. Respond with ONLY valid JSON.',
          `Theme/brief for this devotional series:\n${(src as any).prompt}\n\n` +
          `Choose ONE Bible passage for today that fits the brief. It must be 1-8 verses long.\n` +
          `Do NOT choose any of these recently used passages: ${avoid.length ? avoid.join('; ') : '(none yet)'}\n\n` +
          `Respond as JSON: {"scripture_reference": "Book Chapter:Verse-Verse", "theme": "2-4 word theme"}`,
          0.8, // some variety in passage choice
        );
        const pick = parseJsonLoose(refRaw);
        const reference = (pick?.scripture_reference ?? '').toString().trim();
        const theme = (pick?.theme ?? '').toString().trim() || null;
        if (!reference) throw new Error('model did not return a scripture_reference');

        // 4. Verse TEXT from the Bible API — never from the model.
        const version = (src as any).scripture_version || 'kjv';
        const scriptureText = await fetchScripture(reference, version);

        // 5. Write the devotional GROUNDED in the real passage text.
        const devRaw = await ai(
          'You write warm, faithful Christian daily devotionals. Respond with ONLY valid JSON.',
          `Theme/brief for this devotional series:\n${(src as any).prompt}\n\n` +
          `Today's passage: ${reference} (${version.toUpperCase()})\n"""${scriptureText}"""\n\n` +
          `Write a devotional grounded ONLY in that passage. Do not quote other verses at length.\n` +
          `Respond as JSON:\n` +
          `{"title": "short compelling title",\n` +
          ` "message": "the devotional body, roughly 350-450 words, plain prose paragraphs separated by blank lines",\n` +
          ` "prayer": "a short closing prayer, 2-4 sentences",\n` +
          ` "reflection_questions": ["question 1", "question 2"]}`,
          0.7,
        );
        const dev = parseJsonLoose(devRaw);
        if (!dev) throw new Error('model returned unparseable JSON for the devotional');

        const title = (dev.title ?? '').toString().trim();
        const message = (dev.message ?? '').toString().trim();
        const prayer = (dev.prayer ?? '').toString().trim();
        const questions = Array.isArray(dev.reflection_questions)
          ? dev.reflection_questions.map((x: any) => String(x).trim()).filter(Boolean)
          : [];

        // 6. Quality gate — a thin/empty generation must NOT become a devotional.
        if (!title) throw new Error('quality gate: empty title');
        if (message.length < 500) throw new Error(`quality gate: body too short (${message.length} chars)`);
        if (!prayer) throw new Error('quality gate: empty prayer');
        if (questions.length < 2) throw new Error('quality gate: needs 2 reflection questions');

        // 7. Insert as a DRAFT for admin approval. Columns mirror the admin form.
        const { error: insErr } = await admin.from('devotionals').insert({
          stream_id: streamId,
          schedule_date: day,
          is_published: false, // draft — an admin approves it
          title,
          message,
          scripture: reference,
          scripture_reference: reference,
          scripture_text: scriptureText,
          scripture_version: version,
          prayer,
          reflection_questions: questions.slice(0, 4),
          theme,
        });
        if (insErr) throw insErr;

        results.push({ streamId, status, reference, title });
      } catch (e) {
        status = `error: ${e instanceof Error ? e.message : String(e)}`;
        console.error(`[ingest-devotional-ai] stream ${streamId}:`, status);
        results.push({ streamId, status });
      }

      // 8. Observability — always record the outcome, success or failure.
      await admin.from('devotional_stream_sources')
        .update({ last_run_at: new Date().toISOString(), last_status: status, updated_at: new Date().toISOString() })
        .eq('stream_id', streamId);
    }

    return json({ success: true, day, processed: results.length, results });
  } catch (error) {
    console.error('[ingest-devotional-ai] critical:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
