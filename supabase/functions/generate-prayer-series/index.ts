// supabase/functions/generate-prayer-series/index.ts
// Admin-only AI drafting for multi-day prayer series (prayer_series +
// prayer_series_days), built the same way as generate-devotional-series /
// generate-devotional-day:
//
//   'outline' - given a title and a day count, drafts the series metadata
//               (subtitle, description, category, difficulty) plus a short
//               day-by-day OUTLINE (title + focus per day), so the days read
//               as one progressive prayer journey.
//   'day'     - writes ONE day's full content (title, focus, prayer text,
//               prayer points, duration) from the outline and the previous
//               day, so a single day can be (re)generated without touching
//               the rest of the series.
//
// Like the devotional functions, the model only ever proposes a Scripture
// REFERENCE, never verse text. The caller (AdminPrayerSeriesManager) resolves
// the real wording from bible-api.com, so Scripture is never hallucinated.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'advanced']

const VOICE = `You are a mature, biblically grounded Christian prayer leader and intercessor. Your writing is: Christ-centered, reverent and warm, doctrinally balanced, rooted in Scripture, practical for everyday life, and suitable for both new and mature believers. You never fabricate Bible verses, never quote verse text from memory, and never claim "God said" beyond what Scripture supports.`

serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return json({ error: 'Unauthorized: please sign in again.' }, 401)

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return json({ error: 'Admin access required.' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const mode = typeof body.mode === 'string' ? body.mode : 'outline'

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) return json({ error: 'OPENAI_API_KEY is not set in Supabase secrets.' }, 500)

    const callOpenAI = async (systemPrompt: string, userPrompt: string, maxTokens: number) => {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiApiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: maxTokens,
          temperature: 0.7,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        console.error('[generate-prayer-series] OpenAI error', res.status, errText)
        throw new Response(JSON.stringify({ error: `OpenAI API error ${res.status}: ${errText}` }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const data = await res.json()
      const raw = data.choices?.[0]?.message?.content?.trim() || ''
      if (!raw) throw new Response(JSON.stringify({ error: 'OpenAI returned an empty response.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
      try {
        return JSON.parse(raw)
      } catch {
        console.error('[generate-prayer-series] Failed to parse OpenAI JSON:', raw)
        throw new Response(JSON.stringify({ error: 'AI returned malformed content. Please try again.' }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const languageLine = (language: unknown) =>
      typeof language === 'string' && language && language !== 'en'
        ? `\nTarget language (write in this language): ${language}`
        : ''

    // ---------------------------------------------------------------------
    if (mode === 'day') {
      const {
        series_title, series_description, day_number, total_days,
        day_outline, previous_day_title, previous_day_focus, difficulty_level, language,
      } = body
      if (!series_title || typeof series_title !== 'string') return json({ error: 'series_title (string) is required' }, 400)
      const dayNum = typeof day_number === 'number' ? day_number : 1
      const total = typeof total_days === 'number' ? total_days : dayNum

      const systemPrompt = `${VOICE}

You are writing Day ${dayNum} of ${total} of a guided prayer series. The series is ONE progressive journey: each day builds on the previous one${dayNum === 1 ? ' (this is the first day, so lay the foundation)' : ''}${dayNum === total ? ' (this is the final day, so bring the journey together and send the reader out with faith and a way to keep praying)' : ''}.

Respond with ONLY a JSON object (no markdown, no commentary) matching exactly this shape:
{
  "title": string,                 // e.g. "Prayer for Renewed Strength", distinct from other days
  "prayer_focus": string,          // short theme, 2-6 words
  "scripture_reference": string,   // ONE reference only, e.g. "Isaiah 40:31". Never quote the verse text.
  "prayer_text": string,           // the main guided prayer, first person ("Lord, I..."), 180-320 words, 2-4 paragraphs separated by blank lines
  "prayer_points": [               // 3-5 focused points the reader prays through
    { "title": string, "content": string, "duration": number }   // content: 1-3 sentences to pray; duration in seconds (30-180)
  ],
  "duration_minutes": number       // realistic total time for this day, 5-20
}`

      const userPrompt = `Series: "${series_title}"${series_description ? `\nSeries description: "${series_description}"` : ''}${difficulty_level ? `\nLevel: ${difficulty_level}` : ''}
Day ${dayNum} of ${total}${day_outline?.title ? `\nPlanned title: "${day_outline.title}"` : ''}${day_outline?.focus ? `\nPlanned focus: ${day_outline.focus}` : ''}${previous_day_title ? `\nPrevious day: "${previous_day_title}"${previous_day_focus ? ` (${previous_day_focus})` : ''}` : ''}${languageLine(language)}`

      console.log('[generate-prayer-series] mode=day day=', dayNum, '/', total)
      const parsed = await callOpenAI(systemPrompt, userPrompt, 1400)

      const points = Array.isArray(parsed.prayer_points) ? parsed.prayer_points : []
      const minutes = Number(parsed.duration_minutes)
      return json({
        title: typeof parsed.title === 'string' ? parsed.title : `Day ${dayNum} Prayer`,
        prayer_focus: typeof parsed.prayer_focus === 'string' ? parsed.prayer_focus : '',
        scripture_reference: typeof parsed.scripture_reference === 'string' ? parsed.scripture_reference : '',
        prayer_text: typeof parsed.prayer_text === 'string' ? parsed.prayer_text : '',
        prayer_points: points
          .filter((p: any) => p && typeof p.content === 'string')
          .slice(0, 6)
          .map((p: any) => ({
            title: typeof p.title === 'string' ? p.title : '',
            content: p.content,
            duration: Math.max(15, Math.min(600, Math.round(Number(p.duration) || 60))),
          })),
        duration_minutes: Number.isFinite(minutes) ? Math.max(3, Math.min(60, Math.round(minutes))) : 10,
      })
    }

    // ---------------------------------------------------------------------
    // 'outline'
    const { title, total_days, categories, language, existing_description } = body
    if (!title || typeof title !== 'string') return json({ error: 'title (string) is required' }, 400)

    const days = typeof total_days === 'number' && Number.isFinite(total_days)
      ? Math.max(1, Math.min(60, Math.round(total_days)))
      : 7

    const categoryList: { id: string; name: string }[] = Array.isArray(categories)
      ? categories.filter((c: any) => c && typeof c.id === 'string' && typeof c.name === 'string')
      : []
    const categoryHint = categoryList.length
      ? `Choose the single best-fitting category_id from this list (use the id exactly, or null if none fit well):\n${categoryList.map(c => `- ${c.id}: ${c.name}`).join('\n')}`
      : 'No categories were provided — return category_id as null.'

    const systemPrompt = `${VOICE}

You are designing the METADATA and DAY-BY-DAY OUTLINE for a ${days}-day guided prayer series (NOT the full daily prayers yet — those are written separately, one day at a time, from your outline). The series must read as ONE coherent prayer journey:
- Day 1 lays the foundation (e.g. coming before God, surrender, thanksgiving).
- The middle days progressively go deeper, each building naturally on the previous day.
- The final day brings it together and points toward a continuing life of prayer.
Do not just produce ${days} loosely related prayers on the same topic.

${categoryHint}

Respond with ONLY a JSON object (no markdown, no commentary) matching exactly this shape:
{
  "subtitle": string,              // short, engaging, max 200 characters
  "description": string,           // 2-4 sentences: what the person will pray through and experience
  "category_id": string | null,
  "difficulty_level": "beginner" | "intermediate" | "advanced",
  "days": [                        // EXACTLY ${days} entries, day_number 1..${days}, in order
    { "day_number": number, "title": string, "focus": string }  // focus: 1 sentence on this day's specific prayer angle, distinct from every other day
  ]
}
Never include Scripture verse text anywhere in this response.`

    const userPrompt = `Prayer series title: "${title}"\nDuration: ${days} day${days === 1 ? '' : 's'}${languageLine(language)}${existing_description ? `\nCurrent description (improve or replace it): "${existing_description}"` : ''}`

    const maxTokens = Math.min(4000, 600 + days * 70)

    console.log('[generate-prayer-series] mode=outline days=', days)
    const parsed = await callOpenAI(systemPrompt, userPrompt, maxTokens)

    const outlineDays = Array.isArray(parsed.days) ? parsed.days.slice(0, days) : []
    const category_id = categoryList.some(c => c.id === parsed.category_id) ? parsed.category_id : null

    return json({
      subtitle: typeof parsed.subtitle === 'string' ? parsed.subtitle.slice(0, 200) : '',
      description: typeof parsed.description === 'string' ? parsed.description : '',
      category_id,
      difficulty_level: DIFFICULTY_LEVELS.includes(parsed.difficulty_level) ? parsed.difficulty_level : 'beginner',
      days: outlineDays.map((d: any, idx: number) => ({
        day_number: typeof d?.day_number === 'number' ? d.day_number : idx + 1,
        title: typeof d?.title === 'string' ? d.title : `Day ${idx + 1}`,
        focus: typeof d?.focus === 'string' ? d.focus : '',
      })),
    })
  } catch (err: any) {
    if (err instanceof Response) return err
    console.error('[generate-prayer-series] Unhandled error:', err?.message || err)
    return json({ error: err?.message || 'An unexpected error occurred' }, 500)
  }
})
