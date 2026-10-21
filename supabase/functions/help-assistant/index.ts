// supabase/functions/help-assistant/index.ts
// Rekindle Help — the AI assistant behind the "Need help?" pop-up in both apps.
// It answers how-to questions ONLY from the published FAQ (faq_items, 0393) and
// the Rekindle Guide (./guide.ts). When it isn't sure, or the person asks for a
// human, the client calls action 'handoff', which files a support ticket (with
// the chat attached) for Platform Admin › Support Tickets.
//
// Provider follows the GraceCounsel switch in `ai_companion_settings`, so it
// needs no extra setup:
//   provider = 'openai' -> OpenAI gpt-4o-mini   (needs OPENAI_API_KEY)
//   provider = 'claude' -> Anthropic Sonnet      (needs ANTHROPIC_API_KEY)
//
// Actions (POST body):
//   { action: 'ask', messages, app, page, language }
//       -> { answer, confident, messageId }
//   { action: 'handoff', messages, app, page, ministryId?, note?, messageId? }
//       -> { ticketId, email }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { REKINDLE_GUIDE } from './guide.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Questions per user per rolling 24 hours. Keeps the AI bill bounded; past it
// the pop-up offers the hand-off to a person instead.
const DAILY_LIMIT = 30
const MAX_HISTORY = 10
const MAX_CHARS = 2000

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', vi: 'Vietnamese', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', ru: 'Russian',
  ar: 'Arabic', hi: 'Hindi', th: 'Thai', id: 'Indonesian', tl: 'Filipino',
  it: 'Italian', nl: 'Dutch', pl: 'Polish', tr: 'Turkish', sw: 'Swahili', yo: 'Yoruba',
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

function buildSystemPrompt(faq: string, app: string, page: string, language: string) {
  const where = app === 'ministry'
    ? 'the ReKindle Ministry app (used by ministry leaders and their members)'
    : 'the ReKindle BC app (used by individual believers)'
  let prompt = `You are Rekindle Help, the support assistant inside ${where}. You help people use the app: finding screens, following steps, plans and limits, account questions.

Rules:
- Answer ONLY from the KNOWLEDGE below. Never invent screens, buttons, prices, features or policies. If the knowledge doesn't cover the question, say so plainly and set "confident" to false.
- Set "confident" to false too when the person reports a bug or error, has a billing or payment problem, needs something changed on their account, or asks to speak to a person. In those cases say a member of the team can help and that they can tap "Talk to a person".
- Keep answers short and practical: one or two sentences, then numbered steps if there are steps. Use the exact screen and button names from the knowledge, with › between steps of a path (e.g. Prayer › Prayer Wall).
- You are not a pastor or counsellor. For prayer, spiritual or emotional support, gently point them to GraceCounsel AI or to booking a counsellor in the app. If someone may be in danger, tell them to contact local emergency services straight away.
- Never ask for passwords, card numbers or other sensitive details.

Reply with a single JSON object and nothing else: {"answer": "<your reply>", "confident": true|false}

The person is currently on this page of the app: ${page || 'unknown'}.

KNOWLEDGE — FAQ:
${faq || '(no FAQ items published)'}

KNOWLEDGE — THE REKINDLE GUIDE:
${REKINDLE_GUIDE}`
  if (language && language !== 'en') {
    const name = LANGUAGE_NAMES[language] || language
    prompt += `\n\nIMPORTANT — LANGUAGE: Write "answer" entirely in ${name}. Keep screen and button names as they appear in the knowledge so the person can match them on screen.`
  }
  return prompt
}

async function callOpenAI(apiKey: string, systemPrompt: string, messages: ChatMessage[]) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 600,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    }),
  })
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return String(data.choices?.[0]?.message?.content ?? '').trim()
}

async function callClaude(apiKey: string, systemPrompt: string, messages: ChatMessage[]) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 600,
      thinking: { type: 'disabled' },
      system: systemPrompt,
      messages,
    }),
  })
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return String(data.content?.find((b: any) => b.type === 'text')?.text ?? '').trim()
}

// The model is asked for JSON; tolerate a code fence or stray prose around it.
// Unparseable output is shown as-is but treated as unsure.
function parseReply(raw: string): { answer: string; confident: boolean } {
  const match = raw.match(/\{[\s\S]*\}/)
  if (match) {
    try {
      const obj = JSON.parse(match[0])
      if (typeof obj.answer === 'string' && obj.answer.trim()) {
        return { answer: obj.answer.trim(), confident: obj.confident !== false }
      }
    } catch (_e) { /* fall through */ }
  }
  return { answer: raw, confident: false }
}

function cleanMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content ?? '').trim())
    .slice(-MAX_HISTORY)
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, MAX_CHARS) }))
}

function transcript(messages: ChatMessage[]) {
  return messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')
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

    const body = await req.json().catch(() => ({}))
    const action = body.action === 'handoff' ? 'handoff' : 'ask'
    const app = body.app === 'ministry' ? 'ministry' : 'rekindle'
    const page = String(body.page ?? '').slice(0, 200)
    const messages = cleanMessages(body.messages)

    if (action === 'handoff') {
      const firstQuestion = messages.find((m) => m.role === 'user')?.content ?? ''
      const note = String(body.note ?? '').trim().slice(0, MAX_CHARS)
      const subject = (note || firstQuestion || 'Help request').replace(/\s+/g, ' ').slice(0, 120)
      const description = [
        note && `Message from the user:\n${note}`,
        `From: ${user.email ?? 'unknown email'} · ${app} app · page ${page || 'unknown'}`,
        messages.length > 0 && `Chat with Rekindle Help:\n\n${transcript(messages)}`,
      ].filter(Boolean).join('\n\n')

      const { data: ticket, error } = await supabase
        .from('ministry_support_tickets')
        .insert({
          submitted_by: user.id,
          ministry_id: typeof body.ministryId === 'string' && body.ministryId ? body.ministryId : null,
          subject,
          description,
          category: 'general',
          priority: 'normal',
          status: 'open',
          source: 'help_assistant',
        })
        .select('id')
        .single()
      if (error) throw new Error(`Could not create the support ticket: ${error.message}`)

      if (typeof body.messageId === 'string' && body.messageId) {
        await supabase.from('help_assistant_messages')
          .update({ ticket_id: ticket.id })
          .eq('id', body.messageId)
          .eq('user_id', user.id)
      }
      return json({ ticketId: ticket.id, email: user.email ?? null })
    }

    const question = [...messages].reverse().find((m) => m.role === 'user')
    if (!question || messages[messages.length - 1].role !== 'user') {
      return json({ error: 'messages must end with a user message' }, 400)
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('help_assistant_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', since)
    if ((count ?? 0) >= DAILY_LIMIT) {
      return json({ limitReached: true, confident: false, answer: "You've asked a lot of questions today, so I'm taking a short break. Tap \"Talk to a person\" and the team will get back to you." })
    }

    const { data: faqRows } = await supabase
      .from('faq_items')
      .select('audience, question, answer')
      .eq('is_published', true)
      .order('audience', { ascending: true })
      .order('display_order', { ascending: true })
    const faq = (faqRows ?? [])
      .map((r: any) => `[${r.audience}] Q: ${r.question}\nA: ${r.answer}`)
      .join('\n\n')

    let provider = 'openai'
    try {
      const { data: setting } = await supabase
        .from('ai_companion_settings').select('provider').eq('id', 1).maybeSingle()
      if (setting?.provider === 'claude' || setting?.provider === 'openai') provider = setting.provider
    } catch (_e) { /* table missing / unreadable -> default openai */ }

    const language = typeof body.language === 'string' ? body.language : 'en'
    const systemPrompt = buildSystemPrompt(faq, app, page, language)

    let raw: string
    if (provider === 'claude') {
      const key = Deno.env.get('ANTHROPIC_API_KEY')
      if (!key) return json({ error: 'ANTHROPIC_API_KEY is not set in Supabase secrets.' }, 500)
      raw = await callClaude(key, systemPrompt, messages)
    } else {
      const key = Deno.env.get('OPENAI_API_KEY')
      if (!key) return json({ error: 'OPENAI_API_KEY is not set in Supabase secrets.' }, 500)
      raw = await callOpenAI(key, systemPrompt, messages)
    }
    if (!raw) return json({ error: `The ${provider} model returned an empty response.` }, 502)

    const reply = parseReply(raw)

    const { data: logged, error: logError } = await supabase
      .from('help_assistant_messages')
      .insert({
        user_id: user.id,
        app,
        page: page || null,
        question: question.content,
        answer: reply.answer,
        confident: reply.confident,
      })
      .select('id')
      .single()
    if (logError) console.warn('[help-assistant] log failed:', logError.message)

    return json({ ...reply, messageId: logged?.id ?? null })
  } catch (err: any) {
    console.error('[help-assistant] Unhandled error:', err?.message || err)
    return json({ error: err?.message || 'An unexpected error occurred' }, 500)
  }
})
