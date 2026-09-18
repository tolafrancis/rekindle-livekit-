// Supabase Edge Function: stripe-subscription
// =====================================================================
// Individual "Premium"/"Premium Plus" consumer subscription checkout —
// SetupIntent + Elements flow (see packages/features/src/components/
// SubscriptionManager.tsx). Uses the official Stripe API directly — no
// third-party proxy needed. Mirrored here from the untracked
// supabase/stripe-subscription/index.sql (never actually deployed via the
// CLI — that layout has no index.ts, which `supabase functions deploy`
// requires) so it's part of the real, trackable deploy pipeline.
//
// Requires STRIPE_SECRET_KEY in Supabase secrets.
//
// Price IDs are read from env vars so you can update without redeploying:
//   STRIPE_PRICE_PREMIUM          = price_xxx
//   STRIPE_PRICE_PREMIUM_PLUS     = price_xxx
//
// 'family'/'ministry_plus' individual tiers are dead (subscription_tiers.is_active
// = false as of migration 0350 — superseded by the Ministry Partner tenant model,
// see supabase/functions/ministry-checkout) — no price mapping for them here
// anymore. Their old fallback Price IDs belonged to a previous Stripe account
// and would have failed regardless.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as Sentry from 'npm:@sentry/deno@^10';

Sentry.init({ dsn: Deno.env.get('SENTRY_DSN'), defaultIntegrations: false, tracesSampleRate: 0 });
Sentry.setTag('function', 'stripe-subscription');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const TIER_MAPPING: Record<string, string> = {
  'premium':       'premium',
  'premium_plus':  'premium_plus',
};

function getPriceId(planType: string): string {
  const fromEnv = Deno.env.get(`STRIPE_PRICE_${planType.toUpperCase()}`);
  if (fromEnv) return fromEnv;
  // premium/premium_plus (Individual Partner tiers) were repriced to $10/$18
  // — no fallback here on purpose (Stripe Prices are immutable, so an old
  // Price ID for the previous $9.99/$19.99 amounts can't be reused). Set
  // STRIPE_PRICE_PREMIUM / STRIPE_PRICE_PREMIUM_PLUS as Supabase secrets.
  return '';
}

function flattenForStripe(obj: Record<string, any>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === null || v === undefined) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, flattenForStripe(v, key));
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === 'object') {
          Object.assign(result, flattenForStripe(item, `${key}[${i}]`));
        } else {
          result[`${key}[${i}]`] = String(item);
        }
      });
    } else {
      result[key] = String(v);
    }
  }
  return result;
}

async function stripeCall(method: string, path: string, secretKey: string, body?: Record<string, any>): Promise<any> {
  const init: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    },
  };
  if (body) init.body = new URLSearchParams(flattenForStripe(body)).toString();
  const res = await fetch(`https://api.stripe.com/v1${path}`, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe error ${res.status}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in Supabase secrets.');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { action, email, name, planType, customerId: existingCustomerId, userId, paymentMethodId } = await req.json();

    if (planType && !getPriceId(planType)) {
      throw new Error(`No Stripe price ID configured for plan "${planType}". Set STRIPE_PRICE_${(planType as string).toUpperCase()} in Supabase secrets.`);
    }

    // ── STEP 1: Create/find customer + SetupIntent ────────────────────────
    if (action === 'create-setup-intent' || !action) {
      if (!email)    throw new Error('Email is required');
      if (!planType) throw new Error('Plan type is required');

      let customerId = existingCustomerId;

      if (!customerId) {
        const existing = await stripeCall('GET', `/customers?email=${encodeURIComponent(email)}&limit=1`, stripeSecretKey);
        customerId = existing.data?.length > 0
          ? existing.data[0].id
          : (await stripeCall('POST', '/customers', stripeSecretKey, {
              email, name: name || email.split('@')[0],
              metadata: { user_id: userId || '' },
            })).id;
      }

      if (userId) {
        await supabase.from('user_profiles').update({ stripe_customer_id: customerId }).eq('user_id', userId);
      }

      const setupIntent = await stripeCall('POST', '/setup_intents', stripeSecretKey, {
        customer: customerId,
        payment_method_types: ['card'],
        metadata: { price_id: getPriceId(planType), plan_type: planType, user_id: userId || '' },
      });

      return new Response(JSON.stringify({
        clientSecret: setupIntent.client_secret,
        customerId,
        setupIntentId: setupIntent.id,
        priceId: getPriceId(planType),
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // ── STEP 2: Activate subscription after payment method saved ──────────
    if (action === 'activate-subscription') {
      if (!existingCustomerId) throw new Error('Customer ID is required');
      if (!planType)           throw new Error('Plan type is required');
      if (!userId)             throw new Error('User ID is required');

      // default_payment_method records the card for future renewals, but
      // Stripe does NOT use it to auto-confirm the very first invoice's
      // PaymentIntent — that one is created in 'requires_payment_method'
      // status and must be confirmed explicitly (below), or the subscription
      // stays 'incomplete' forever despite showing a payment method attached.
      let subscription = await stripeCall('POST', '/subscriptions', stripeSecretKey, {
        customer: existingCustomerId,
        items: [{ price: getPriceId(planType) }],
        ...(paymentMethodId ? { default_payment_method: paymentMethodId } : {}),
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        metadata: { user_id: userId, plan_type: planType },
        expand: ['latest_invoice.payment_intent'],
      });

      const firstInvoicePi = subscription.latest_invoice?.payment_intent;
      // 'requires_payment_method' — no card attached to the PaymentIntent yet.
      // 'requires_confirmation' — default_payment_method WAS attached (via the
      // subscription create call above) but Stripe still needs an explicit
      // confirm; it does not do this automatically on the first invoice.
      const needsConfirm = firstInvoicePi?.status === 'requires_payment_method'
        || firstInvoicePi?.status === 'requires_confirmation';
      if (needsConfirm && paymentMethodId) {
        const confirmed = await stripeCall(
          'POST', `/payment_intents/${firstInvoicePi.id}/confirm`, stripeSecretKey,
          { payment_method: paymentMethodId }
        ).catch((e: Error) => ({ status: 'failed', error: e.message }));

        if (confirmed.status === 'requires_action') {
          // Rare for a test card, but a real one may need 3D Secure — hand
          // the client the PaymentIntent's own client_secret so it can run
          // stripe.confirmCardPayment interactively, separate from the
          // SetupIntent's client_secret it already confirmed.
          return new Response(JSON.stringify({
            requiresAction: true,
            clientSecret: confirmed.client_secret,
            subscriptionId: subscription.id,
          }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        // Re-fetch regardless of confirm outcome — succeeded flips the
        // subscription to 'active'; a decline leaves it 'incomplete', which
        // the status check below already treats as unpaid.
        subscription = await stripeCall('GET', `/subscriptions/${subscription.id}`, stripeSecretKey);
      }

      if (subscription.status === 'incomplete') {
        console.error(`Subscription ${subscription.id} stayed incomplete — first invoice payment did not go through.`);
      }

      // Only grant the paid tier once Stripe confirms the first invoice
      // actually went through — 'active'/'trialing' — never on 'incomplete'
      // (payment failed or needs further 3D Secure action). An incomplete
      // subscription still records its ids/status so cancel-subscription and
      // the billing UI can see it, but the user stays on their current tier
      // (normally free) until stripe-webhook's customer.subscription.updated
      // confirms it went active.
      const paidStates = ['active', 'trialing'];
      const subscriptionTier = TIER_MAPPING[planType] || planType;
      const periodEnd = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null;

      await supabase.from('user_profiles').update({
        ...(paidStates.includes(subscription.status) ? { subscription_tier: subscriptionTier } : {}),
        subscription_status:    subscription.status,
        stripe_subscription_id: subscription.id,
        subscription_ends_at:   periodEnd,
      }).eq('user_id', userId);

      return new Response(JSON.stringify({
        subscriptionId: subscription.id,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
        subscriptionTier,
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // ── STEP 3: Cancel subscription ───────────────────────────────────────
    if (action === 'cancel-subscription') {
      if (!userId) throw new Error('User ID is required');
      const { data: p } = await supabase.from('user_profiles').select('stripe_subscription_id').eq('user_id', userId).single();
      if (!p?.stripe_subscription_id) throw new Error('No active Stripe subscription found');

      await stripeCall('POST', `/subscriptions/${p.stripe_subscription_id}`, stripeSecretKey, {
        cancel_at_period_end: 'true',
      });
      await supabase.from('user_profiles').update({ subscription_status: 'cancelling' }).eq('user_id', userId);

      return new Response(
        JSON.stringify({ success: true, message: 'Subscription will cancel at period end' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    throw new Error("Invalid action. Use 'create-setup-intent', 'activate-subscription', or 'cancel-subscription'");

  } catch (error: any) {
    console.error('Stripe subscription error:', error);
    Sentry.captureException(error);
    await Sentry.flush(2000);
    return new Response(
      JSON.stringify({ error: error.message || 'An unexpected error occurred' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});
