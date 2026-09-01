// supabase/functions/detect-transcript-corrections/index.ts
// Ministry-admin only. Reads a full sermon transcript and returns likely
// speech-recognition (STT) errors paired with their likely-intended
// wording — e.g. "the water is not and the ground bearing" ->
// "the water is naught, and the ground barren" (2 Kings 2:19, KJV).
//
// This is deliberately a separate, cheap contextual pass from
// MinistrySermonLibrary.tsx's client-side KNOWN_CONFUSIONS regex list —
// that list only catches a handful of pre-known pairs; this one reads the
// WHOLE transcript and reasons about context (grammar, Bible references,
// common pastoral phrasing) the way a human proofreader would, so it can
// catch errors no fixed dictionary would ever list.
//
// Same auth/role pattern as generate-devotional-day, but scoped to
// MINISTRY admin (is_group_admin), not platform admin — this is a
// per-ministry tool, not a platform-content one.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_TRANSCRIPT_CHARS = 60000 // ~ gpt-4o-mini handles this comfortably; a hard ceiling against runaway cost/latency on an unusually long upload.
const MAX_CORRECTIONS = 40

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

    const body = await req.json().catch(() => ({}))
    const ministryId = typeof body.ministry_id === 'string' ? body.ministry_id : ''
    const transcript = typeof body.transcript === 'string' ? body.transcript : ''

    if (!ministryId) return json({ error: 'ministry_id is required' }, 400)
    if (!transcript.trim()) return json({ error: 'transcript is required' }, 400)

    // Ministry-scoped admin check (security definer RPC, same predicate
    // already trusted in production by the RLS policies on this table's
    // siblings — 0150_rls_hardening_phase4.sql).
    const { data: isAdmin, error: adminCheckError } = await supabase
      .rpc('is_group_admin', { p_ministry_id: ministryId, p_user_id: user.id })
    if (adminCheckError || !isAdmin) return json({ error: 'Ministry admin access required.' }, 403)

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) return json({ error: 'OPENAI_API_KEY is not set in Supabase secrets.' }, 500)

    const truncated = transcript.length > MAX_TRANSCRIPT_CHARS
    const scanText = truncated ? transcript.slice(0, MAX_TRANSCRIPT_CHARS) : transcript

    const systemPrompt = `You are an expert proofreader for speech-to-text (STT) transcripts of Christian sermon preaching, often Nigerian-accented English. Read the transcript and find spans of text that are LIKELY WRONG because the STT engine misheard the speaker — a word, short phrase, or clause that breaks grammar, doesn't make sense in context, or is an unlikely thing for a preacher to actually say, where the surrounding context (grammar, Bible allusions/references, common pastoral phrasing, what would actually make sense) strongly suggests what was really said.

Rules:
- Only flag spans you are reasonably confident are genuine STT errors — not just informal speech, accented English, filler words, or repetition. Do NOT flag Nigerian English expressions (e.g. "I want to appreciate you", "by God's grace", "we are trusting God") — those are correct as heard, not errors.
- Do NOT flag correct Bible references, proper names, or ministry/denominational terms.
- Each "wrong" value MUST be an EXACT, verbatim substring copied from the transcript below — do not paraphrase, reword, or fix capitalization/punctuation of it. If it is not an exact substring, it is useless (the app matches it literally).
- Prefer the smallest span that captures the error clearly — a few words to a short clause, not a whole paragraph.
- "right" is your best-guess correction — what the speaker most likely actually said.
- Order results by confidence, most confident first. Return at most ${MAX_CORRECTIONS}.
- If you find nothing you're confident about, return an empty array. Do not invent errors to fill the list.

Respond with ONLY a JSON object matching exactly this shape:
{ "corrections": [ { "wrong": string, "right": string }, ... ] }`

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiApiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 4000,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Transcript:\n\n${scanText}` },
        ],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[detect-transcript-corrections] OpenAI error', res.status, errText)
      return json({ error: `OpenAI API error ${res.status}: ${errText}` }, 502)
    }

    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content?.trim() || ''
    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch {
      console.error('[detect-transcript-corrections] Failed to parse OpenAI JSON:', raw)
      return json({ error: 'AI returned malformed content. Please try again.' }, 502)
    }

    const corrections = Array.isArray(parsed.corrections)
      ? parsed.corrections
          .filter((c: any) => c && typeof c.wrong === 'string' && c.wrong.trim() && typeof c.right === 'string' && c.right.trim())
          // Only keep ones that are genuinely findable in the transcript —
          // the model is instructed to copy verbatim, but isn't infallible.
          .filter((c: any) => transcript.includes(c.wrong))
          .map((c: any) => ({ wrong: c.wrong.trim(), right: c.right.trim() }))
          .slice(0, MAX_CORRECTIONS)
      : []

    return json({ corrections, truncated })
  } catch (err: any) {
    console.error('[detect-transcript-corrections] Unhandled error:', err?.message || err)
    return json({ error: err?.message || 'An unexpected error occurred' }, 500)
  }
})
