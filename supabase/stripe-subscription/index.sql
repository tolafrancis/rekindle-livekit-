// Supabase Edge Function: stripe-subscription
// Deploy with: supabase functions deploy stripe-subscription
//
// Uses the official Stripe API directly — no third-party proxy needed.
// Requires STRIPE_SECRET_KEY in Supabase secrets.
//
// Price IDs are read from env vars so you can update without redeploying:
//   STRIPE_PRICE_PREMIUM          = price_xxx
//   STRIPE_PRICE_PREMIUM_PLUS     = price_xxx
//   STRIPE_PRICE_FAMILY           = price_xxx
//   STRIPE_PRICE_MINISTRY_PLUS    = price_xxx

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const TIER_MAPPING: Record<string, string> = {
  'premium':       'premium',
  'premium_plus':  'premium_plus',
  'family':        'ministry',
  'ministry_plus': 'ministry_plus',
};

function getPriceId(planType: string): string {
  const fromEnv = Deno.env.get(`STRIPE_PRICE_${planType.toUpperCase()}`);
  if (fromEnv) return fromEnv;
  const fallbacks: Record<string, string> = {
    // premium/premium_plus (Individual Partner tiers) were repriced to
    // $10/$18 — the old fallback IDs point to Stripe Price objects for the
    // previous $9.99/$19.99 amounts (Stripe Prices are immutable), so both
    // are intentionally blank until real $10/$18 Price IDs are created and
    // set as STRIPE_PRICE_PREMIUM / STRIPE_PRICE_PREMIUM_PLUS secrets.
    'premium':       '',
    'premium_plus':  '',
    'family':        'price_1Sm5c7HaTSTkefainOuS8sZy',
    'ministry_plus': 'price_1Sm5c7HaTSTkefaiQogiqvaB',
  };
  return fallbacks[planType] ?? '';
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

    const { action, email, name, planType, customerId: existingCustomerId, userId } = await req.json();

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

      const subscription = await stripeCall('POST', '/subscriptions', stripeSecretKey, {
        customer: existingCustomerId,
        items: [{ price: getPriceId(planType) }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        metadata: { user_id: userId, plan_type: planType },
      });

      const subscriptionTier = TIER_MAPPING[planType] || planType;
      const periodEnd = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null;

      await supabase.from('user_profiles').update({
        subscription_tier:      subscriptionTier,
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
    return new Response(
      JSON.stringify({ error: error.message || 'An unexpected error occurred' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});
