// Supabase Edge Function: ministry-checkout
// =====================================================================
// Phase 6 (6b) — MINISTRY (tenant) subscription checkout. Provider-agnostic: creates
// a Stripe Checkout Session or a Paystack transaction for a ministry PLAN, tagged with
// metadata { ministry_id, plan, cycle } so the webhook can activate ministry_subscriptions.
// Distinct from the individual-user subscription functions.
//
// Requests (POST; caller must be a leader/admin/owner of ministryId):
//   { action:'checkout', ministryId, plan, provider:'stripe'|'paystack', cycle, returnUrl }
//        -> { url }   (redirect the admin to the provider's hosted checkout)
//   { action:'portal', ministryId, returnUrl }  -> { url }   (Stripe billing portal)
//
// Secrets: STRIPE_SECRET_KEY, PAYSTACK_SECRET_KEY (shared with the existing billing fns).
// Pricing is SERVER-AUTHORITATIVE here (never trust client amounts).
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Server-authoritative plan pricing (USD, smallest unit / cents). Mirrors MINISTRY_PLANS.
const PLAN_AMOUNTS: Record<string, { name: string; monthly: number; yearly: number }> = {
  basic: { name: 'Ministry Basic', monthly: 1900, yearly: 19000 },
  standard: { name: 'Ministry Standard', monthly: 4900, yearly: 49000 },
  premium: { name: 'Ministry Premium', monthly: 9900, yearly: 99000 },
  enterprise: { name: 'Ministry Enterprise', monthly: 24900, yearly: 249000 },
};

const form = (obj: Record<string, string>) =>
  Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { action, ministryId, plan, provider, cycle, returnUrl } = await req.json();
    if (!action || !ministryId) return json({ error: 'action and ministryId are required' }, 400);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    const PAYSTACK_KEY = Deno.env.get('PAYSTACK_SECRET_KEY');

    // Authorize: caller must administer this ministry.
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: isAdmin } = await admin.rpc('is_group_admin', { p_ministry_id: ministryId, p_user_id: user.id });
    if (!isAdmin) return json({ error: 'Not authorized to manage billing for this ministry' }, 403);

    const back = returnUrl || `${SUPABASE_URL}`;

    // ── Billing portal (Stripe) ──────────────────────────────────────────
    if (action === 'portal') {
      if (!STRIPE_KEY) return json({ error: 'Stripe not configured' }, 500);
      const { data: sub } = await admin
        .from('ministry_subscriptions').select('stripe_customer_id')
        .eq('ministry_id', ministryId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      const customer = (sub as { stripe_customer_id?: string } | null)?.stripe_customer_id;
      if (!customer) return json({ error: 'No billing account yet — subscribe first.' }, 400);
      const r = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ customer, return_url: back }),
      });
      const j = await r.json();
      if (!r.ok) return json({ error: j?.error?.message || 'Stripe portal error' }, 502);
      return json({ url: j.url });
    }

    // ── Checkout ─────────────────────────────────────────────────────────
    if (action !== 'checkout') return json({ error: `Unknown action: ${action}` }, 400);
    const p = PLAN_AMOUNTS[plan];
    if (!p) return json({ error: `Unknown plan: ${plan}` }, 400);
    const isYearly = cycle === 'yearly';
    const amount = isYearly ? p.yearly : p.monthly;

    if (provider === 'stripe') {
      if (!STRIPE_KEY) return json({ error: 'Stripe not configured' }, 500);
      const body: Record<string, string> = {
        mode: 'subscription',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': String(amount),
        'line_items[0][price_data][product_data][name]': p.name,
        'line_items[0][price_data][recurring][interval]': isYearly ? 'year' : 'month',
        success_url: `${back}?billing=success`,
        cancel_url: `${back}?billing=cancelled`,
        'metadata[ministry_id]': ministryId,
        'metadata[plan]': plan,
        'metadata[cycle]': isYearly ? 'yearly' : 'monthly',
        'subscription_data[metadata][ministry_id]': ministryId,
        'subscription_data[metadata][plan]': plan,
        'subscription_data[metadata][cycle]': isYearly ? 'yearly' : 'monthly',
      };
      if (user.email) body['customer_email'] = user.email;
      const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form(body),
      });
      const j = await r.json();
      if (!r.ok) return json({ error: j?.error?.message || 'Stripe checkout error' }, 502);
      return json({ url: j.url });
    }

    if (provider === 'paystack') {
      if (!PAYSTACK_KEY) return json({ error: 'Paystack not configured' }, 500);
      const r = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${PAYSTACK_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          amount, // smallest currency unit
          currency: 'USD',
          callback_url: `${back}?billing=success`,
          metadata: { ministry_id: ministryId, plan, cycle: isYearly ? 'yearly' : 'monthly' },
        }),
      });
      const j = await r.json();
      if (!j?.status) return json({ error: j?.message || 'Paystack init error' }, 502);
      return json({ url: j.data.authorization_url });
    }

    return json({ error: `Unknown provider: ${provider}` }, 400);
  } catch (error) {
    console.error('ministry-checkout error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
