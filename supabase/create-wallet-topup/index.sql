// Supabase Edge Function: create-wallet-topup
// Deploy with: supabase functions deploy create-wallet-topup

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TopUpRequest {
  userId: string;
  credits: number;        // number of messages to purchase
  usdAmount: number;      // total price in USD (e.g. 15.00)
  packageLabel: string;   // e.g. "500 messages"
  successUrl: string;
  cancelUrl: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      userId,
      credits,
      usdAmount,
      packageLabel,
      successUrl,
      cancelUrl,
    }: TopUpRequest = await req.json();

    // -- Validation -----------------------------------------------------------
    if (!userId || !credits || !usdAmount || !successUrl || !cancelUrl) {
      return new Response(
        JSON.stringify({ error: 'userId, credits, usdAmount, successUrl and cancelUrl are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (credits <= 0 || usdAmount <= 0) {
      return new Response(
        JSON.stringify({ error: 'credits and usdAmount must be positive' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

    // -- Dev / simulation mode ------------------------------------------------
    if (!STRIPE_SECRET_KEY) {
      console.warn('STRIPE_SECRET_KEY not set — running in simulation mode');

      // In dev mode, credit the wallet immediately without payment
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { autoRefreshToken: false, persistSession: false } },
      );

      await creditWallet(supabaseClient, {
        userId,
        credits,
        usdAmount,
        packageLabel,
        stripeSessionId: 'sim_' + crypto.randomUUID(),
      });

      // Return a fake checkout URL that will trigger the success handler
      const fakeUrl = `${successUrl}&simulated=true`;
      return new Response(
        JSON.stringify({
          checkoutUrl: fakeUrl,
          simulated: true,
          message: 'Stripe not configured — credits added immediately (dev mode)',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // -- Create Stripe Checkout Session ---------------------------------------
    const amountCents = Math.round(usdAmount * 100);

    const stripeBody = new URLSearchParams({
      'mode': 'payment',
      'success_url': successUrl,
      'cancel_url': cancelUrl,
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(amountCents),
      'line_items[0][price_data][product_data][name]': `WhatsApp Broadcast Credits — ${packageLabel}`,
      'line_items[0][price_data][product_data][description]':
        `${credits.toLocaleString()} send-only WhatsApp messages at $${(usdAmount / credits).toFixed(4)}/msg. Credits never expire.`,
      'line_items[0][quantity]': '1',
      'metadata[userId]': userId,
      'metadata[credits]': String(credits),
      'metadata[usdAmount]': String(usdAmount),
      'metadata[packageLabel]': packageLabel,
      'payment_intent_data[metadata][userId]': userId,
      'payment_intent_data[metadata][credits]': String(credits),
    });

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: stripeBody.toString(),
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error('Stripe session creation failed:', session);
      throw new Error(session?.error?.message ?? 'Failed to create Stripe checkout session');
    }

    // Save a pending transaction so the webhook can reconcile it
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    await supabaseClient
      .from('broadcast_wallet_transactions')
      .insert({
        user_id: userId,
        type: 'topup',
        credits,
        usd_amount: usdAmount,
        description: `Top-up: ${packageLabel}`,
        stripe_session_id: session.id,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      .catch(err => console.error('Failed to log pending transaction:', err));

    return new Response(
      JSON.stringify({ checkoutUrl: session.url, sessionId: session.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error: any) {
    console.error('create-wallet-topup error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

// -- Shared helper (also used by webhook) -------------------------------------

export async function creditWallet(
  supabaseClient: ReturnType<typeof createClient>,
  opts: {
    userId: string;
    credits: number;
    usdAmount: number;
    packageLabel: string;
    stripeSessionId: string;
  },
) {
  const { userId, credits, usdAmount, packageLabel, stripeSessionId } = opts;

  // Upsert wallet row (creates if missing)
  const { data: existing } = await supabaseClient
    .from('broadcast_wallets')
    .select('id, balance_credits, total_purchased')
    .eq('user_id', userId)
    .single();

  if (existing) {
    await supabaseClient
      .from('broadcast_wallets')
      .update({
        balance_credits: existing.balance_credits + credits,
        total_purchased: existing.total_purchased + credits,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  } else {
    await supabaseClient
      .from('broadcast_wallets')
      .insert({
        user_id: userId,
        balance_credits: credits,
        total_purchased: credits,
        total_used: 0,
        updated_at: new Date().toISOString(),
      });
  }

  // Mark transaction as completed (or insert if not pre-created)
  const { data: pending } = await supabaseClient
    .from('broadcast_wallet_transactions')
    .select('id')
    .eq('stripe_session_id', stripeSessionId)
    .single();

  if (pending) {
    await supabaseClient
      .from('broadcast_wallet_transactions')
      .update({ status: 'completed' })
      .eq('stripe_session_id', stripeSessionId);
  } else {
    await supabaseClient
      .from('broadcast_wallet_transactions')
      .insert({
        user_id: userId,
        type: 'topup',
        credits,
        usd_amount: usdAmount,
        description: `Top-up: ${packageLabel}`,
        stripe_session_id: stripeSessionId,
        status: 'completed',
        created_at: new Date().toISOString(),
      });
  }

  console.log(`Credited ${credits} WhatsApp credits to user ${userId}. Session: ${stripeSessionId}`);
}

/*
DEPLOYMENT INSTRUCTIONS:

1. supabase functions new create-wallet-topup
2. Copy to: supabase/functions/create-wallet-topup/index.ts

3. Set environment secrets:
   - STRIPE_SECRET_KEY   Your Stripe secret key (sk_live_... or sk_test_...)

4. supabase functions deploy create-wallet-topup

STRIPE SETUP:
1. Get your secret key from https://dashboard.stripe.com/apikeys
2. Set STRIPE_SECRET_KEY in Supabase Dashboard ? Edge Functions ? Secrets

No webhook required for checkout.session.completed — credits are applied
by the wallet-topup-webhook function (deploy separately).

DEV MODE:
If STRIPE_SECRET_KEY is not set, the function credits the wallet immediately
without payment and returns a simulated checkout URL. Safe for local testing.
*/