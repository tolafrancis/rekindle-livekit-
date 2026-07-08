import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// Asian languages to auto-translate to
const ASIAN_LANGUAGES = ['zh', 'ja', 'ko', 'vi', 'th', 'id', 'hi', 'ar', 'bn', 'ta', 'te', 'ur', 'fa', 'he', 'my', 'km', 'lo', 'ne', 'si', 'tl', 'ms'];

const LANGUAGE_NAMES: Record<string, string> = {
  'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German', 'pt': 'Portuguese',
  'zh': 'Chinese', 'ja': 'Japanese', 'ko': 'Korean', 'ar': 'Arabic', 'hi': 'Hindi',
  'ru': 'Russian', 'it': 'Italian', 'nl': 'Dutch', 'pl': 'Polish', 'tr': 'Turkish',
  'vi': 'Vietnamese', 'th': 'Thai', 'id': 'Indonesian', 'bn': 'Bengali', 'ta': 'Tamil',
  'te': 'Telugu', 'ur': 'Urdu', 'fa': 'Persian', 'he': 'Hebrew', 'my': 'Burmese',
  'km': 'Khmer', 'lo': 'Lao', 'ne': 'Nepali', 'si': 'Sinhala', 'tl': 'Filipino', 'ms': 'Malay'
};

const CONTENT_FIELD_MAP: Record<string, string[]> = {
  // Scripture verse text is localized at READ time from a published Bible
  // version by reference (src/lib/bibleLocalization.ts), so scripture_text /
  // scripture_reference here are only the machine-translated FALLBACK for
  // languages with no published version. The other text fields are what the
  // readers actually render, so they must all be listed or they stay English.
  'devotional': ['title', 'content', 'message', 'scripture_reference', 'scripture_text', 'reflection', 'reflection_questions', 'prayer', 'prayer_focus'],
  'ministry_devotional': ['title', 'content', 'message', 'scripture_reference', 'scripture_text', 'reflection', 'reflection_questions', 'prayer', 'prayer_focus'],
  'prayer': ['title', 'content', 'description', 'prayer_text'],
  'prayer_library': ['title', 'content', 'scripture'],
  'prayer_series': ['title', 'description'],
  'devotional_series': ['title', 'description'],
  'announcement': ['title', 'content', 'description'],
  'teaching': ['title', 'summary', 'key_takeaways'],
  'prayer_point': ['title', 'content', 'scripture'],
  'book_summary': ['title', 'summary', 'key_takeaways'],
  'affirmation': ['title', 'text', 'scripture_reference'],
  'declaration': ['title', 'text', 'scripture_reference'],
  // Daily devotional readings (devotional_entries). Superset of every string
  // field the reader renders (DevotionalSeriesViewer.localizeDay), so the full
  // daily body translates — not just title/content. The worker fetches select('*')
  // and skips any field that's absent or non-string, so listing extras is safe.
  'devotional_entry': [
    'title', 'subtitle', 'scripture_reference', 'scripture_text',
    'main_content', 'content', 'devotional_text', 'body',
    'introduction', 'reflection', 'reflection_questions',
    'guided_prayer', 'prayer', 'action_step', 'action_steps',
    'additional_thoughts'
  ],
  // scripture_reference/scripture_text are the machine fallback; primary
  // localization is the read-time published-Bible lookup by reference.
  // prayer_points is an array of objects — see OBJECT_ARRAY_TRANSLATABLE.
  'prayer_topic': ['title', 'description', 'scripture_reference', 'scripture_text', 'prayer_points']
};

// Content type -> source table, for the server-side "translate all" bulk enqueue.
const CONTENT_TABLE_MAP: Record<string, string> = {
  'devotional': 'devotionals',
  'ministry_devotional': 'ministry_devotionals',
  'prayer': 'prayer_points',
  'prayer_library': 'prayer_library',
  'announcement': 'ministry_announcements',
  'teaching': 'book_summaries',
  'book_summary': 'book_summaries',
  'prayer_series': 'prayer_series',
  'devotional_series': 'devotional_series',
  'affirmation': 'affirmations',
  'declaration': 'declarations',
  'devotional_entry': 'devotional_entries',
  'prayer_topic': 'prayer_topics'
};

// Content types the hourly auto-enqueue keeps translated as new items are added.
const DEFAULT_AUTO_CONTENT_TYPES = [
  'devotional', 'ministry_devotional', 'devotional_series', 'devotional_entry',
  'prayer_library', 'prayer_topic', 'book_summary', 'affirmation', 'declaration'
];

// Languages currently launched to users (app_languages registry). Used as the
// default target set for auto-enqueue so it tracks whatever you publish — no
// hardcoded list to maintain. Excludes English (the source).
async function getPublishedLanguages(supabase: any): Promise<string[]> {
  const { data, error } = await supabase
    .from('app_languages')
    .select('code')
    .eq('enabled', true)
    .eq('ui_status', 'published');
  if (error || !data) return [];
  return data.map((r: any) => r.code).filter((c: string) => c && c !== 'en');
}

// Bulk-enqueue every row of the given content types for the target languages,
// skipping (content,language) pairs already completed or already in flight, so
// re-running is cheap and never double-queues. Preserves existing completed
// status (unlike queueContentForTranslation's reset upsert). Paginates every
// read to beat Supabase's 1000-row API cap.
async function queueAllContent(
  supabase: any,
  contentTypes: string[],
  targetLanguages: string[],
  sourceLanguage: string,
  priority: number,
  createdBy?: string,
  force: boolean = false,
): Promise<any> {
  const perType: Record<string, any> = {};
  let totalItems = 0, totalQueued = 0, totalSkipped = 0;

  for (const contentType of contentTypes) {
   try {
    const table = CONTENT_TABLE_MAP[contentType];
    const fields = CONTENT_FIELD_MAP[contentType] || ['title', 'content'];
    if (!table) { perType[contentType] = { items: 0, queued: 0, skipped: 0 }; continue; }

    // All content ids.
    const ids: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: rows, error } = await supabase.from(table).select('id').range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      if (!rows || rows.length === 0) break;
      for (const r of rows) ids.push(r.id);
      if (rows.length < 1000) break;
    }

    // Completed languages per content id.
    const completedBy: Record<string, Set<string>> = {};
    for (let from = 0; ; from += 1000) {
      const { data: st } = await supabase.from('content_translation_status')
        .select('content_id, completed_language_codes')
        .eq('content_type', contentType).range(from, from + 999);
      if (!st || st.length === 0) break;
      for (const s of st) completedBy[s.content_id] = new Set(s.completed_language_codes || []);
      if (st.length < 1000) break;
    }

    // In-flight (pending/processing) languages per content id — avoids duplicates.
    const inflightBy: Record<string, Set<string>> = {};
    for (let from = 0; ; from += 1000) {
      const { data: q } = await supabase.from('translation_queue')
        .select('content_id, target_language')
        .eq('content_type', contentType).in('status', ['pending', 'processing'])
        .range(from, from + 999);
      if (!q || q.length === 0) break;
      for (const row of q) (inflightBy[row.content_id] ??= new Set()).add(row.target_language);
      if (q.length < 1000) break;
    }

    let items = 0, queued = 0, skipped = 0;
    for (const id of ids) {
      const done = completedBy[id] || new Set<string>();
      const inflight = inflightBy[id] || new Set<string>();
      // force=true re-queues languages already completed (e.g. to backfill newly
      // added translatable fields). We still skip in-flight langs so we never
      // insert a duplicate pending row.
      const missing = targetLanguages.filter(l =>
        l !== sourceLanguage && !inflight.has(l) && (force || !done.has(l)));
      if (missing.length === 0) { skipped++; continue; }

      await supabase.from('translation_queue').insert(missing.map(lang => ({
        content_type: contentType, content_id: String(id), content_table: table,
        source_language: sourceLanguage, target_language: lang,
        fields_to_translate: fields, priority, created_by: createdBy,
        is_auto_triggered: true, status: 'pending'
      })));

      // Merge into status without clobbering already-completed languages.
      await supabase.from('content_translation_status').upsert({
        content_type: contentType, content_id: String(id), content_table: table,
        total_languages: done.size + inflight.size + missing.length,
        completed_languages: done.size,
        pending_languages: Array.from(new Set([...inflight, ...missing])),
        completed_language_codes: Array.from(done),
        failed_languages: []
      }, { onConflict: 'content_type,content_id' });

      items++; queued += missing.length;
    }
    perType[contentType] = { items, queued, skipped };
    totalItems += items; totalQueued += queued; totalSkipped += skipped;
   } catch (e: any) {
    // Don't let one missing/broken table abort the rest (matters for the
    // hourly auto-run across many content types).
    perType[contentType] = { items: 0, queued: 0, skipped: 0, error: e?.message };
    console.error(`queueAllContent: ${contentType} failed:`, e?.message);
   }
  }

  return { success: true, totalItems, totalQueued, skipped: totalSkipped, perType };
}

// The worker translates INLINE — shared-cache lookup + a direct OpenAI call —
// instead of invoking the translate-content edge function. Function-to-function
// invokes were failing under load with "Failed to send a request to the Edge
// Function" (a connection-level failure of the self-invoke, which retries can't
// fix). Going direct removes that fragile hop: cached strings are a pure DB read
// (no external call at all), and misses hit OpenAI directly. The cache
// (translation_cache), key, model and prompt are IDENTICAL to translate-content,
// so both paths stay fully cache-compatible. `_gatewayKey` is unused (kept for
// call-site compatibility).
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

const TRANSLATE_CONTEXT: Record<string, string> = {
  'ui': 'User interface text - keep it concise and clear',
  'devotional': 'Daily devotional content - inspirational and reflective',
  'prayer': 'Prayer text - reverent and heartfelt',
  'scripture': 'Biblical scripture - maintain accuracy and reverence',
  'announcement': 'Ministry announcement - clear and informative',
  'general': 'General content - natural and contextual',
};

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Shared cache read — keyed by (content_hash, source_language, target_language),
// matching translate-content's unique index (content_type is NOT part of the key).
async function cacheLookup(supabase: any, text: string, sourceLang: string, targetLang: string): Promise<string | null> {
  const contentHash = await sha256Hex(text);
  const { data, error } = await supabase
    .from('translation_cache')
    .select('translated_text')
    .eq('content_hash', contentHash)
    .eq('source_language', sourceLang)
    .eq('target_language', targetLang)
    .maybeSingle();
  if (error || !data) return null;
  return data.translated_text;
}

async function cacheSave(supabase: any, text: string, translated: string, sourceLang: string, targetLang: string, contentType: string): Promise<void> {
  const contentHash = await sha256Hex(text);
  const { error } = await supabase.from('translation_cache').upsert({
    content_hash: contentHash,
    source_text: text,
    source_language: sourceLang,
    target_language: targetLang,
    translated_text: translated,
    content_type: contentType,
    provider: 'openai',
    model: 'gpt-4o-mini',
    access_count: 1,
    last_accessed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'content_hash,source_language,target_language' });
  if (error) console.error('cacheSave failed:', error.message);
}

async function openAITranslate(text: string, sourceLang: string, targetLang: string, contentType: string): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
  const context = TRANSLATE_CONTEXT[contentType] || TRANSLATE_CONTEXT.general;
  const systemPrompt = `You are a professional translator specializing in spiritual and religious content.
Translate the following text from ${sourceLang} to ${targetLang}.

Context: ${context}

IMPORTANT RULES:
1. Maintain the spiritual and reverent tone
2. Keep formatting (line breaks, special characters) intact
3. For UI strings, keep translations concise
4. For scripture, maintain accuracy and traditional phrasing where appropriate
5. Return ONLY the translated text, no explanations
6. If the text contains placeholder variables like {name}, keep them unchanged`;

  // Retry only transient failures (network error, 429, 5xx); fail fast on other 4xx.
  const MAX = 3;
  let lastErr: any = null;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.choices?.[0]?.message?.content?.trim() || '';
      }
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
      }
      lastErr = new Error(`OpenAI API ${res.status}`);
    } catch (e: any) {
      lastErr = e;
    }
    if (attempt < MAX) await new Promise((r) => setTimeout(r, attempt === 1 ? 500 : 1500));
  }
  throw new Error(`OpenAI translate failed after ${MAX} attempts: ${lastErr?.message || lastErr}`);
}

async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string,
  contentType: string,
  _gatewayKey: string,
  supabase: any
): Promise<string> {
  if (!text || text.trim().length === 0) return text;
  if (sourceLang === targetLang) return text;

  const cached = await cacheLookup(supabase, text, sourceLang, targetLang);
  if (cached) return cached; // pure DB read — the common case, no external call

  const translated = await openAITranslate(text, sourceLang, targetLang, contentType);
  if (translated) await cacheSave(supabase, text, translated, sourceLang, targetLang, contentType);
  return translated || text;
}

// Translate one content field, preserving its shape so the reader renders it:
//   • string             -> translated string
//   • array of strings   -> translated array (jsonb / text[] columns, e.g.
//                           reflection_questions, action_steps)
//   • JSON-string array  -> translated JSON-string array (text column holding '["..."]')
// Non-string array elements (objects, numbers) are left untouched so we never
// mangle scripture references, ids, etc.
async function translateField(
  value: any, sourceLang: string, targetLang: string, contentType: string, gatewayKey: string, supabase: any
): Promise<any> {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        const arr = JSON.parse(trimmed);
        if (Array.isArray(arr)) {
          return JSON.stringify(
            await translateStringArray(arr, sourceLang, targetLang, contentType, gatewayKey, supabase)
          );
        }
      } catch { /* not JSON — treat as a normal string */ }
    }
    return await translateText(value, sourceLang, targetLang, contentType, gatewayKey, supabase);
  }
  if (Array.isArray(value)) {
    return await translateStringArray(value, sourceLang, targetLang, contentType, gatewayKey, supabase);
  }
  return value; // objects / numbers / booleans left as-is
}

async function translateStringArray(
  arr: any[], sourceLang: string, targetLang: string, contentType: string, gatewayKey: string, supabase: any
): Promise<any[]> {
  const out: any[] = [];
  for (const el of arr) {
    if (typeof el === 'string' && el.trim().length > 0) {
      out.push(await translateText(el, sourceLang, targetLang, contentType, gatewayKey, supabase));
    } else {
      out.push(el);
    }
  }
  return out;
}

// Fields that are arrays of OBJECTS (not strings), mapping the object keys whose
// values should be translated. Only listed keys are touched; everything else on
// each element (ids, durations, and scripture fields — those localize at read
// time from a published Bible version) is preserved verbatim.
const OBJECT_ARRAY_TRANSLATABLE: Record<string, string[]> = {
  prayer_points: ['title', 'content', 'reflection'],
};

// Translate an array of objects in place, preserving element shape/order and
// only translating the whitelisted string keys.
async function translateObjectArray(
  arr: any[], keys: string[], sourceLang: string, targetLang: string, contentType: string, gatewayKey: string, supabase: any
): Promise<any[]> {
  const out: any[] = [];
  for (const el of arr) {
    if (el && typeof el === 'object' && !Array.isArray(el)) {
      const copy: Record<string, any> = { ...el };
      for (const k of keys) {
        if (typeof copy[k] === 'string' && copy[k].trim().length > 0) {
          copy[k] = await translateText(copy[k], sourceLang, targetLang, contentType, gatewayKey, supabase);
        }
      }
      out.push(copy);
    } else {
      out.push(el);
    }
  }
  return out;
}

async function processQueueItem(item: any, supabase: any, gatewayKey: string): Promise<void> {
  const { id, content_type, content_id, content_table, source_language, target_language, fields_to_translate } = item;

  // Mark as processing
  await supabase
    .from('translation_queue')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', id);

  try {
    // Fetch the content
    const { data: content, error: fetchError } = await supabase
      .from(content_table)
      .select('*')
      .eq('id', content_id)
      .single();

    if (fetchError || !content) {
      throw new Error(`Content not found: ${fetchError?.message || 'Unknown error'}`);
    }

    // Translate each field. Strings and arrays of strings (e.g.
    // reflection_questions, action_steps) are both handled; the shape is
    // preserved so the reader renders translated lists correctly.
    const translations: Record<string, any> = {};
    for (const field of fields_to_translate) {
      const value = content[field];
      if (value == null) continue;
      if (OBJECT_ARRAY_TRANSLATABLE[field] && Array.isArray(value)) {
        // Array-of-objects (e.g. prayer_points): translate whitelisted keys only.
        translations[field] = await translateObjectArray(
          value, OBJECT_ARRAY_TRANSLATABLE[field],
          source_language, target_language, content_type, gatewayKey, supabase
        );
      } else if (typeof value === 'string' || Array.isArray(value)) {
        translations[field] = await translateField(
          value,
          source_language,
          target_language,
          content_type,
          gatewayKey,
          supabase
        );
      }
    }

    // Store translations in the content's translations field or a separate table
    const existingTranslations = content.translations || {};
    existingTranslations[target_language] = {
      ...translations,
      translated_at: new Date().toISOString()
    };

    // Update the content with translations
    await supabase
      .from(content_table)
      .update({ translations: existingTranslations })
      .eq('id', content_id);

    // Mark queue item as completed
    await supabase
      .from('translation_queue')
      .update({ 
        status: 'completed', 
        completed_at: new Date().toISOString() 
      })
      .eq('id', id);

    // Update content translation status
    await updateContentTranslationStatus(supabase, content_type, content_id, content_table, target_language, 'completed');

  } catch (error: any) {
    const retryCount = (item.retry_count || 0) + 1;
    const maxRetries = item.max_retries || 3;

    if (retryCount >= maxRetries) {
      await supabase
        .from('translation_queue')
        .update({ 
          status: 'failed', 
          error_message: error.message,
          retry_count: retryCount
        })
        .eq('id', id);

      await updateContentTranslationStatus(supabase, content_type, content_id, content_table, target_language, 'failed');
    } else {
      await supabase
        .from('translation_queue')
        .update({ 
          status: 'pending', 
          error_message: error.message,
          retry_count: retryCount
        })
        .eq('id', id);
    }

    throw error;
  }
}

async function updateContentTranslationStatus(
  supabase: any,
  contentType: string,
  contentId: string,
  contentTable: string,
  targetLanguage: string,
  status: 'completed' | 'failed'
): Promise<void> {
  const { data: existing } = await supabase
    .from('content_translation_status')
    .select('*')
    .eq('content_type', contentType)
    .eq('content_id', contentId)
    .single();

  if (existing) {
    const pendingLanguages = (existing.pending_languages || []).filter((l: string) => l !== targetLanguage);
    const completedLanguages = status === 'completed' 
      ? [...(existing.completed_language_codes || []), targetLanguage]
      : existing.completed_language_codes || [];
    const failedLanguages = status === 'failed'
      ? [...(existing.failed_languages || []), targetLanguage]
      : existing.failed_languages || [];

    await supabase
      .from('content_translation_status')
      .update({
        pending_languages: pendingLanguages,
        completed_language_codes: [...new Set(completedLanguages)],
        failed_languages: [...new Set(failedLanguages)],
        completed_languages: completedLanguages.length,
        last_translation_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id);
  }
}

// Reaper: rescue queue items abandoned mid-flight. processQueueItem marks a row
// 'processing' (and sets started_at) before it begins; if the worker is killed
// between that and the terminal update — function timeout, crash, or a deploy
// mid-run — the row is stuck 'processing' forever. process_queue only ever picks
// up 'pending' rows, so a stuck item never re-runs and, once pending drains to 0,
// silently stalls the whole queue (this is what a lingering "N processing" with
// "0 pending" looks like on the dashboard).
//
// This resets any row that's been 'processing' longer than `staleMinutes` back to
// 'pending' so it re-runs, bumping retry_count and giving up to 'failed' once
// max_retries is exceeded so a genuinely poisonous item can't loop forever. The
// 10-minute default is well beyond a normal edge-function run, so a legitimately
// in-flight item is never reclaimed out from under an active worker.
async function reclaimStuckProcessing(
  supabase: any,
  staleMinutes: number = 10
): Promise<{ requeued: number; failed: number }> {
  const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();

  const { data: stuck } = await supabase
    .from('translation_queue')
    .select('id, retry_count, max_retries, content_type, content_id, content_table, target_language')
    .eq('status', 'processing')
    .lt('started_at', cutoff);

  if (!stuck || stuck.length === 0) return { requeued: 0, failed: 0 };

  let requeued = 0, failed = 0;
  for (const item of stuck) {
    const retryCount = (item.retry_count || 0) + 1;
    const maxRetries = item.max_retries || 3;

    if (retryCount >= maxRetries) {
      await supabase.from('translation_queue').update({
        status: 'failed',
        error_message: 'Reclaimed: stuck in processing (worker timed out/crashed), retries exhausted',
        retry_count: retryCount
      }).eq('id', item.id);
      await updateContentTranslationStatus(
        supabase, item.content_type, item.content_id, item.content_table, item.target_language, 'failed'
      );
      failed++;
    } else {
      await supabase.from('translation_queue').update({
        status: 'pending',
        error_message: 'Reclaimed: was stuck in processing, requeued',
        retry_count: retryCount,
        started_at: null
      }).eq('id', item.id);
      requeued++;
    }
  }
  return { requeued, failed };
}

async function queueContentForTranslation(
  supabase: any,
  contentType: string,
  contentId: string,
  contentTable: string,
  targetLanguages: string[],
  sourceLanguage: string = 'en',
  priority: number = 5,
  createdBy?: string,
  ministryId?: string,
  isAutoTriggered: boolean = false
): Promise<{ queued: string[]; skipped: string[] }> {
  const fields = CONTENT_FIELD_MAP[contentType] || ['title', 'content'];

  // Languages already completed for this content item.
  const { data: statusRow } = await supabase
    .from('content_translation_status')
    .select('completed_language_codes')
    .eq('content_type', contentType)
    .eq('content_id', contentId)
    .single();
  const done = new Set<string>(statusRow?.completed_language_codes || []);

  // Languages already pending/processing (in-flight) — avoids duplicate queue rows.
  const { data: inflightRows } = await supabase
    .from('translation_queue')
    .select('target_language')
    .eq('content_type', contentType)
    .eq('content_id', contentId)
    .in('status', ['pending', 'processing']);
  const inflight = new Set<string>((inflightRows || []).map((r: any) => r.target_language));

  // Only queue languages that aren't the source, not already done, not in flight.
  // Mirrors queueAllContent so re-queuing an already-translated item is a no-op
  // instead of inserting duplicates and resetting the status to 0%.
  const missing = targetLanguages.filter(
    (l: string) => l !== sourceLanguage && !done.has(l) && !inflight.has(l)
  );
  const skipped = targetLanguages.filter((l: string) => !missing.includes(l));

  if (missing.length === 0) {
    return { queued: [], skipped };
  }

  // Insert one row per missing language, tolerating a rare race where a
  // concurrent request (double-click / overlapping cron) already inserted the
  // same in-flight (content, language) pair. The partial unique index
  // (translation_queue_inflight_uniq) rejects that duplicate with code 23505;
  // we treat it as "already queued" and fold it into `skipped` rather than
  // failing the whole call. Requires ensure-translation-queue-unique.sql to be
  // applied; without the index the insert just succeeds as before.
  const queued: string[] = [];
  const raced: string[] = [];
  for (const lang of missing) {
    const { error: insErr } = await supabase.from('translation_queue').insert({
      content_type: contentType,
      content_id: String(contentId),
      content_table: contentTable,
      source_language: sourceLanguage,
      target_language: lang,
      fields_to_translate: fields,
      priority,
      created_by: createdBy,
      ministry_id: ministryId,
      is_auto_triggered: isAutoTriggered,
      status: 'pending'
    });
    if (insErr) {
      if (insErr.code === '23505') { raced.push(lang); continue; }
      throw new Error(`translation_queue insert failed: ${insErr.message}`);
    }
    queued.push(lang);
  }

  const allSkipped = [...skipped, ...raced];
  if (queued.length === 0) {
    return { queued: [], skipped: allSkipped };
  }

  // Merge into status WITHOUT clobbering already-completed languages.
  await supabase.from('content_translation_status').upsert({
    content_type: contentType,
    content_id: String(contentId),
    content_table: contentTable,
    total_languages: done.size + inflight.size + raced.length + queued.length,
    completed_languages: done.size,
    pending_languages: Array.from(new Set([...inflight, ...raced, ...queued])),
    completed_language_codes: Array.from(done),
    failed_languages: []
  }, { onConflict: 'content_type,content_id' });

  return { queued, skipped: allSkipped };
}

async function processPopularContent(supabase: any, gatewayKey: string): Promise<number> {
  // Find popular content that needs translation
  const { data: popularContent } = await supabase
    .from('content_popularity')
    .select('content_type, content_id, language_code, view_count')
    .gte('view_count', 10) // Threshold for "popular"
    .order('view_count', { ascending: false })
    .limit(20);

  if (!popularContent || popularContent.length === 0) return 0;

  let queued = 0;

  for (const item of popularContent) {
    // Check if translation already exists or is queued
    const { data: existing } = await supabase
      .from('translation_queue')
      .select('id')
      .eq('content_type', item.content_type)
      .eq('content_id', item.content_id)
      .eq('target_language', item.language_code)
      .single();

    if (!existing) {
      // Get content table name
      const tableMap: Record<string, string> = {
        'devotional': 'devotionals',
        'prayer': 'prayer_points',
        'announcement': 'ministry_announcements',
        'teaching': 'book_summaries'
      };

      const contentTable = tableMap[item.content_type];
      if (contentTable) {
        await queueContentForTranslation(
          supabase,
          item.content_type,
          item.content_id,
          contentTable,
          [item.language_code],
          'en',
          Math.min(10, Math.floor(item.view_count / 10)), // Higher priority for more popular content
          undefined,
          undefined,
          true
        );
        queued++;
      }
    }
  }

  return queued;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // Phase 3: translation now delegates to the translate-content function
    // (OpenAI), so the FastRouter gateway key is no longer required. Kept as an
    // optional passthrough for backward compatibility with existing call sites.
    const gatewayKey = Deno.env.get('GATEWAY_API_KEY') || '';

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { action, ...params } = body;

    switch (action) {
      case 'process_queue': {
        // Process pending items from the queue
        const limit = params.limit || 10;

        // First rescue any items stuck 'processing' from a killed prior run, so
        // they rejoin 'pending' below instead of silently stalling the queue.
        const staleMinutes = params.staleMinutes || 10;
        const reclaimed = await reclaimStuckProcessing(supabase, staleMinutes);

        const { data: items } = await supabase
          .from('translation_queue')
          .select('*')
          .eq('status', 'pending')
          .order('priority', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(limit);

        if (!items || items.length === 0) {
          return new Response(JSON.stringify({ processed: 0, failed: 0, total: 0, reclaimed, message: 'No pending items' }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        let processed = 0;
        let failed = 0;

        for (const item of items) {
          try {
            await processQueueItem(item, supabase, gatewayKey);
            processed++;
          } catch (error) {
            console.error(`Failed to process item ${item.id}:`, error);
            failed++;
          }
        }

        return new Response(JSON.stringify({ processed, failed, total: items.length, reclaimed }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      case 'queue_content': {
        // Queue specific content for translation
        const { contentType, contentId, contentTable, targetLanguages, sourceLanguage, priority, createdBy, ministryId, isAutoTriggered } = params;
        
        if (!contentType || !contentId || !contentTable) {
          throw new Error('Missing required parameters: contentType, contentId, contentTable');
        }

        const languages = targetLanguages || ASIAN_LANGUAGES;

        const queueResult = await queueContentForTranslation(
          supabase,
          contentType,
          contentId,
          contentTable,
          languages,
          sourceLanguage || 'en',
          priority || 5,
          createdBy,
          ministryId,
          isAutoTriggered || false
        );

        return new Response(JSON.stringify({
          success: true,
          queued: queueResult.queued.length,
          skipped: queueResult.skipped.length,
          languages: queueResult.queued
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      case 'queue_asian_languages': {
        // Queue content for all Asian languages
        const { contentType, contentId, contentTable, sourceLanguage, priority, createdBy, ministryId } = params;
        
        if (!contentType || !contentId || !contentTable) {
          throw new Error('Missing required parameters');
        }

        const asianResult = await queueContentForTranslation(
          supabase,
          contentType,
          contentId,
          contentTable,
          ASIAN_LANGUAGES,
          sourceLanguage || 'en',
          priority || 5,
          createdBy,
          ministryId,
          true
        );

        return new Response(JSON.stringify({
          success: true,
          queued: asianResult.queued.length,
          skipped: asianResult.skipped.length,
          languages: asianResult.queued
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      case 'queue_all': {
        // Bulk-enqueue whole content types for the target languages. Pass
        // force:true to also re-queue already-completed pairs (backfill).
        const { contentTypes, targetLanguages, sourceLanguage, priority, createdBy, force } = params;
        if (!Array.isArray(contentTypes) || contentTypes.length === 0) {
          throw new Error('contentTypes[] is required');
        }
        const langs = (Array.isArray(targetLanguages) && targetLanguages.length)
          ? targetLanguages : ASIAN_LANGUAGES;

        const result = await queueAllContent(
          supabase, contentTypes, langs, sourceLanguage || 'en', priority || 4, createdBy, !!force
        );

        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      case 'auto_enqueue': {
        // Cron entrypoint: translate any NEW/untranslated content into every
        // PUBLISHED language. queueAllContent skips whatever is already done or
        // in flight, so each hourly run only picks up genuinely new content.
        // Defaults: content types = DEFAULT_AUTO_CONTENT_TYPES, languages =
        // published app_languages. Override either by passing them in the body.
        const autoTypes = Array.isArray(params.contentTypes) && params.contentTypes.length
          ? params.contentTypes : DEFAULT_AUTO_CONTENT_TYPES;
        const autoLangs = Array.isArray(params.targetLanguages) && params.targetLanguages.length
          ? params.targetLanguages : await getPublishedLanguages(supabase);

        if (!autoLangs || autoLangs.length === 0) {
          return new Response(JSON.stringify({
            success: true, skipped: true,
            message: 'No published non-English languages — publish one in Admin → Languages, or pass targetLanguages.'
          }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        const result = await queueAllContent(
          supabase, autoTypes, autoLangs, 'en', params.priority || 3, undefined
        );
        return new Response(JSON.stringify({ ...result, languages: autoLangs }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      case 'get_status': {
        // Get translation status for specific content
        const { contentType, contentId } = params;
        
        const { data: status } = await supabase
          .from('content_translation_status')
          .select('*')
          .eq('content_type', contentType)
          .eq('content_id', contentId)
          .single();

        const { data: queueItems } = await supabase
          .from('translation_queue')
          .select('target_language, status, error_message, created_at, completed_at')
          .eq('content_type', contentType)
          .eq('content_id', contentId);

        return new Response(JSON.stringify({ status, queueItems }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      case 'process_popular': {
        // Process popular content for demand-based translation
        const queued = await processPopularContent(supabase, gatewayKey);
        
        return new Response(JSON.stringify({ queued }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      case 'track_view': {
        // Track content view for popularity-based translation
        const { contentType, contentId, languageCode, userId } = params;
        
        const { data: existing } = await supabase
          .from('content_popularity')
          .select('*')
          .eq('content_type', contentType)
          .eq('content_id', contentId)
          .eq('language_code', languageCode)
          .single();

        if (existing) {
          await supabase
            .from('content_popularity')
            .update({
              view_count: existing.view_count + 1,
              last_viewed_at: new Date().toISOString()
            })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('content_popularity')
            .insert({
              content_type: contentType,
              content_id: contentId,
              language_code: languageCode,
              view_count: 1,
              unique_users: 1
            });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      case 'get_queue_stats': {
        // Get queue statistics
        const { data: stats } = await supabase
          .from('translation_queue')
          .select('status')
          .then(({ data }) => {
            const counts = { pending: 0, processing: 0, completed: 0, failed: 0 };
            data?.forEach(item => {
              counts[item.status as keyof typeof counts]++;
            });
            return { data: counts };
          });

        return new Response(JSON.stringify(stats), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      case 'retry_failed': {
        // Requeue every 'failed' item back to 'pending' (reset error/retry) so
        // process_queue picks them up again. Optionally scope by contentType /
        // targetLanguage. Guards against the partial unique index: if a failed
        // row already has an in-flight (pending/processing) sibling for the same
        // (content, language) — e.g. after a manual re-queue — the redundant
        // failed row is DELETED instead of flipped, and two failed rows for the
        // same pair never both flip.
        const { contentType, targetLanguage } = params;

        // Fetch failed rows (paginated).
        const failed: any[] = [];
        for (let from = 0; ; from += 1000) {
          let q = supabase.from('translation_queue')
            .select('id, content_type, content_id, target_language')
            .eq('status', 'failed');
          if (contentType) q = q.eq('content_type', contentType);
          if (targetLanguage) q = q.eq('target_language', targetLanguage);
          const { data, error } = await q.range(from, from + 999);
          if (error) throw new Error(error.message);
          if (!data || data.length === 0) break;
          failed.push(...data);
          if (data.length < 1000) break;
        }

        if (failed.length === 0) {
          return new Response(JSON.stringify({ retried: 0, removedDuplicates: 0, message: 'No failed items' }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // Build the in-flight key set to avoid creating duplicate pending rows.
        const inflight = new Set<string>();
        for (let from = 0; ; from += 1000) {
          const { data } = await supabase.from('translation_queue')
            .select('content_type, content_id, target_language')
            .in('status', ['pending', 'processing'])
            .range(from, from + 999);
          if (!data || data.length === 0) break;
          for (const r of data) inflight.add(`${r.content_type}|${r.content_id}|${r.target_language}`);
          if (data.length < 1000) break;
        }

        const toFlip: string[] = [];
        const toDelete: string[] = [];
        for (const r of failed) {
          const key = `${r.content_type}|${r.content_id}|${r.target_language}`;
          if (inflight.has(key)) {
            toDelete.push(r.id);           // an in-flight sibling already covers it
          } else {
            toFlip.push(r.id);
            inflight.add(key);             // so a second failed row for this pair is deleted, not flipped
          }
        }

        let retried = 0;
        for (let i = 0; i < toFlip.length; i += 500) {
          const chunk = toFlip.slice(i, i + 500);
          const { error } = await supabase.from('translation_queue')
            .update({ status: 'pending', error_message: null, retry_count: 0, started_at: null })
            .in('id', chunk);
          if (error) throw new Error(error.message);
          retried += chunk.length;
        }

        let removedDuplicates = 0;
        for (let i = 0; i < toDelete.length; i += 500) {
          const chunk = toDelete.slice(i, i + 500);
          const { error } = await supabase.from('translation_queue').delete().in('id', chunk);
          if (error) throw new Error(error.message);
          removedDuplicates += chunk.length;
        }

        return new Response(JSON.stringify({ retried, removedDuplicates }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error: any) {
    console.error('Translation queue error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});