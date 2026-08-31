// supabase/functions/generate-devotional-day/index.ts
// Admin-only: generates (or rewrites) ONE day's full devotional content for a
// devotional_entries row within a devotional_series. Always scoped to a
// single day — never regenerates the rest of the series.
//
// Like generate-prayer-content and generate-devotional-series, this model
// only ever proposes Scripture REFERENCES, never verse text. The caller
// (AdminDevotionalLibraryManager) resolves real wording from bible-api.com
// via the existing fetchScripture() helper — scripture text is never
// hallucinated here.
//
// modes:
//   'generate' - write a brand-new day from the series outline + prior-day
//                 context, so the series reads as one coherent journey.
//   'rewrite'  - take an existing day's content and transform it per a
//                 specific instruction (improve / shorter / more practical /
//                 more Bible-study focused). Never touches scripture_references.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REWRITE_INSTRUCTIONS: Record<string, string> = {
  improve: 'Improve the clarity, flow, and pastoral warmth of the writing. Keep the core teaching, Scripture application, and overall length essentially the same — this is a polish pass, not a rewrite of substance.',
  shorter: 'Condense this devotional to be noticeably shorter and tighter (aim for roughly half the length) while keeping the core teaching, Scripture application, and warmth intact.',
  more_practical: 'Rewrite with a stronger emphasis on concrete, practical, everyday application — more real-life examples, more specific and actionable steps, less abstract theology.',
  more_bible_study: 'Rewrite with a stronger Bible-study focus — engage more directly with the scriptural text itself (context, what the original audience would have understood, cross-references named but not quoted), and less general life-application framing.',
}

const dayContentSchema = `{
  "title": string,                     // clear, engaging, progresses naturally from the previous day
  "subtitle": string,                  // optional short subtitle, "" if not needed
  "scripture_references": [            // 1-3 entries. REFERENCES ONLY, never quote verse text.
    { "reference": string, "is_primary": boolean }  // exactly one entry must have is_primary: true
  ],
  "introduction": string,              // 1-2 sentences introducing today's topic
  "main_content": string,              // the core teaching: explain the Scripture in context, teach it clearly, connect it to everyday Christian living. Several paragraphs.
  "reflection_questions": string[],    // 1-3 thoughtful questions
  "guided_prayer": string,             // a short, sincere prayer connected to today's lesson
  "action_steps": string[],            // exactly 1 concrete, practical action the reader can take today
  "additional_thoughts": string,       // end this field with one short, memorable sentence prefixed "Key takeaway: "
  "estimated_reading_time": number     // whole minutes, realistic for the content length (typically 3-10)
}`

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
    const mode = typeof body.mode === 'string' ? body.mode : 'generate'

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) return json({ error: 'OPENAI_API_KEY is not set in Supabase secrets.' }, 500)

    const callOpenAI = async (systemPrompt: string, userPrompt: string, maxTokens: number) => {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiApiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: maxTokens,
          temperature: 0.75,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        console.error('[generate-devotional-day] OpenAI error', res.status, errText)
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
        console.error('[generate-devotional-day] Failed to parse OpenAI JSON:', raw)
        throw new Response(JSON.stringify({ error: 'AI returned malformed content. Please try again.' }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const normalizeDayContent = (parsed: any) => {
      const scriptureRefs = Array.isArray(parsed.scripture_references) ? parsed.scripture_references : []
      const cleanedRefs = scriptureRefs
        .filter((r: any) => r && typeof r.reference === 'string' && r.reference.trim())
        .map((r: any) => ({ reference: r.reference.trim(), is_primary: !!r.is_primary }))
      // Guarantee exactly one primary reference if any references exist.
      if (cleanedRefs.length && !cleanedRefs.some((r: any) => r.is_primary)) cleanedRefs[0].is_primary = true

      return {
        title: typeof parsed.title === 'string' && parsed.title ? parsed.title : '',
        subtitle: typeof parsed.subtitle === 'string' ? parsed.subtitle : '',
        scripture_references: cleanedRefs,
        introduction: typeof parsed.introduction === 'string' ? parsed.introduction : '',
        main_content: typeof parsed.main_content === 'string' ? parsed.main_content : '',
        reflection_questions: Array.isArray(parsed.reflection_questions)
          ? parsed.reflection_questions.filter((q: unknown) => typeof q === 'string').slice(0, 3)
          : [],
        guided_prayer: typeof parsed.guided_prayer === 'string' ? parsed.guided_prayer : '',
        action_steps: Array.isArray(parsed.action_steps)
          ? parsed.action_steps.filter((s: unknown) => typeof s === 'string')
          : [],
        additional_thoughts: typeof parsed.additional_thoughts === 'string' ? parsed.additional_thoughts : '',
        estimated_reading_time: typeof parsed.estimated_reading_time === 'number' && parsed.estimated_reading_time > 0
          ? Math.round(parsed.estimated_reading_time)
          : 5,
      }
    }

    // ---------------------------------------------------------------------
    if (mode === 'rewrite') {
      const { instruction, day } = body
      if (!instruction || !REWRITE_INSTRUCTIONS[instruction]) {
        return json({ error: `instruction must be one of: ${Object.keys(REWRITE_INSTRUCTIONS).join(', ')}` }, 400)
      }
      if (!day || typeof day !== 'object' || typeof day.title !== 'string') {
        return json({ error: 'day (object with at least a title) is required' }, 400)
      }

      const systemPrompt = `You are a mature, biblically grounded Bible teacher and devotional writer — clear, grace-centered, practical, Christ-centered, warm and pastoral, doctrinally responsible. You are revising ONE existing day of a devotional series per this instruction:
${REWRITE_INSTRUCTIONS[instruction]}

Do not change the Scripture reference(s) or their order/primary flag from what is given to you — return them back unchanged. Never fabricate or add new Bible verses. Never quote verse text.

Respond with ONLY a JSON object matching exactly this shape:
${dayContentSchema}`

      const userPrompt = `Current day content (JSON):\n${JSON.stringify({
        title: day.title,
        subtitle: day.subtitle || '',
        scripture_references: day.scripture_references || [],
        introduction: day.introduction || '',
        main_content: day.main_content || '',
        reflection_questions: day.reflection_questions || [],
        guided_prayer: day.guided_prayer || '',
        action_steps: day.action_steps || [],
        additional_thoughts: day.additional_thoughts || '',
      })}\n\nApply the instruction above and return the full revised day object.`

      const parsed = await callOpenAI(systemPrompt, userPrompt, 2200)
      const normalized = normalizeDayContent(parsed)
      // Rewrite never touches Scripture — always return exactly what was given in, not what the model echoed.
      normalized.scripture_references = Array.isArray(day.scripture_references) ? day.scripture_references : []
      return json(normalized)
    }

    // ---------------------------------------------------------------------
    // mode === 'generate'
    const {
      series_title, series_description, day_number, total_days,
      day_outline, previous_day_title, previous_day_takeaway,
      target_audience, difficulty_level, language,
    } = body

    if (!series_title || typeof series_title !== 'string') return json({ error: 'series_title (string) is required' }, 400)
    const dayNum = typeof day_number === 'number' && day_number > 0 ? Math.round(day_number) : 1
    const totalDays = typeof total_days === 'number' && total_days > 0 ? Math.round(total_days) : dayNum

    const positionHint = dayNum === 1
      ? 'This is DAY 1 — lay the foundation for the whole series.'
      : dayNum === totalDays
        ? `This is the FINAL day (${dayNum} of ${totalDays}) — summarize the journey, encourage the reader, and give a clear sense of practical continuation beyond the series.`
        : `This is day ${dayNum} of ${totalDays} — build naturally on the previous day and progressively deepen the series' theme. Do not simply repeat the previous day's angle.`

    const systemPrompt = `You are a mature, biblically grounded Bible teacher and devotional writer, in the tradition of clear, grace-centered, practical expository teaching — without impersonating or copying any specific named teacher's wording or style.

Your teaching is: biblically grounded, clear and easy to understand, spiritually encouraging, practical for everyday life, Christ-centered, faith-building, doctrinally balanced and responsible, warm and pastoral, and appropriate for the stated audience and difficulty level.

Focus on: explaining Scripture in context, helping readers understand what the Bible actually teaches, showing practical application, encouraging spiritual growth, strengthening faith, and pointing readers toward Jesus and the finished work of Christ. Avoid manipulation, sensationalism, unsupported doctrine, and fabricated or misattributed Bible quotations. Cite real, accurate Bible references only — never invent one. Never quote verse text yourself; reference only.

You are writing "Day ${dayNum} of ${totalDays}" of the devotional series "${series_title}"${series_description ? ` (series description: "${series_description}")` : ''}.
${positionHint}
${day_outline?.title ? `This day's planned title: "${day_outline.title}"` : ''}${day_outline?.focus ? `\nThis day's planned focus: ${day_outline.focus}` : ''}
${previous_day_title ? `Previous day's title: "${previous_day_title}"` : ''}${previous_day_takeaway ? `\nPrevious day ended on: "${previous_day_takeaway}"` : ''}
This day's content must feel distinct from every other day — do not repeat the same points or examples across days.

Respond with ONLY a JSON object (no markdown, no commentary) matching exactly this shape:
${dayContentSchema}`

    const userPrompt = `Write day ${dayNum} of ${totalDays} now.${target_audience ? `\nTarget audience: ${target_audience}` : ''}${difficulty_level ? `\nDifficulty level: ${difficulty_level}` : ''}${language && language !== 'en' ? `\nWrite in this language: ${language}` : ''}`

    const maxTokens = 2200

    console.log('[generate-devotional-day] mode=generate day=', dayNum, '/', totalDays)
    const parsed = await callOpenAI(systemPrompt, userPrompt, maxTokens)
    return json(normalizeDayContent(parsed))
  } catch (err: any) {
    if (err instanceof Response) return err
    console.error('[generate-devotional-day] Unhandled error:', err?.message || err)
    return json({ error: err?.message || 'An unexpected error occurred' }, 500)
  }
})
