// supabase/functions/generate-affirmation/index.ts
// Admin-only: drafts an affirmation for the admin Affirmations form (AI Generate
// button) in a fixed five-part structure:
//   1. Identity: who I am in Christ
//   2. Truth: what God says or promises
//   3. Declaration: what I choose to believe
//   4. Action/response: how I will live today
//   5. Closing faith statement: a strong final declaration
// Runs server-side on OpenAI gpt-4o-mini with the key in secrets, same pattern
// as generate-prayer-content.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { title, category, scripture } = await req.json().catch(() => ({}))
    const topic = (typeof title === 'string' && title.trim()) || (typeof category === 'string' && category.trim()) || ''
    if (!topic) return json({ error: 'Enter a title (or pick a category) first.' }, 400)
    const scriptureRef = typeof scripture === 'string' ? scripture.trim() : ''

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) return json({ error: 'OPENAI_API_KEY is not set in Supabase secrets.' }, 500)

    const systemPrompt = `You are a Christian content writer drafting a first-person daily affirmation for a devotional app, grounded in mainstream evangelical theology and avoiding denominational specifics.

Write the affirmation in EXACTLY five short paragraphs, in this order:
1. Identity: who I am in Christ (e.g. "I am a child of God, chosen and loved...").
2. Truth: what God says or promises about this topic, drawing on Scripture in your own words.
3. Declaration: what I choose to believe because of that truth ("I choose to believe...", "I declare...").
4. Action/response: how I will live today in light of it (concrete, present tense).
5. Closing faith statement: one strong final declaration, ending "in Jesus' name. Amen."

Rules:
- First person ("I", "my"), present tense, warm and confident, never preachy.
- Each paragraph 1-3 sentences. No headings, numbers, labels or bullet points in the text itself.
- Do not quote Scripture word for word; paraphrase it. If a scripture reference is given, build paragraph 2 on it.

Respond with ONLY a JSON object (no markdown) of the shape: { "paragraphs": [string, string, string, string, string] }`

    const userPrompt = `Topic: "${topic}"`
      + (typeof category === 'string' && category && category !== topic ? `\nCategory: ${category}` : '')
      + (scriptureRef ? `\nScripture reference: ${scriptureRef}` : '')

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiApiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 900,
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
      console.error('[generate-affirmation] OpenAI error', res.status, errText)
      return json({ error: `OpenAI API error ${res.status}: ${errText}` }, 502)
    }

    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content?.trim() || ''
    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch {
      console.error('[generate-affirmation] Failed to parse OpenAI JSON:', raw)
      return json({ error: 'AI returned malformed content. Please try again.' }, 502)
    }

    const paragraphs = (Array.isArray(parsed.paragraphs) ? parsed.paragraphs : [])
      .filter((p: unknown) => typeof p === 'string' && p.trim())
      .map((p: string) => p.trim())
      .slice(0, 5)
    if (paragraphs.length === 0) return json({ error: 'AI returned an empty affirmation. Please try again.' }, 502)

    return json({ text: paragraphs.join('\n\n'), paragraphs })
  } catch (err) {
    console.error('[generate-affirmation] Unexpected error', err)
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500)
  }
})
