// supabase/functions/prewarm-devotional-audio/index.ts
//
// Prepares read-aloud audio for the daily devotionals ahead of time, so the
// first person to tap Read aloud each day doesn't wait for generation.
//
// Covers what DailyDevotionalWidget opens as "today's devotional": published
// platform devotionals (devotionals.schedule_date) and ministry devotionals
// (ministry_devotionals.scheduled_date) dated today or tomorrow in UTC. The
// reader resolves "today" in the listener's local time, so tomorrow's UTC
// date covers time zones that are already there.
//
// For each devotional, language and slide it builds the exact narration the
// reader builds (_shared/devotionalNarration.ts), checks tts_audio_cache under
// the same content_id the player looks up, and asks generate-tts-audio for
// any that are missing. Generation runs inside a time budget; whatever is
// left is picked up by the next scheduled run (cache hits are cheap).
//
// Languages come from platform_settings.daily_audio_prewarm
// ({ enabled, languages }), set in Platform Admin > Bulk TTS > Daily audio.
// English only until an admin turns more on.
//
// Callers: pg_cron via private.call_edge_fn (x-cron-secret), or a platform
// admin's "Run now" (their JWT). Deployed with verify_jwt = false because
// the cron path authenticates with the shared secret.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  buildDevotionalNarrationSlides,
  devotionalAudioContentId,
  devotionalSlideNarration,
  NARRATION_STRING_DEFAULTS,
  type NarrationDevotional,
} from '../_shared/devotionalNarration.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const SETTINGS_KEY = 'daily_audio_prewarm'
const LAST_RUN_KEY = 'daily_audio_prewarm_last_run'
// Must match the contentType DevotionalModule gives HighQualityAudioPlayer.
const CONTENT_TYPE = 'daily_devotional'
// Stop starting new generations after this long, leaving room to respond
// before the edge runtime's wall-clock limit.
const TIME_BUDGET_MS = 110_000
const CONCURRENCY = 3

// Same field lists DailyDevotionalWidget passes to getLocalizedContent.
const PLATFORM_LOCALIZED_FIELDS = [
  'title', 'scripture', 'scripture_reference', 'scripture_text', 'message',
  'content', 'prayer', 'prayer_focus', 'reflection_questions',
  'bible_passage_reference', 'bible_passage_text',
]
const MINISTRY_LOCALIZED_FIELDS = [
  'title', 'scripture_reference', 'scripture_text', 'content', 'prayer',
  'reflection_questions', 'bible_passage_reference', 'bible_passage_text',
]

type Row = Record<string, any>

interface PrewarmSettings {
  enabled: boolean
  languages: string[]
}

function parseSetting(raw: unknown): PrewarmSettings {
  let v: any = raw
  if (typeof v === 'string') {
    try { v = JSON.parse(v) } catch { v = null }
  }
  const languages = Array.isArray(v?.languages) ? v.languages.filter((l: unknown) => typeof l === 'string' && l) : ['en']
  return { enabled: v?.enabled !== false, languages: languages.length ? languages : ['en'] }
}

function parseJsonField<T>(field: unknown, fallback: T): T {
  if (!field) return fallback
  if (typeof field !== 'string') return field as T
  try { return JSON.parse(field) as T } catch { return fallback }
}

// LanguageContext.getLocalizedContent
function localize(row: Row, language: string, fields: string[]): Row {
  const translation = row.translations?.[language]
  if (!translation) return row
  const out = { ...row }
  for (const f of fields) if (translation[f]) out[f] = translation[f]
  return out
}

// DailyDevotionalWidget.formatForModule, then DevotionalModule's normalizedDevotional.
function platformNarrationSource(d: Row): NarrationDevotional {
  const questions = parseJsonField<string[]>(d.reflection_questions, [])
  return {
    title: d.title,
    author: d.author || d.author_name || '',
    scripture: d.scripture || d.scripture_reference || '',
    scriptureText: d.scripture_text || '',
    biblePassageReference: d.bible_passage_reference || '',
    biblePassageText: d.bible_passage_text || '',
    scriptureReferences: parseJsonField(d.scripture_references, []) || [],
    message: d.message || d.content || '',
    prayer: d.prayer || d.prayer_focus || '',
    reflectionQuestions: Array.isArray(questions) ? questions : [],
  }
}

// DailyDevotionalWidget.formatMinistryForModule, then normalizedDevotional.
function ministryNarrationSource(d: Row): NarrationDevotional {
  const questions = parseJsonField<unknown>(d.reflection_questions, [])
  return {
    title: d.title,
    author: d.author_name || d.author || '',
    scripture: d.scripture_reference || '',
    scriptureText: d.scripture_text || '',
    biblePassageReference: d.bible_passage_reference || '',
    biblePassageText: d.bible_passage_text || '',
    scriptureReferences: [],
    message: d.content || '',
    prayer: d.prayer || '',
    reflectionQuestions: Array.isArray(questions) ? questions : [],
  }
}

// The reader's t('devotionals', key, fallback) for one language: curated
// ui_translations rows over the English defaults (TranslationLoader).
async function loadStrings(supabase: SupabaseClient, language: string) {
  const map: Record<string, string> = {}
  if (language !== 'en') {
    const { data } = await supabase
      .from('ui_translations')
      .select('key, value')
      .eq('language_code', language)
      .eq('namespace', 'devotionals')
      .in('key', Object.keys(NARRATION_STRING_DEFAULTS))
    for (const r of data ?? []) if (typeof r.value === 'string' && r.value.length > 0) map[r.key] = r.value
  }
  return (key: string, fallback: string) => map[key] || fallback
}

interface Job { contentId: string; language: string; text: string }

serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  // Cron (shared secret) or a platform admin.
  const cronSecret = req.headers.get('x-cron-secret')
  const fromCron = !!cronSecret && cronSecret === Deno.env.get('CRON_SHARED_SECRET')
  if (!fromCron) {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const { data: profile } = await supabase.from('user_profiles').select('role').eq('user_id', user.id).maybeSingle()
    if (!profile || !['admin', 'super_admin'].includes(profile.role)) return json({ error: 'Admin access required.' }, 403)
  }

  try {
    const started = Date.now()
    const { data: settingRow } = await supabase.from('platform_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle()
    const settings = parseSetting(settingRow?.value)
    // "Run now" works even while the daily schedule is switched off.
    if (fromCron && !settings.enabled) return json({ skipped: 'disabled' })

    // schedule_date / scheduled_date are DATE columns.
    const today = new Date().toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

    const [{ data: platform, error: pErr }, { data: ministry, error: mErr }] = await Promise.all([
      supabase.from('devotionals').select('*').eq('is_published', true)
        .gte('schedule_date', today).lte('schedule_date', tomorrow).limit(50),
      supabase.from('ministry_devotionals').select('*').eq('is_published', true)
        .gte('scheduled_date', today).lte('scheduled_date', tomorrow).limit(200),
    ])
    if (pErr) throw pErr
    if (mErr) throw mErr

    const jobs: Job[] = []
    for (const language of settings.languages) {
      const tr = await loadStrings(supabase, language)
      const sources: Array<{ id: string; src: NarrationDevotional }> = [
        ...(platform ?? []).map((d) => ({ id: d.id, src: platformNarrationSource(localize(d, language, PLATFORM_LOCALIZED_FIELDS)) })),
        ...(ministry ?? []).map((d) => ({ id: d.id, src: ministryNarrationSource(localize(d, language, MINISTRY_LOCALIZED_FIELDS)) })),
      ]
      for (const { id, src } of sources) {
        buildDevotionalNarrationSlides(src, tr).forEach((slide, idx) => {
          const text = devotionalSlideNarration(slide)
          if (text.trim()) jobs.push({ contentId: devotionalAudioContentId(id, idx, text), language, text })
        })
      }
    }

    // Drop what's already cached (per language, in chunks to keep URLs short).
    const cached = new Set<string>()
    for (const language of settings.languages) {
      const ids = jobs.filter((j) => j.language === language).map((j) => j.contentId)
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabase.from('tts_audio_cache').select('content_id')
          .eq('content_type', CONTENT_TYPE).eq('language', language).in('content_id', ids.slice(i, i + 100))
        for (const r of data ?? []) cached.add(`${language}|${r.content_id}`)
      }
    }
    const todo = jobs.filter((j) => !cached.has(`${j.language}|${j.contentId}`))

    let generated = 0
    let failed = 0
    let next = 0
    const worker = async () => {
      while (next < todo.length && Date.now() - started < TIME_BUDGET_MS) {
        const job = todo[next++]
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/generate-tts-audio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ text: job.text, language: job.language, contentId: job.contentId, contentType: CONTENT_TYPE }),
          })
          const body = await res.json().catch(() => null)
          if (res.ok && body?.audioUrl) generated++
          else { failed++; console.warn('[prewarm] generation failed', job.contentId, job.language, res.status, body?.error) }
        } catch (err) {
          failed++
          console.warn('[prewarm] generation error', job.contentId, job.language, err)
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))

    const summary = {
      at: new Date().toISOString(),
      trigger: fromCron ? 'schedule' : 'admin',
      languages: settings.languages,
      devotionals: (platform?.length ?? 0) + (ministry?.length ?? 0),
      slides: jobs.length,
      alreadyReady: jobs.length - todo.length,
      generated,
      failed,
      remaining: todo.length - generated - failed,
    }
    await supabase.from('platform_settings').upsert(
      { key: LAST_RUN_KEY, value: JSON.stringify(summary), updated_at: summary.at },
      { onConflict: 'key' },
    )
    console.log('[prewarm] done', summary)
    return json(summary)
  } catch (err) {
    console.error('[prewarm] failed', err)
    return json({ error: (err as Error)?.message ?? String(err) }, 500)
  }
})
