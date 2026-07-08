// supabase/functions/evangelism-ai-suggestion/index.ts
// Suggests a warm, gospel-centred reply for the evangelism inbox.
// Replaces the old browser-side Anthropic call (which had no API key and could
// not work). Runs server-side on OpenAI gpt-4o-mini with the key in secrets.

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

    const { conversation, channelLabel, ministryName } = await req.json().catch(() => ({}))
    if (!conversation || typeof conversation !== 'string') {
      return json({ error: 'conversation (string) is required' }, 400)
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) return json({ error: 'OPENAI_API_KEY is not set in Supabase secrets.' }, 500)

    const systemPrompt = `You are helping a Christian ministry respond to someone who reached out via ${channelLabel || 'a messaging channel'}.
Write a warm, gospel-centred reply that is conversational, not preachy.
Keep it under 3 sentences. Be genuine and human, not corporate.
Ministry: ${ministryName || 'the ministry'}.`

    console.log('[evangelism-ai-suggestion] Calling OpenAI (gpt-4o-mini)...')
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiApiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 300,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Conversation so far:\n${conversation}\n\nSuggest a compassionate reply:` },
        ],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[evangelism-ai-suggestion] OpenAI error', res.status, errText)
      return json({ error: `OpenAI API error ${res.status}: ${errText}` }, 502)
    }

    const data = await res.json()
    const suggestion = data.choices?.[0]?.message?.content?.trim() || ''
    if (!suggestion) return json({ error: 'OpenAI returned an empty suggestion.' }, 502)

    return json({ suggestion })
  } catch (err: any) {
    console.error('[evangelism-ai-suggestion] Unhandled error:', err?.message || err)
    return json({ error: err?.message || 'An unexpected error occurred' }, 500)
  }
})
