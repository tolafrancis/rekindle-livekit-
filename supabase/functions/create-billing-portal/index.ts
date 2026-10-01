// Supabase Edge Function: create-billing-portal
// =====================================================================
// Opens a Stripe-hosted Billing Portal session for the signed-in consumer
// user so they can update their card / view invoices. Calls Stripe's API
// directly — the untracked version of this function (supabase/
// create-billing-portal/index.sql) routed through a third-party proxy
// (stripe.gateway.fastrouter.io, GATEWAY_API_KEY) that nothing else in this
// codebase uses; rewritten here to match the direct-Stripe-API pattern used
// everywhere else (see stripe-subscription, ministry-checkout).
//
// Secrets: STRIPE_SECRET_KEY.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as Sentry from 'npm:@sentry/deno@^10';

Sentry.init({ dsn: Deno.env.get('SENTRY_DSN'), defaultIntegrations: false, tracesSampleRate: 0 });
Sentry.setTag('function', 'create-billing-portal');

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
    if (!stripeSecretKey) throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in Supabase secrets.');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    const { returnUrl } = await req.json();

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile?.stripe_customer_id) {
      throw new Error('No Stripe customer found. Please contact support.');
    }

    const portalResponse = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: profile.stripe_customer_id,
        return_url: returnUrl || 'https://rekindlebc.com/subscription',
      }),
    });

    const portalData = await portalResponse.json();
    if (!portalResponse.ok) {
      throw new Error(portalData?.error?.message ?? 'Failed to create billing portal session');
    }

    return new Response(JSON.stringify({
      url: portalData.url
    }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  } catch (error: any) {
    console.error('Billing portal error:', error);
    Sentry.captureException(error);
    await Sentry.flush(2000);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
