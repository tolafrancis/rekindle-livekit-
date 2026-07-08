// Supabase Edge Function: wallet-topup-webhook
// Deploy with: supabase functions deploy wallet-topup-webhook
//
// Register this URL in Stripe Dashboard ? Webhooks:
//   https://YOUR_PROJECT_REF.supabase.co/functions/v1/wallet-topup-webhook
// Events to listen for:
//   checkout.session.completed

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WALLET_WEBHOOK_SECRET');
  const STRIPE_SECRET_KEY     = Deno.env.get('STRIPE_SECRET_KEY');

  if (!STRIPE_SECRET_KEY) {
    return new Response(
      JSON.stringify({ error: 'Stripe not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // -- Verify Stripe signature ----------------------------------------------
  const body      = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';

  if (STRIPE_WEBHOOK_SECRET) {
    const isValid = await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET);
    if (!isValid) {
      console.error('Invalid Stripe webhook signature');
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  } else {
    console.warn('STRIPE_WALLET_WEBHOOK_SECRET not set — skipping signature verification (unsafe in production)');
  }

  // -- Parse event ----------------------------------------------------------
  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // -- Handle checkout.session.completed ------------------------------------
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // Only process wallet top-up sessions (identified by metadata)
    const userId       = session.metadata?.userId;
    const credits      = parseInt(session.metadata?.credits ?? '0', 10);
    const usdAmount    = parseFloat(session.metadata?.usdAmount ?? '0');
    const packageLabel = session.metadata?.packageLabel ?? `${credits} messages`;

    if (!userId || !credits) {
      // Not a wallet top-up session — ignore silently
      return new Response(JSON.stringify({ received: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Only process paid sessions
    if (session.payment_status !== 'paid') {
      console.log(`Session ${session.id} not paid yet (status: ${session.payment_status}), skipping`);
      return new Response(JSON.stringify({ received: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Idempotency check — has this session already been processed?
    const { data: existing } = await supabaseClient
      .from('broadcast_wallet_transactions')
      .select('id, status')
      .eq('stripe_session_id', session.id)
      .single();

    if (existing?.status === 'completed') {
      console.log(`Session ${session.id} already processed — skipping`);
      return new Response(JSON.stringify({ received: true, duplicate: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Credit the wallet
    try {
      await creditWallet(supabaseClient, {
        userId,
        credits,
        usdAmount,
        packageLabel,
        stripeSessionId: session.id,
      });

      console.log(`? Wallet topped up: ${credits} credits for user ${userId} (session ${session.id})`);
    } catch (err: any) {
      console.error('Failed to credit wallet:', err);
      return new Response(
        JSON.stringify({ error: 'Failed to credit wallet', details: err.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  }

  return new Response(
    JSON.stringify({ received: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});

// -- Credit wallet (same logic as create-wallet-topup) ------------------------

async function creditWallet(
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
}

// -- Stripe HMAC-SHA256 signature verification --------------------------------
// Stripe sends: t=<timestamp>,v1=<signature>
// We reconstruct: `${timestamp}.${body}` and verify against the secret.

async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
): Promise<boolean> {
  try {
    const parts     = Object.fromEntries(header.split(',').map(p => p.split('=')));
    const timestamp = parts['t'];
    const v1        = parts['v1'];
    if (!timestamp || !v1) return false;

    const signed    = `${timestamp}.${payload}`;
    const key       = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed));
    const computed  = Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return computed === v1;
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

/*
DEPLOYMENT:

1. supabase functions new wallet-topup-webhook
2. Copy to: supabase/functions/wallet-topup-webhook/index.ts
3. supabase functions deploy wallet-topup-webhook

ENVIRONMENT SECRETS (Supabase Dashboard ? Edge Functions ? Secrets):
  STRIPE_SECRET_KEY              Your Stripe secret key
  STRIPE_WALLET_WEBHOOK_SECRET   Webhook signing secret from Stripe Dashboard

STRIPE WEBHOOK SETUP:
1. Go to https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. URL: https://YOUR_PROJECT_REF.supabase.co/functions/v1/wallet-topup-webhook
4. Events: checkout.session.completed
5. Copy the "Signing secret" and set as STRIPE_WALLET_WEBHOOK_SECRET

IDEMPOTENCY:
The function is idempotent — if Stripe retries the webhook (which it does on
failure), the second call detects the already-completed transaction and skips
without double-crediting the wallet.
*/