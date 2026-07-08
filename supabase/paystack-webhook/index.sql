// Supabase Edge Function: paystack-webhook
// Deploy with: supabase functions deploy paystack-webhook
//
// Set in Supabase secrets:
//   PAYSTACK_SECRET_KEY   = sk_live_xxx
//
// Register this webhook URL in Paystack Dashboard → Settings → Webhooks:
//   https://<your-project>.supabase.co/functions/v1/paystack-webhook
//
// Events handled:
//   charge.success          — one-time payment or first subscription charge
//   subscription.create     — new recurring subscription created
//   subscription.disable    — subscription cancelled or disabled
//   invoice.payment_failed  — recurring charge failed

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TIER_MAPPING: Record<string, string> = {
  'premium':       'premium',
  'premium_plus':  'premium_plus',
  'family':        'ministry',
  'ministry_plus': 'ministry_plus',
};

const WELCOME_CREDITS: Record<string, number> = {
  'family':        50,
  'ministry_plus': 150,
};

async function grantWelcomeCredits(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  planType: string,
): Promise<void> {
  const credits = WELCOME_CREDITS[planType];
  if (!credits) return;

  const { data: wallet } = await supabase
    .from('broadcast_wallets')
    .select('id, balance_credits, total_purchased, welcome_credits_granted')
    .eq('user_id', userId)
    .maybeSingle();

  if (wallet?.welcome_credits_granted) return;

  if (wallet) {
    await supabase.from('broadcast_wallets').update({
      balance_credits:         wallet.balance_credits + credits,
      total_purchased:         wallet.total_purchased + credits,
      welcome_credits_granted: true,
      updated_at:              new Date().toISOString(),
    }).eq('id', wallet.id);
  } else {
    await supabase.from('broadcast_wallets').insert({
      user_id:                 userId,
      balance_credits:         credits,
      total_purchased:         credits,
      total_used:              0,
      welcome_credits_granted: true,
    });
  }

  await supabase.from('broadcast_wallet_transactions').insert({
    user_id:     userId,
    type:        'welcome_credit',
    credits,
    usd_amount:  0,
    description: `Welcome gift: ${credits} free WhatsApp credits on first subscription`,
    status:      'completed',
    created_at:  new Date().toISOString(),
  });

  console.log(`Granted ${credits} welcome credits to user ${userId}`);
}

// Verify Paystack webhook signature (HMAC-SHA512)
async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-512' },
      false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
    const expected = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    return expected === signature;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const paystackSecret = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const payload   = await req.text();
    const signature = req.headers.get('x-paystack-signature') ?? '';

    // Verify signature
    if (paystackSecret) {
      const valid = await verifySignature(payload, signature, paystackSecret);
      if (!valid) {
        console.error('Invalid Paystack webhook signature');
        return new Response('Invalid signature', { status: 401 });
      }
    }

    const event = JSON.parse(payload);
    console.log(`Paystack webhook: ${event.event}`);

    switch (event.event) {

      // ── Successful charge (one-time or first subscription payment) ──────
      case 'charge.success': {
        const data = event.data;
        const meta = data.metadata || {};
        const userId   = meta.user_id;
        const planType = meta.plan_type;

        if (!userId || !planType) {
          console.warn('Missing user_id or plan_type in charge metadata');
          break;
        }

        const subscriptionTier = TIER_MAPPING[planType] || planType;
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);

        await supabase.from('user_profiles').update({
          subscription_tier:       subscriptionTier,
          subscription_status:     'active',
          paystack_customer_code:  data.customer?.customer_code || null,
          paystack_reference:      data.reference,
          pending_plan_type:       null,
          subscription_ends_at:    expiresAt.toISOString(),
        }).eq('user_id', userId);

        // Update donation record if applicable
        await supabase.from('donations')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('payment_reference', data.reference)
          .eq('payment_provider', 'paystack');

        // Grant one-time welcome credits on first ministry subscription
        await grantWelcomeCredits(supabase, userId, planType);

        console.log(`Charge success for user ${userId} → ${subscriptionTier}`);
        break;
      }

      // ── Recurring subscription created ─────────────────────────────────
      case 'subscription.create': {
        const data = event.data;
        // Paystack doesn't always include user metadata in subscription events
        // Look up user by customer code
        const customerCode = data.customer?.customer_code;
        if (!customerCode) break;

        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('user_id, pending_plan_type')
          .eq('paystack_customer_code', customerCode)
          .maybeSingle();

        if (!profileData?.user_id) break;

        const planType = profileData.pending_plan_type || 'premium';
        const subscriptionTier = TIER_MAPPING[planType] || planType;
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);

        await supabase.from('user_profiles').update({
          subscription_tier:          subscriptionTier,
          subscription_status:        'active',
          paystack_subscription_code: data.subscription_code,
          pending_plan_type:          null,
          subscription_ends_at:       expiresAt.toISOString(),
        }).eq('user_id', profileData.user_id);

        console.log(`Subscription created for user ${profileData.user_id} → ${subscriptionTier}`);
        break;
      }

      // ── Subscription disabled / cancelled ──────────────────────────────
      case 'subscription.disable': {
        const data = event.data;
        const customerCode = data.customer?.customer_code;
        if (!customerCode) break;

        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('user_id')
          .eq('paystack_customer_code', customerCode)
          .maybeSingle();

        if (!profileData?.user_id) break;

        await supabase.from('user_profiles').update({
          subscription_tier:          'free',
          subscription_status:        'cancelled',
          paystack_subscription_code: null,
          subscription_ends_at:       null,
        }).eq('user_id', profileData.user_id);

        console.log(`Subscription disabled for user ${profileData.user_id} — downgraded to free`);
        break;
      }

      // ── Invoice payment failed ─────────────────────────────────────────
      case 'invoice.payment_failed': {
        const data = event.data;
        const customerCode = data.customer?.customer_code;
        if (!customerCode) break;

        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('user_id')
          .eq('paystack_customer_code', customerCode)
          .maybeSingle();

        if (!profileData?.user_id) break;

        await supabase.from('user_profiles').update({
          subscription_status: 'past_due',
        }).eq('user_id', profileData.user_id);

        console.log(`Payment failed for user ${profileData.user_id} — marked past_due`);
        break;
      }

      default:
        console.log(`Unhandled Paystack event: ${event.event}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (err: any) {
    console.error('Paystack webhook error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
