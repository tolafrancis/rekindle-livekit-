// Supabase Edge Function: create-whatsapp-subscription
// =====================================================================
// Starts (or resumes) a ministry's WhatsApp Business plan subscription —
// the "Get Started" -> "Pay & Continue" action in MinistryWhatsAppConnect.tsx.
// Creates a Stripe Checkout Session (mode: subscription) for the chosen
// plan's monthly price + one-time setup fee, and stores a 'pending' row in
// ministry_whatsapp_configs keyed by ministry_id. The actual activation
// (plan_status -> 'active') happens in whatsapp-subscription-webhook once
// Stripe confirms payment — this function never marks a plan paid itself.
//
// This was split out of the combined whatsapp-save-credentials-function.ts
// router (see that file's own header) into its own deployable function,
// per that file's "DEPLOY AS SEPARATE FUNCTIONS" note — this action was
// never actually deployed under its own name before, so every "Pay &
// Continue" click 404'd.
//
// Request:  POST { ministryId, plan:'basic'|'growth'|'premium', monthlyUsd,
//                   setupUsd, setupAlreadyPaid, successUrl, cancelUrl }
// Response: { checkoutUrl }
//
// Secrets: STRIPE_SECRET_KEY. If it isn't set, this function returns a
// clear 500 ("Stripe is not configured") rather than silently marking the
// plan active for free — deliberately NOT reproducing the combined
// router's old "dev mode" branch, which upserted plan_status:'active',
// setup_fee_paid:true with zero real payment whenever the key was unset.
// That's a revenue-leak footgun once this function is reachable from a
// live pricing UI, so it's closed here instead of carried forward.
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const VALID_PLANS = new Set(['basic', 'growth', 'premium']);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { ministryId, plan, monthlyUsd, setupUsd, setupAlreadyPaid, successUrl, cancelUrl } = await req.json();

    if (!ministryId || !plan || !VALID_PLANS.has(plan)) {
      return json({ error: 'ministryId and a valid plan (basic|growth|premium) are required' }, 400);
    }
    if (!successUrl || !cancelUrl) {
      return json({ error: 'successUrl and cancelUrl are required' }, 400);
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

    // Authorize: caller must administer this ministry (same pattern as
    // ministry-checkout — never trust a client-supplied "yes I'm admin").
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: isAdmin } = await admin.rpc('is_group_admin', { p_ministry_id: ministryId, p_user_id: user.id });
    if (!isAdmin) return json({ error: 'Not authorized to manage WhatsApp billing for this ministry' }, 403);

    if (!STRIPE_SECRET_KEY) {
      return json({ error: 'Stripe is not configured yet. Ask an administrator to set STRIPE_SECRET_KEY, or use "Enter Credentials Manually" instead.' }, 500);
    }

    // Server-authoritative pricing check — the client sends monthlyUsd/setupUsd
    // for display/line-item purposes, but never trust it blindly; reject any
    // amount that doesn't match this plan's known price.
    const KNOWN_PRICES: Record<string, { monthlyUsd: number; setupUsd: number }> = {
      basic:   { monthlyUsd: 10, setupUsd: 50 },
      growth:  { monthlyUsd: 35, setupUsd: 50 },
      premium: { monthlyUsd: 75, setupUsd: 100 },
    };
    const known = KNOWN_PRICES[plan];
    const finalMonthly = known.monthlyUsd;
    const finalSetup = known.setupUsd;
    if (monthlyUsd !== undefined && Number(monthlyUsd) !== finalMonthly) {
      console.warn(`[create-whatsapp-subscription] client sent monthlyUsd=${monthlyUsd} for plan=${plan}, using server price ${finalMonthly}`);
    }

    const lineItems: [string, string][] = [];
    let idx = 0;

    lineItems.push(
      [`line_items[${idx}][price_data][currency]`, 'usd'],
      [`line_items[${idx}][price_data][unit_amount]`, String(Math.round(finalMonthly * 100))],
      [`line_items[${idx}][price_data][recurring][interval]`, 'month'],
      [`line_items[${idx}][price_data][product_data][name]`, `WhatsApp ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`],
      [`line_items[${idx}][quantity]`, '1'],
    );
    idx++;

    if (!setupAlreadyPaid && finalSetup > 0) {
      lineItems.push(
        [`line_items[${idx}][price_data][currency]`, 'usd'],
        [`line_items[${idx}][price_data][unit_amount]`, String(Math.round(finalSetup * 100))],
        [`line_items[${idx}][price_data][product_data][name]`, 'WhatsApp Business Account Setup Fee'],
        [`line_items[${idx}][quantity]`, '1'],
      );
      idx++;
    }

    const params = new URLSearchParams([
      ['mode', 'subscription'],
      ['success_url', successUrl],
      ['cancel_url', cancelUrl],
      ['client_reference_id', ministryId],
      ['metadata[ministryId]', ministryId],
      ['metadata[plan]', plan],
      ['metadata[type]', 'whatsapp_subscription'],
      ['subscription_data[metadata][ministryId]', ministryId],
      ['subscription_data[metadata][plan]', plan],
      ...lineItems,
    ]);

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();
    if (!stripeRes.ok) return json({ error: session?.error?.message ?? 'Stripe error' }, 400);

    await admin
      .from('ministry_whatsapp_configs')
      .upsert({
        ministry_id: ministryId,
        whatsapp_plan: plan,
        plan_status: 'pending',
        setup_fee_paid: !!setupAlreadyPaid,
        stripe_session_id: session.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'ministry_id' });

    return json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err: any) {
    console.error('[create-whatsapp-subscription] error:', err);
    return json({ error: err.message ?? 'Unexpected error' }, 500);
  }
});
