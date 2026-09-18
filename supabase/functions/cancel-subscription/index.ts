// Supabase Edge Function: cancel-subscription
// =====================================================================
// Cancels the signed-in consumer user's subscription — Stripe or Paystack,
// selected by the 'provider' request field (see handleCancelSubscription in
// packages/features/src/components/SubscriptionManager.tsx). The Stripe
// branch calls Stripe's API directly — the untracked version of this
// function (supabase/cancel-subscription/index.sql) routed through a
// third-party proxy (stripe.gateway.fastrouter.io, GATEWAY_API_KEY) that
// nothing else in this codebase uses; rewritten here to match the
// direct-Stripe-API pattern used everywhere else. The Paystack branch
// already called Paystack's own API directly and is unchanged.
//
// Secrets: STRIPE_SECRET_KEY, PAYSTACK_SECRET_KEY.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as Sentry from 'npm:@sentry/deno@^10';

Sentry.init({ dsn: Deno.env.get('SENTRY_DSN'), defaultIntegrations: false, tracesSampleRate: 0 });
Sentry.setTag('function', 'cancel-subscription');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    const { provider, immediate = false } = await req.json();

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('stripe_subscription_id, paystack_subscription_code, paystack_email_token, subscription_ends_at')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) throw new Error('User profile not found');

    if (provider === 'stripe' && profile.stripe_subscription_id) {
      if (!stripeSecretKey) throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in Supabase secrets.');

      if (immediate) {
        const cancelResponse = await fetch(
          `https://api.stripe.com/v1/subscriptions/${profile.stripe_subscription_id}`,
          { method: 'DELETE', headers: { 'Authorization': `Bearer ${stripeSecretKey}` } }
        );
        const cancelData = await cancelResponse.json();
        if (!cancelResponse.ok) throw new Error(cancelData?.error?.message ?? 'Failed to cancel subscription');
      } else {
        const cancelResponse = await fetch(
          `https://api.stripe.com/v1/subscriptions/${profile.stripe_subscription_id}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${stripeSecretKey}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ cancel_at_period_end: 'true' }),
          }
        );
        const cancelData = await cancelResponse.json();
        if (!cancelResponse.ok) throw new Error(cancelData?.error?.message ?? 'Failed to cancel subscription');
      }

      if (immediate) {
        await supabase
          .from('user_profiles')
          .update({
            subscription_tier: 'free',
            subscription_status: 'cancelled',
            stripe_subscription_id: null,
            subscription_ends_at: null
          })
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('user_profiles')
          .update({
            subscription_status: 'cancelled'
          })
          .eq('user_id', user.id);
      }

      return new Response(JSON.stringify({
        success: true,
        message: immediate
          ? 'Subscription cancelled immediately'
          : `Subscription will be cancelled at the end of the billing period (${new Date(profile.subscription_ends_at).toLocaleDateString()})`
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    } else if (provider === 'paystack' && profile.paystack_subscription_code) {
      if (!paystackSecretKey) throw new Error("Paystack secret key not configured");

      const disableResponse = await fetch(
        `https://api.paystack.co/subscription/disable`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${paystackSecretKey}`
          },
          body: JSON.stringify({
            code: profile.paystack_subscription_code,
            token: profile.paystack_email_token || ''
          })
        }
      );

      const disableData = await disableResponse.json();
      if (!disableResponse.ok || !disableData.status) {
        throw new Error(disableData.message || 'Failed to cancel subscription');
      }

      if (immediate) {
        await supabase
          .from('user_profiles')
          .update({
            subscription_tier: 'free',
            subscription_status: 'cancelled',
            paystack_subscription_code: null,
            subscription_ends_at: null
          })
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('user_profiles')
          .update({
            subscription_status: 'cancelled'
          })
          .eq('user_id', user.id);
      }

      return new Response(JSON.stringify({
        success: true,
        message: immediate
          ? 'Subscription cancelled immediately'
          : 'Subscription will be cancelled at the end of the billing period'
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    throw new Error('No active subscription found');

  } catch (error: any) {
    console.error('Cancel subscription error:', error);
    Sentry.captureException(error);
    await Sentry.flush(2000);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
