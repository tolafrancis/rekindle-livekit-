// supabase/meeting-ai/index.ts
//
// AI proxy for the meeting notes pipeline (transcript cleanup, language detection,
// translation, structured insights). The browser MUST NOT call a model provider
// directly — meetingAIEngine.ts used to fetch api.anthropic.com from the client with
// no key and no CORS, so the whole AI path was dead. This function holds the key.
//
// Uses OpenAI (gpt-4o-mini), matching the pattern in `spiritual-companion`.
//
// ── Deploy (Supabase dashboard) ──────────────────────────────────────────────
//   1. Edge Functions → "Deploy a new function" → name it exactly: meeting-ai
//   2. Paste this file. Leave "Verify JWT" ON (callers must be signed in).
//   3. Secret required: OPENAI_API_KEY (already set for your other AI functions).
//
// ── Request ──────────────────────────────────────────────────────────────────
//   POST { system: string, user: string, maxTokens?: number, temperature?: number }
//   →    { text: string }
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

const MODEL = 'gpt-4o-mini';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return json({ error: 'OPENAI_API_KEY is not configured' }, 500);

    const { system, user, maxTokens, temperature } = await req.json();
    if (typeof user !== 'string' || !user.trim()) return json({ error: 'user content required' }, 400);

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: Math.min(Number(maxTokens) || 1000, 4000),
        temperature: typeof temperature === 'number' ? temperature : 0.2, // low: we want faithful extraction, not creativity
        messages: [
          ...(system ? [{ role: 'system', content: String(system) }] : []),
          { role: 'user', content: user },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('meeting-ai openai error:', res.status, err);
      return json({ error: `OpenAI error ${res.status}` }, 502);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') return json({ error: 'No text in model response' }, 502);

    return json({ text });
  } catch (error) {
    console.error('meeting-ai error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
