// Supabase Edge Function: detect-region
// =====================================================================
// Resolves the caller's country from their request IP. Generic/reusable —
// used first by the Ministry Partner subscription flow (route Nigeria ->
// Paystack/NGN, else -> PayPal/Stripe/USD), and intended for reuse by the
// (deferred) Individual Partner regional-pricing work later.
//
// No auth required — this is a public, read-only lookup. Best-effort: on any
// failure (lookup down, no IP resolvable) falls back to a safe default rather
// than erroring, since the caller always shows an editable country picker.
//
// Request: GET or POST (body ignored)
// Response: { country_code: string, country_name: string }
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const FALLBACK = { country_code: 'US', country_name: 'United States' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const forwarded = req.headers.get('x-forwarded-for') ?? '';
    const ip = forwarded.split(',')[0].trim() || req.headers.get('x-real-ip') || '';

    if (!ip) return json(FALLBACK);

    const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`);
    if (!r.ok) return json(FALLBACK);
    const j = await r.json();

    if (!j?.success || !j?.country_code) return json(FALLBACK);
    return json({ country_code: j.country_code as string, country_name: (j.country as string) ?? FALLBACK.country_name });
  } catch (error) {
    console.error('detect-region error:', error);
    return json(FALLBACK);
  }
});
