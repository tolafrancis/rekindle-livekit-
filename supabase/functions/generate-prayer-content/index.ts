// supabase/functions/generate-prayer-content/index.ts
// Admin-only: given a title, drafts a description, scripture references, and
// guided prayer points for a Prayer Topic / Prayer Series day / Prayer Watch
// entry. Runs server-side on OpenAI gpt-4o-mini with the key in secrets.
//
// The model only ever proposes scripture REFERENCES, never verse text — the
// caller (AdminPrayerLibrary) fetches the actual wording from bible-api.com,
// the same trusted source used everywhere else in this app, so scripture text
// is never hallucinated.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const KIND_LABEL: Record<string, string> = {
  topic: 'a single-session guided prayer topic',
  series_day: 'one day of a multi-day guided prayer series',
  watch: 'a scheduled corporate "prayer watch" entry',
}

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

    const { title, kind, context, pointCount } = await req.json().catch(() => ({}))
    if (!title || typeof title !== 'string') {
      return json({ error: 'title (string) is required' }, 400)
    }
    const kindKey = typeof kind === 'string' && KIND_LABEL[kind] ? kind : 'topic'
    // Admin-chosen count, clamped to a sane range so a typo can't blow the token budget.
    const count = typeof pointCount === 'number' && Number.isFinite(pointCount)
      ? Math.max(3, Math.min(25, Math.round(pointCount)))
      : 10

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) return json({ error: 'OPENAI_API_KEY is not set in Supabase secrets.' }, 500)

    const systemPrompt = `You are a Christian prayer content writer helping an admin draft ${KIND_LABEL[kindKey]} for a devotional app.
Write a warm, Scripturally grounded introduction in mainstream evangelical Christian theology, avoiding denominational specifics or controversial doctrine.

The prayer points themselves must be written as forceful spiritual-warfare DECREES, in the West African deliverance "prayer point" tradition (as popularized by ministries like MFM) — not soft requests. Generate EXACTLY ${count} distinct prayer points — not more, not fewer — each attacking a different angle of the topic so they don't repeat one another. Each point:
- Is a single imperative sentence that commands or decrees against a spiritual force, power, or circumstance specific to the topic.
- Uses vivid, militant imagery (fire, judgement, destruction, being scattered/roasted/paralyzed, etc.) where it fits the topic.
- MUST end with the exact phrase "in the name of Jesus."
- MUST be paired with a real Bible reference that backs it up, even loosely thematically (e.g. a psalm of deliverance/protection, a passage about spiritual warfare or God's judgement on evil). Every single point needs one — never leave it blank. Reuse a reference across points if you run out of distinct ones; do not invent a fake reference.
Adapt the substance to the given title/context — do not reuse these verbatim, they are style references only:
- "Every power assigned to waste my destiny, catch fire and die, in the name of Jesus."
- "Any evil altar fashioned against my life, be roasted by the fire of God, in the name of Jesus."
- "Every satanic agent monitoring my progress in the spirit realm, go blind, in the name of Jesus."
- "Any witchcraft practice under any water against my life, receive immediate judgement of fire, in the name of Jesus."

Respond with ONLY a JSON object (no markdown, no commentary) matching exactly this shape:
{
  "description": string,            // 2-4 sentence introduction, warm and pastoral
  "scripture_reference": string,     // ONE primary Bible reference, e.g. "Philippians 4:6-7" — reference only, never quote the verse text
  "additional_scriptures": string[], // 0-2 more supporting Bible references (reference only)
  "prayer_points": [                 // EXACTLY ${count} prayer-point decrees in the style described above
    {
      "content": string,             // one decree sentence, ending in "in the name of Jesus."
      "scripture": string,           // REQUIRED — a real Bible reference backing this point, e.g. "Psalm 68:1". Never "" — every point must have one.
      "duration": number             // seconds to linger on this point, between 45 and 90
    }
  ]
}
Never include actual scripture wording anywhere in your response — references only.`

    const userPrompt = context
      ? `Title: "${title}"\nAdditional context: ${context}`
      : `Title: "${title}"`

    // Roughly 130 tokens per decree + scripture ref, plus headroom for the
    // description/scripture fields and JSON punctuation.
    const maxTokens = Math.min(4000, 500 + count * 150)

    console.log('[generate-prayer-content] Calling OpenAI (gpt-4o-mini) for kind=', kindKey, 'count=', count)
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
      console.error('[generate-prayer-content] OpenAI error', res.status, errText)
      return json({ error: `OpenAI API error ${res.status}: ${errText}` }, 502)
    }

    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content?.trim() || ''
    if (!raw) return json({ error: 'OpenAI returned an empty response.' }, 502)

    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      console.error('[generate-prayer-content] Failed to parse OpenAI JSON:', raw)
      return json({ error: 'AI returned malformed content. Please try again.' }, 502)
    }

    // If the model overshoots the requested count, trim rather than ship extra;
    // if it undershoots, return what it gave rather than fabricate padding.
    const prayerPoints = (Array.isArray(parsed.prayer_points) ? parsed.prayer_points : []).slice(0, count)
    const mainReference = typeof parsed.scripture_reference === 'string' ? parsed.scripture_reference : ''
    const extraReferences: string[] = Array.isArray(parsed.additional_scriptures)
      ? parsed.additional_scriptures.filter((s: unknown) => typeof s === 'string')
      : []
    // Safety net: if the model still leaves a point's scripture blank despite
    // instructions, fall back to one of the references it already proposed
    // rather than shipping an empty field.
    const fallbackReferences = [mainReference, ...extraReferences].filter(Boolean)

    return json({
      description: typeof parsed.description === 'string' ? parsed.description : '',
      scripture_reference: mainReference,
      additional_scriptures: extraReferences,
      prayer_points: prayerPoints.map((p: any, idx: number) => {
        const scripture = typeof p?.scripture === 'string' && p.scripture.trim() ? p.scripture.trim() : ''
        return {
          content: typeof p?.content === 'string' ? p.content : '',
          scripture: scripture || (fallbackReferences.length
            ? fallbackReferences[idx % fallbackReferences.length]
            : ''),
          duration: typeof p?.duration === 'number' && p.duration > 0 ? Math.round(p.duration) : 60,
        }
      }),
    })
  } catch (err: any) {
    console.error('[generate-prayer-content] Unhandled error:', err?.message || err)
    return json({ error: err?.message || 'An unexpected error occurred' }, 500)
  }
})
