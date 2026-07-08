// supabase/functions/spiritual-companion/index.ts
// GraceCounsel AI — spiritual companion backend.
// Supports BOTH providers. Which one runs is read per-request from the
// `ai_companion_settings` table (toggled in the admin panel) — so switching
// providers is instant and needs NO redeploy.
//   provider = 'openai' -> OpenAI gpt-4o-mini   (needs OPENAI_API_KEY)
//   provider = 'claude' -> Anthropic Sonnet      (needs ANTHROPIC_API_KEY)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `You are an AI spiritual companion deeply rooted in the knowledge, wisdom, and revelation of the Word of God. You respond as a mature believer, teacher, and encourager who speaks with biblical accuracy, humility, love, and spiritual discernment.

Core Characteristics:
- Christ-centered in all responses
- Scripture-based, not opinion-driven
- Spirit-led, not sensational or extreme
- Sound in doctrine and balanced in tone
- Compassionate, encouraging, and pastoral

You never contradict Scripture and you do not promote fear, manipulation, or false prophecy.

Response Framework:
For every response:
1. Anchor your message in biblical truth
2. Reference relevant scripture(s) clearly (book, chapter, verse)
3. Apply the Word practically to the user's situation
4. Speak with grace, wisdom, and clarity
5. When appropriate, include a short prayer or declaration

Language & Tone:
- Gentle, respectful, and faith-filled
- Clear and simple, not overly theological
- Encouraging rather than condemning
- Authoritative without arrogance

Always point hearts back to God and His Word, not to yourself.`

// Returns { content, tokensUsed }. Throws on API error (surfaced to the client).
async function callOpenAI(apiKey: string, systemPrompt: string, messages: any[]) {
  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m: any) => ({
      role: m.role === 'system' ? 'assistant' : m.role,
      content: String(m.content ?? ''),
    })),
  ]
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 1500, temperature: 0.7, messages: chatMessages }),
  })
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return {
    content: data.choices?.[0]?.message?.content?.trim() || '',
    tokensUsed: data.usage?.completion_tokens || 0,
  }
}

async function callClaude(apiKey: string, systemPrompt: string, messages: any[]) {
  const apiMessages = messages.map((m: any) => ({
    role: m.role === 'system' ? 'assistant' : m.role,
    content: String(m.content ?? ''),
  }))
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1500,
      thinking: { type: 'disabled' }, // Sonnet 5 defaults thinking on; keep it off for chat
      system: systemPrompt,
      messages: apiMessages,
    }),
  })
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return {
    content: data.content?.find((b: any) => b.type === 'text')?.text?.trim() || '',
    tokensUsed: data.usage?.output_tokens || 0,
  }
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

    const { messages, userContext, language } = await req.json().catch(() => ({}))
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'messages must be a non-empty array' }, 400)
    }

    // Which provider? Read the admin-controlled setting (defaults to openai).
    let provider = 'openai'
    try {
      const { data: setting } = await supabase
        .from('ai_companion_settings').select('provider').eq('id', 1).maybeSingle()
      if (setting?.provider === 'claude' || setting?.provider === 'openai') provider = setting.provider
    } catch (_e) { /* table missing / unreadable -> default openai */ }

    let systemPrompt = SYSTEM_PROMPT
    if (userContext?.spiritualMaturity) {
      systemPrompt += `\n\nUser Context: This person is at a "${userContext.spiritualMaturity}" level in their spiritual journey. Tailor your response accordingly.`
    }
    if (Array.isArray(userContext?.recentTopics) && userContext.recentTopics.length > 0) {
      systemPrompt += `\n\nRecent Discussion Topics: ${userContext.recentTopics.join(', ')}. Reference these if relevant for continuity.`
    }

    // Phase 5: respond in the user's selected language. Scripture quotations
    // should use that language's standard Bible translation, not a literal
    // machine translation of the English verse.
    const lang = language || userContext?.language || 'en'
    const LANGUAGE_NAMES: Record<string, string> = {
      en: 'English', vi: 'Vietnamese', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
      es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', ru: 'Russian',
      ar: 'Arabic', hi: 'Hindi', th: 'Thai', id: 'Indonesian', tl: 'Filipino',
      it: 'Italian', nl: 'Dutch', pl: 'Polish', tr: 'Turkish', sw: 'Swahili', yo: 'Yoruba',
    }
    if (lang && lang !== 'en') {
      const langName = LANGUAGE_NAMES[lang] || lang
      systemPrompt += `\n\nIMPORTANT — LANGUAGE: Respond ENTIRELY in ${langName}. Write all explanation, encouragement, and prayer in ${langName} with a warm, reverent, pastoral tone. When you quote Scripture, use the standard, widely-accepted ${langName} Bible translation wording (do not literally translate the English text yourself), and keep the reference (book chapter:verse). If the user writes in English, still reply in ${langName}.`
    }

    console.log(`[spiritual-companion] Provider: ${provider}`)

    let out: { content: string; tokensUsed: number }
    if (provider === 'claude') {
      const key = Deno.env.get('ANTHROPIC_API_KEY')
      if (!key) return json({ error: 'ANTHROPIC_API_KEY is not set in Supabase secrets.' }, 500)
      out = await callClaude(key, systemPrompt, messages)
    } else {
      const key = Deno.env.get('OPENAI_API_KEY')
      if (!key) return json({ error: 'OPENAI_API_KEY is not set in Supabase secrets.' }, 500)
      out = await callOpenAI(key, systemPrompt, messages)
    }

    if (!out.content) {
      return json({ error: `The ${provider} model returned an empty response.`, content: '' }, 502)
    }

    const scriptureMatch = out.content.match(/\(([^)]*(?:\d+:\d+)[^)]*)\)/g)
    const prayerMatch = out.content.match(/(?:Let us pray|Prayer:|In Jesus' name|Amen)[^]*?(?=\n\n|$)/i)

    const result = {
      content: out.content,
      scriptureReference: scriptureMatch ? scriptureMatch[scriptureMatch.length - 1].replace(/[()]/g, '') : undefined,
      prayer: prayerMatch ? prayerMatch[0].trim() : undefined,
      tokensUsed: out.tokensUsed,
      provider,
    }

    // Fire-and-forget usage log — never blocks the response.
    supabase
      .from('ai_usage_logs')
      .insert({ user_id: user.id, tokens_used: result.tokensUsed, timestamp: new Date().toISOString() })
      .then(({ error }) => { if (error) console.warn('[spiritual-companion] usage log failed:', error.message) })

    return json(result)
  } catch (err: any) {
    console.error('[spiritual-companion] Unhandled error:', err?.message || err)
    return json({ error: err?.message || 'An unexpected error occurred' }, 500)
  }
})
