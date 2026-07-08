// Supabase Edge Function: stripe-webhook
// Deploy with: supabase functions deploy stripe-webhook
//
// Set in Supabase secrets:
//   STRIPE_SECRET_KEY        = sk_live_xxx
//   STRIPE_WEBHOOK_SECRET    = whsec_xxx  (from Stripe Dashboard → Webhooks)
//
// Register this webhook URL in Stripe Dashboard → Developers → Webhooks:
//   https://<your-project>.supabase.co/functions/v1/stripe-webhook
//
// Events to listen for:
//   customer.subscription.updated
//   customer.subscription.deleted
//   invoice.payment_succeeded
//   invoice.payment_failed

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TIER_MAPPING: Record<string, string> = {
  'premium':             'premium',
  'premium_plus':        'premium_plus',
  'family':              'ministry',
  'ministry_plus':       'ministry_plus',
  'ministry_starter':    'ministry_starter',
  'ministry_growth':     'ministry_growth',
  'ministry_enterprise': 'ministry_enterprise',
};

const WELCOME_CREDITS: Record<string, number> = {
  'family':              50,   // Legacy Ministry plan
  'ministry_plus':       150,  // Legacy Ministry Plus plan
  'ministry_starter':    50,   // New Starter plan
  'ministry_growth':     150,  // New Growth plan
  'ministry_enterprise': 300,  // New Enterprise plan
};

// Grant one-time welcome credits to ministry plan subscribers
async function grantWelcomeCredits(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  planType: string,
): Promise<void> {
  const credits = WELCOME_CREDITS[planType];
  if (!credits) return; // Not a ministry plan

  // Get or create wallet
  const { data: wallet } = await supabase
    .from('broadcast_wallets')
    .select('id, balance_credits, total_purchased, welcome_credits_granted')
    .eq('user_id', userId)
    .maybeSingle();

  // Already granted — never grant twice
  if (wallet?.welcome_credits_granted) return;

  if (wallet) {
    await supabase
      .from('broadcast_wallets')
      .update({
        balance_credits:          wallet.balance_credits + credits,
        total_purchased:          wallet.total_purchased + credits,
        welcome_credits_granted:  true,
        updated_at:               new Date().toISOString(),
      })
      .eq('id', wallet.id);
  } else {
    // Create wallet with welcome credits
    await supabase.from('broadcast_wallets').insert({
      user_id:                  userId,
      balance_credits:          credits,
      total_purchased:          credits,
      total_used:               0,
      welcome_credits_granted:  true,
    });
  }

  // Log the transaction
  await supabase.from('broadcast_wallet_transactions').insert({
    user_id:     userId,
    type:        'welcome_credit',
    credits:     credits,
    usd_amount:  0,
    description: `Welcome gift: ${credits} free WhatsApp credits on first subscription`,
    status:      'completed',
    created_at:  new Date().toISOString(),
  });

  console.log(`Granted ${credits} welcome credits to user ${userId}`);
}

// Verify Stripe webhook signature
async function verifyWebhookSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = sigHeader.split(',');
    const ts    = parts.find(p => p.startsWith('t='))?.split('=')[1];
    const v1    = parts.find(p => p.startsWith('v1='))?.split('=')[1];
    if (!ts || !v1) return false;

    const signed = `${ts}.${payload}`;
    const enc    = new TextEncoder();
    const key    = await crypto.subtle.importKey(
      'raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signed));
    const expected = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    return expected === v1;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const stripeKey     = Deno.env.get('STRIPE_SECRET_KEY');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const payload   = await req.text();
    const sigHeader = req.headers.get('stripe-signature') ?? '';

    // Verify signature if secret is configured
    if (webhookSecret) {
      const valid = await verifyWebhookSignature(payload, sigHeader, webhookSecret);
      if (!valid) {
        console.error('Invalid webhook signature');
        return new Response('Invalid signature', { status: 401 });
      }
    }

    const event = JSON.parse(payload);
    console.log(`Stripe webhook: ${event.type}`);

    switch (event.type) {

      // ── Subscription updated (renewal, plan change, status change) ──────
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const userId  = sub.metadata?.user_id;
        const planType = sub.metadata?.plan_type;

        if (!userId) {
          console.warn('No user_id in subscription metadata', sub.id);
          break;
        }

        const subscriptionTier = TIER_MAPPING[planType] || planType || 'free';
        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;

        await supabase.from('user_profiles').update({
          subscription_tier:      sub.status === 'active' ? subscriptionTier : 'free',
          subscription_status:    sub.status,
          stripe_subscription_id: sub.id,
          subscription_ends_at:   periodEnd,
        }).eq('user_id', userId);

        console.log(`Updated subscription for user ${userId}: ${sub.status} → ${subscriptionTier}`);
        break;
      }

      // ── Subscription deleted / expired ────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub    = event.data.object;
        const userId = sub.metadata?.user_id;
        if (!userId) break;

        await supabase.from('user_profiles').update({
          subscription_tier:      'free',
          subscription_status:    'cancelled',
          stripe_subscription_id: null,
          subscription_ends_at:   null,
        }).eq('user_id', userId);

        console.log(`Subscription cancelled for user ${userId} — downgraded to free`);
        break;
      }

      // ── Invoice payment succeeded (renewal confirmed) ─────────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        // Only act on subscription invoices (not one-off)
        if (!invoice.subscription) break;

        // Fetch the subscription to get user metadata
        const subRes = await fetch(
          `https://api.stripe.com/v1/subscriptions/${invoice.subscription}`,
          { headers: { 'Authorization': `Bearer ${stripeKey}` } }
        );
        const sub = await subRes.json();
        const userId = sub.metadata?.user_id;
        const planType = sub.metadata?.plan_type;
        if (!userId) break;

        const subscriptionTier = TIER_MAPPING[planType] || planType || 'free';
        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;

        await supabase.from('user_profiles').update({
          subscription_tier:   subscriptionTier,
          subscription_status: 'active',
          subscription_ends_at: periodEnd,
        }).eq('user_id', userId);

        // Grant one-time welcome credits on first ministry subscription
        await grantWelcomeCredits(supabase, userId, planType);

        console.log(`Payment succeeded for user ${userId} — plan renewed to ${periodEnd}`);
        break;
      }

      // ── Invoice payment failed ─────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (!invoice.subscription) break;

        const subRes = await fetch(
          `https://api.stripe.com/v1/subscriptions/${invoice.subscription}`,
          { headers: { 'Authorization': `Bearer ${stripeKey}` } }
        );
        const sub = await subRes.json();
        const userId = sub.metadata?.user_id;
        if (!userId) break;

        await supabase.from('user_profiles').update({
          subscription_status: 'past_due',
        }).eq('user_id', userId);

        console.log(`Payment failed for user ${userId} — marked past_due`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (err: any) {
    console.error('Webhook error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
