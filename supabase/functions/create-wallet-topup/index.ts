// Supabase Edge Function: create-wallet-topup
// =====================================================================
// Starts a Stripe Checkout for a pack of WhatsApp broadcast credits (the
// "Top up" button in BroadcastWallet.tsx). wallet-topup-webhook adds the
// credits once Stripe confirms payment, reading them from the session
// metadata written here.
//
// Mirrored from the untracked supabase/create-wallet-topup/index.sql, which
// was deployed with verify_jwt off and trusted the request body for
// everything: whose wallet, how many credits and what price. Anyone could
// buy any number of credits for any amount, for any user, and with
// STRIPE_SECRET_KEY unset its "dev mode" added them for free. Credits now
// pay for messages on Rekindle's own WhatsApp number, so:
//   - the wallet is always the signed-in caller's;
//   - credits and price come from PACKAGES below, never the client;
//   - no Stripe key means a clear error, never free credits.
//
// Request:  POST { credits, successUrl, cancelUrl }   (credits picks a package)
// Response: { checkoutUrl, sessionId }
//
// Secrets: STRIPE_SECRET_KEY.
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Must match TOP_UP_PACKAGES in packages/ministry/src/components/BroadcastWallet.tsx.
const PACKAGES: Record<number, { usd: number; label: string }> = {
  100:   { usd: 3,   label: '100 messages' },
  500:   { usd: 15,  label: '500 messages' },
  1000:  { usd: 30,  label: '1,000 messages' },
  3000:  { usd: 90,  label: '3,000 messages' },
  5000:  { usd: 150, label: '5,000 messages' },
  10000: { usd: 300, label: '10,000 messages' },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { credits, successUrl, cancelUrl } = await req.json();

    const pkg = PACKAGES[Number(credits)];
    if (!pkg) return json({ error: 'Unknown credit package' }, 400);
    if (!successUrl || !cancelUrl) return json({ error: 'successUrl and cancelUrl are required' }, 400);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const userId = user.id;

    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET_KEY) {
      return json({ error: 'Payments are not configured yet. Please try again later.' }, 500);
    }

    const creditCount = Number(credits);
    const usdAmount = pkg.usd;
    const packageLabel = pkg.label;

    const stripeBody = new URLSearchParams({
      'mode': 'payment',
      'success_url': successUrl,
      'cancel_url': cancelUrl,
      'client_reference_id': userId,
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(Math.round(usdAmount * 100)),
      'line_items[0][price_data][product_data][name]': `WhatsApp Broadcast Credits — ${packageLabel}`,
      'line_items[0][price_data][product_data][description]':
        `${creditCount.toLocaleString()} WhatsApp messages at $${(usdAmount / creditCount).toFixed(4)}/msg. Credits never expire.`,
      'line_items[0][quantity]': '1',
      'metadata[userId]': userId,
      'metadata[credits]': String(creditCount),
      'metadata[usdAmount]': String(usdAmount),
      'metadata[packageLabel]': packageLabel,
      'payment_intent_data[metadata][userId]': userId,
      'payment_intent_data[metadata][credits]': String(creditCount),
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
      return json({ error: session?.error?.message ?? 'Failed to create Stripe checkout session' }, 400);
    }

    // Pending row so wallet-topup-webhook can reconcile it.
    const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: txError } = await admin
      .from('broadcast_wallet_transactions')
      .insert({
        user_id: userId,
        type: 'topup',
        credits: creditCount,
        usd_amount: usdAmount,
        description: `Top-up: ${packageLabel}`,
        stripe_session_id: session.id,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
    if (txError) console.error('Failed to log pending transaction:', txError);

    return json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (error: any) {
    console.error('create-wallet-topup error:', error);
    return json({ error: error.message || 'Unexpected error' }, 500);
  }
});
