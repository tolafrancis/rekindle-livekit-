// supabase/functions/generate-devotional-series/index.ts
// Admin-only: given a title and a day count, drafts the metadata for a
// devotional_series row (subtitle, description, category, difficulty,
// audience, tags, keywords) plus a short day-by-day OUTLINE — one title +
// focus per day, used to drive coherent progression when
// generate-devotional-day fills in each day's full content afterward.
//
// This function never writes full devotional teaching and never proposes
// Scripture — that happens per-day in generate-devotional-day, which itself
// only ever proposes REFERENCES (the caller resolves real wording from
// bible-api.com), matching the pattern already established by
// generate-prayer-content/index.ts.
//
// modes:
//   'outline'           - initial generation (series metadata + day outline)
//   'regenerate_series'  - identical contract to 'outline'; an explicit re-roll
//   'regenerate_field'  - regenerate just one field: description | subtitle | tags | keywords

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'advanced']
const REGEN_FIELDS = ['description', 'subtitle', 'tags', 'keywords']

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
        console.error('[generate-devotional-series] OpenAI error', res.status, errText)
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
        console.error('[generate-devotional-series] Failed to parse OpenAI JSON:', raw)
        throw new Response(JSON.stringify({ error: 'AI returned malformed content. Please try again.' }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // ---------------------------------------------------------------------
    if (mode === 'regenerate_field') {
      const { field, title, subtitle, description } = body
      if (!field || !REGEN_FIELDS.includes(field)) {
        return json({ error: `field must be one of: ${REGEN_FIELDS.join(', ')}` }, 400)
      }
      if (!title || typeof title !== 'string') return json({ error: 'title (string) is required' }, 400)

      const isList = field === 'tags' || field === 'keywords'
      const systemPrompt = `You are a mature, biblically grounded Christian devotional writer and editor. You are regenerating ONE field of an existing devotional series' metadata: "${field}".
Style: Christ-centered, clear, practical, warm and pastoral, doctrinally balanced, suitable for both new and mature believers. Never fabricate Bible verses or claim "God said" beyond what Scripture supports.
Respond with ONLY a JSON object: { "value": ${isList ? 'string[]  // 3-8 short, searchable, lowercase terms' : 'string'} }`
      const userPrompt = `Series title: "${title}"${subtitle ? `\nCurrent subtitle: "${subtitle}"` : ''}${description ? `\nCurrent description: "${description}"` : ''}\nGenerate a fresh, improved "${field}" for this devotional series.`

      const parsed = await callOpenAI(systemPrompt, userPrompt, 500)
      return json({ field, value: parsed.value })
    }

    // ---------------------------------------------------------------------
    // 'outline' and 'regenerate_series' share the same contract.
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

    const systemPrompt = `You are a mature, biblically grounded Bible teacher and devotional writer, in the tradition of clear, grace-centered, practical expository teaching — without impersonating or copying any specific named teacher's wording or style.

Your teaching is: biblically grounded, clear and easy to understand, spiritually encouraging, practical for everyday life, Christ-centered, faith-building, doctrinally balanced and responsible, warm and pastoral, and suitable for both new and mature believers.

You are designing the METADATA and DAY-BY-DAY OUTLINE for a ${days}-day devotional series (NOT the full daily content yet — that is written separately, one day at a time, from your outline). The series must read as ONE coherent journey:
- Day 1 introduces the foundation of the topic.
- The middle days progressively develop the subject, each building naturally on the previous day.
- Later days deepen understanding and application.
- The final day summarizes, encourages, and points toward practical continuation.
Do not just generate ${days} loosely related devotionals on the same topic — design a structured Bible-study journey.

${categoryHint}

Respond with ONLY a JSON object (no markdown, no commentary) matching exactly this shape:
{
  "subtitle": string,                // short, engaging, max 200 characters
  "description": string,             // compelling overview of the whole series: what the reader will learn/experience
  "category_id": string | null,
  "difficulty_level": "beginner" | "intermediate" | "advanced",
  "target_audience": string,         // one of: "New Believers", "Mature Christians", "Youth", "Young Adults", "Leaders", "Families", "General Audience"
  "tags": string[],                  // 3-8 short searchable tags
  "keywords": string[],              // 3-10 SEO/search keywords
  "days": [                          // EXACTLY ${days} entries, day_number 1..${days}, in order
    { "day_number": number, "title": string, "focus": string }  // focus: 1 sentence describing this day's specific angle on the theme, distinct from every other day
  ]
}
Never include actual Scripture verse text anywhere in this response — this step does not select Scripture at all.`

    const userPrompt = `Devotional series title: "${title}"\nDuration: ${days} day${days === 1 ? '' : 's'}${language && language !== 'en' ? `\nTarget language (write in this language): ${language}` : ''}${existing_description ? `\nCurrent description (improve or replace it): "${existing_description}"` : ''}`

    // Roughly 40-60 tokens per outline day plus headroom for the metadata fields.
    const maxTokens = Math.min(4000, 700 + days * 70)

    console.log('[generate-devotional-series] mode=', mode, 'days=', days)
    const parsed = await callOpenAI(systemPrompt, userPrompt, maxTokens)

    const outlineDays = Array.isArray(parsed.days) ? parsed.days.slice(0, days) : []
    const category_id = categoryList.some(c => c.id === parsed.category_id) ? parsed.category_id : null

    return json({
      subtitle: typeof parsed.subtitle === 'string' ? parsed.subtitle.slice(0, 200) : '',
      description: typeof parsed.description === 'string' ? parsed.description : '',
      category_id,
      difficulty_level: DIFFICULTY_LEVELS.includes(parsed.difficulty_level) ? parsed.difficulty_level : 'beginner',
      target_audience: typeof parsed.target_audience === 'string' ? parsed.target_audience : 'General Audience',
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t: unknown) => typeof t === 'string') : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.filter((k: unknown) => typeof k === 'string') : [],
      days: outlineDays.map((d: any, idx: number) => ({
        day_number: typeof d?.day_number === 'number' ? d.day_number : idx + 1,
        title: typeof d?.title === 'string' ? d.title : `Day ${idx + 1}`,
        focus: typeof d?.focus === 'string' ? d.focus : '',
      })),
    })
  } catch (err: any) {
    if (err instanceof Response) return err
    console.error('[generate-devotional-series] Unhandled error:', err?.message || err)
    return json({ error: err?.message || 'An unexpected error occurred' }, 500)
  }
})
