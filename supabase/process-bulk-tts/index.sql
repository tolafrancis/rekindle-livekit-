// supabase/functions/process-bulk-tts/index.ts
// Background worker for bulk TTS generation jobs.
//
// CORRECTED DRAFT — replaces the previous version that:
//   1. ran every slide×language generation serially in ONE request the client
//      awaited, so real-sized jobs blew past the edge wall-clock limit and were
//      killed mid-loop (job stuck 'processing', client saw an invoke error);
//   2. sent an invalid `language` param to OpenAI, hardcoded voice 'alloy', and
//      never chunked text >4096 chars (long slides failed every time);
//   3. never wrote to `tts_audio_cache`, so the player (generate-tts-audio) could
//      not find bulk audio and regenerated/re-billed anyway;
//   4. always updated `devotional_series_days` by `.eq('id', slideId)`, so any
//      non-devotional content type — or a non-uuid CSV slide id — matched 0 rows.
//
// This version returns 202 immediately, processes in the background via
// EdgeRuntime.waitUntil in bounded batches, and RE-INVOKES ITSELF for the
// remainder — so it makes steady progress on jobs of any size without ever
// hitting the per-invocation time limit. It is idempotent/resumable: completed
// (slide,language) pairs in `bulk_tts_generations` are skipped on re-entry.
//
// CLIENT CONTRACT (confirm before deploy): for the player to reuse bulk audio,
// each slide should carry a real `content_id` (the DB uuid the player queries)
// and the job a `content_type`. CSV-driven jobs whose slide_id is like
// "26_slide0" will still generate audio, but it can't be linked to content —
// see linkAudioToContent() below.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/process-bulk-tts`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Complete at most this many generations per invocation, then hand the rest to a
// continuation call. Tune so MAX_PER_RUN × (~6s/gen ÷ CONCURRENCY) stays well
// under the edge wall-clock limit.
const MAX_PER_RUN = 24;
const CONCURRENCY = 3;

// Multilingual OpenAI voices — character, not accuracy; matches generate-tts-audio.
const LANGUAGE_VOICE: Record<string, string> = {
  en: 'alloy', vi: 'nova', zh: 'shimmer', ja: 'shimmer', ko: 'shimmer',
  es: 'nova', fr: 'shimmer', de: 'onyx', pt: 'nova', it: 'nova',
  ru: 'onyx', ar: 'onyx', hi: 'nova', th: 'shimmer', id: 'nova',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// OpenAI TTS caps `input` at 4096 chars. Split long text on sentence boundaries.
function chunkText(value: string, maxLen = 3500): string[] {
  const chunks: string[] = [];
  let remaining = (value || '').trim();
  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf('. ', maxLen);
    if (cut < maxLen * 0.5) cut = remaining.lastIndexOf(' ', maxLen);
    if (cut <= 0) cut = maxLen;
    chunks.push(remaining.slice(0, cut + 1).trim());
    remaining = remaining.slice(cut + 1).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { job_id } = await req.json();
    if (!job_id) return json({ success: false, error: 'job_id is required' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: job, error: jobError } = await supabase
      .from('bulk_tts_jobs').select('*').eq('id', job_id).single();
    if (jobError || !job) return json({ success: false, error: 'Job not found' }, 404);

    // Process in the background so the client gets an immediate 202 and never
    // blocks. EdgeRuntime.waitUntil keeps the worker alive after we respond.
    const work = processBatch(supabase, job);
    // @ts-ignore EdgeRuntime is provided by the Supabase edge runtime
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(work);
    } else {
      await work; // local/dev fallback — may time out on huge jobs
    }

    return json({ success: true, accepted: true, job_id }, 202);
  } catch (error: any) {
    return json({ success: false, error: error?.message ?? 'Unhandled error' }, 500);
  }
});

async function processBatch(supabase: any, job: any) {
  const jobId = job.id;
  try {
    await supabase.from('bulk_tts_jobs')
      .update({ status: 'processing', started_at: job.started_at ?? new Date().toISOString() })
      .eq('id', jobId);

    // Full target list (slide × language).
    const targets: Array<{ slide: any; language: string; key: string }> = [];
    for (const slide of (job.slides_data || [])) {
      for (const language of (job.languages || [])) {
        targets.push({ slide, language, key: `${slide.slide_id}::${language}` });
      }
    }

    // Which (slide,language) pairs are already done? Paginate — a big job's
    // ledger easily exceeds the 1000-row API cap.
    const completedKeys = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data: rows, error } = await supabase
        .from('bulk_tts_generations')
        .select('slide_id, language, status')
        .eq('job_id', jobId)
        .eq('status', 'completed')
        .range(from, from + 999);
      if (error || !rows || rows.length === 0) break;
      for (const r of rows) completedKeys.add(`${r.slide_id}::${r.language}`);
      if (rows.length < 1000) break;
    }

    const pending = targets.filter((t) => !completedKeys.has(t.key));
    const batch = pending.slice(0, MAX_PER_RUN);

    // Bounded-concurrency worker pool over this batch.
    let idx = 0;
    const runWorker = async () => {
      while (idx < batch.length) {
        const cur = batch[idx++];
        await generateOne(supabase, job, cur.slide, cur.language);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, runWorker));

    const counts = await tallyProgress(supabase, jobId);
    const remaining = pending.length - batch.length;

    if (remaining > 0) {
      await supabase.from('bulk_tts_jobs')
        .update({ completed_generations: counts.completed, failed_generations: counts.failed })
        .eq('id', jobId);
      await selfInvoke(jobId); // continue with a fresh invocation
      return;
    }

    await supabase.from('bulk_tts_jobs').update({
      status: counts.failed === 0 ? 'completed' : 'completed_with_errors',
      completed_generations: counts.completed,
      failed_generations: counts.failed,
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);
  } catch (err: any) {
    console.error('[bulk-tts] batch error:', err?.message);
    await supabase.from('bulk_tts_jobs')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', jobId);
  }
}

async function generateOne(supabase: any, job: any, slide: any, language: string) {
  const jobId = job.id;
  // Ledger row (processing).
  const { data: gen } = await supabase.from('bulk_tts_generations').insert({
    job_id: jobId,
    slide_id: slide.slide_id,
    day_number: slide.day_number,
    language,
    text_content: slide.text,
    character_count: (slide.text || '').length,
    status: 'processing',
    started_at: new Date().toISOString(),
  }).select().single();

  try {
    const voice = LANGUAGE_VOICE[language] || 'alloy';

    // Synthesize, chunking long text; drop the invalid `language` OpenAI param.
    const buffers: Uint8Array[] = [];
    for (const chunk of chunkText(slide.text)) {
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'tts-1', voice, input: chunk, speed: 1.0 }),
      });
      if (!res.ok) throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
      buffers.push(new Uint8Array(await res.arrayBuffer()));
    }
    const total = buffers.reduce((s, b) => s + b.length, 0);
    const audio = new Uint8Array(total);
    let off = 0;
    for (const b of buffers) { audio.set(b, off); off += b.length; }

    // Upload (deterministic path => re-runnable).
    const storagePath = `tts-audio/bulk/${jobId}/${slide.slide_id}_${language}.mp3`;
    const { error: upErr } = await supabase.storage.from('audio-content')
      .upload(storagePath, audio, { contentType: 'audio/mpeg', upsert: true });
    if (upErr) throw upErr;
    const { data: { publicUrl } } = supabase.storage.from('audio-content').getPublicUrl(storagePath);

    const cost = ((slide.text || '').length / 1000) * 0.015;
    const duration = (slide.text || '').length / 150;

    await supabase.from('bulk_tts_generations').update({
      status: 'completed', audio_url: publicUrl, audio_duration: duration,
      cost, completed_at: new Date().toISOString(),
    }).eq('id', gen.id);

    await linkAudioToContent(supabase, job, slide, language, publicUrl, duration, voice);
  } catch (error: any) {
    console.error(`[bulk-tts] ${language}/${slide.slide_id} failed:`, error?.message);
    await supabase.from('bulk_tts_generations').update({
      status: 'failed', error_message: error?.message, completed_at: new Date().toISOString(),
    }).eq('job_id', jobId).eq('slide_id', slide.slide_id).eq('language', language);
  }
}

// Link generated audio to the content the PLAYER reads (tts_audio_cache) and to
// the source content's audio_metadata, keyed the same way generate-tts-audio does.
async function linkAudioToContent(
  supabase: any, job: any, slide: any, language: string, audioUrl: string, duration: number, voice: string,
) {
  // The player queries tts_audio_cache by (content_id, content_type, language).
  // Prefer explicit ids from the client; fall back to the slide id.
  const contentId = slide.content_id ?? slide.slide_id;
  const contentType = job.content_type ?? slide.content_type ?? 'devotional';

  // Upsert-by-hand (no assumption about a unique constraint existing).
  const { data: existing } = await supabase.from('tts_audio_cache')
    .select('id').eq('content_id', contentId).eq('content_type', contentType)
    .eq('language', language).maybeSingle();
  if (existing) {
    await supabase.from('tts_audio_cache').update({
      audio_url: audioUrl, voice, last_accessed_at: new Date().toISOString(),
    }).eq('id', existing.id);
  } else {
    await supabase.from('tts_audio_cache').insert({
      content_id: contentId, content_type: contentType, language,
      audio_url: audioUrl, voice, created_at: new Date().toISOString(),
      last_accessed_at: new Date().toISOString(), access_count: 0,
    });
  }

  // Source-content audio_metadata, table-aware. Only attempt when we have a real
  // uuid — CSV ids like "26_slide0" would match nothing. Add cases here as more
  // content types are supported by the bulk uploader.
  if (!UUID_RE.test(String(contentId))) return;
  const TABLE_BY_TYPE: Record<string, string> = {
    devotional: 'devotional_series_days',
    devotional_series_day: 'devotional_series_days',
  };
  const table = TABLE_BY_TYPE[contentType];
  if (!table) return;

  const { data: row } = await supabase.from(table).select('audio_metadata').eq('id', contentId).maybeSingle();
  if (!row) return; // no match => don't pretend it linked
  const meta = row.audio_metadata || {};
  await supabase.from(table).update({
    audio_metadata: {
      ...meta,
      tts: {
        ...(meta.tts || {}),
        [language]: { url: audioUrl, generated_at: new Date().toISOString(), provider: 'openai', voice, quality: 'standard', duration },
      },
    },
  }).eq('id', contentId);
}

async function tallyProgress(supabase: any, jobId: string) {
  let completed = 0, failed = 0;
  for (let from = 0; ; from += 1000) {
    const { data: rows, error } = await supabase.from('bulk_tts_generations')
      .select('status').eq('job_id', jobId).range(from, from + 999);
    if (error || !rows || rows.length === 0) break;
    for (const r of rows) {
      if (r.status === 'completed') completed++;
      else if (r.status === 'failed') failed++;
    }
    if (rows.length < 1000) break;
  }
  return { completed, failed };
}

async function selfInvoke(jobId: string) {
  try {
    await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ job_id: jobId }),
    });
  } catch (err: any) {
    console.error('[bulk-tts] self-invoke failed:', err?.message);
  }
}
