// supabase/meeting-ai/index.ts
//
// AI proxy for the meeting notes pipeline (transcript cleanup, language detection,
// translation, structured insights). The browser MUST NOT call a model provider
// directly — meetingAIEngine.ts used to fetch api.anthropic.com from the client with
// no key and no CORS, so the whole AI path was dead. This function holds the key.
//
// Uses OpenAI (gpt-4o-mini), matching the pattern in `spiritual-companion`.
// The detailed meeting-notes report asks for `model: 'gpt-4.1'`: gpt-4o-mini
// left out most names, assignments and plans on a real 46-minute meeting.
// Only the models in ALLOWED_MODELS can be requested, and the larger one
// needs a signed-in caller (or the service role).
//
// ── Deploy (Supabase dashboard) ──────────────────────────────────────────────
//   1. Edge Functions → "Deploy a new function" → name it exactly: meeting-ai
//   2. Paste this file. (Deployed with Verify JWT off; the premium model is
//      gated on a signed-in caller below.)
//   3. Secret required: OPENAI_API_KEY (already set for your other AI functions).
//
// ── Request ──────────────────────────────────────────────────────────────────
//   POST { system: string, user: string, maxTokens?: number, temperature?: number,
//          model?: 'gpt-4o-mini' | 'gpt-4.1' }
//   →    { text: string }
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

const MODEL = 'gpt-4o-mini';
// model → max output tokens allowed
const ALLOWED_MODELS: Record<string, number> = { 'gpt-4o-mini': 4000, 'gpt-4.1': 8000 };

/** True when the request carries a real signed-in user, or the service role. */
async function isAuthorisedCaller(req: Request): Promise<boolean> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (serviceKey && token === serviceKey) return true;
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
    const { data } = await admin.auth.getUser(token);
    return !!data?.user;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return json({ error: 'OPENAI_API_KEY is not configured' }, 500);

    const { system, user, maxTokens, temperature, model: requested } = await req.json();
    if (typeof user !== 'string' || !user.trim()) return json({ error: 'user content required' }, 400);

    let model = MODEL;
    if (typeof requested === 'string' && requested !== MODEL && ALLOWED_MODELS[requested]) {
      if (!(await isAuthorisedCaller(req))) return json({ error: 'Sign in required' }, 401);
      model = requested;
    }
    const maxOut = ALLOWED_MODELS[model];

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(Number(maxTokens) || 1000, maxOut),
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
