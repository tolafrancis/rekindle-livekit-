// Supabase Edge Function: whatsapp-subscription-webhook
// Deploy with: supabase functions deploy whatsapp-subscription-webhook
//
// Register in Stripe Dashboard ? Webhooks:
//   URL: https://YOUR_PROJECT_REF.supabase.co/functions/v1/whatsapp-subscription-webhook
//   Events:
//     checkout.session.completed
//     customer.subscription.updated
//     customer.subscription.deleted
//     invoice.payment_failed

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

  const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WHATSAPP_WEBHOOK_SECRET');
  const body      = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';

  // Verify signature
  if (STRIPE_WEBHOOK_SECRET) {
    const valid = await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET);
    if (!valid) {
      console.error('Invalid Stripe webhook signature');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } else {
    console.warn('STRIPE_WHATSAPP_WEBHOOK_SECRET not set — skipping signature check (unsafe in production)');
  }

  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  console.log(`WhatsApp subscription webhook: ${event.type}`);

  // -- checkout.session.completed --------------------------------------------
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // Only handle WhatsApp subscription sessions
    if (session.metadata?.type !== 'whatsapp_subscription') {
      return jsonOk({ received: true, skipped: true });
    }

    const ministryId = session.metadata?.ministryId;
    const plan       = session.metadata?.plan;

    if (!ministryId || !plan) {
      console.error('Missing ministryId or plan in session metadata');
      return jsonOk({ received: true });
    }

    if (session.payment_status !== 'paid') {
      console.log(`Session ${session.id} not paid yet — skipping`);
      return jsonOk({ received: true });
    }

    // Idempotency check
    const { data: existing } = await supabase
      .from('ministry_whatsapp_configs')
      .select('plan_status, stripe_session_id')
      .eq('ministry_id', ministryId)
      .single();

    if (existing?.plan_status === 'active' && existing?.stripe_session_id === session.id) {
      console.log(`Session ${session.id} already activated — skipping`);
      return jsonOk({ received: true, duplicate: true });
    }

    // Activate the plan
    await supabase
      .from('ministry_whatsapp_configs')
      .update({
        whatsapp_plan:          plan,
        plan_status:            'active',
        setup_fee_paid:         true,
        stripe_session_id:      session.id,
        stripe_subscription_id: session.subscription ?? null,
        updated_at:             new Date().toISOString(),
      })
      .eq('ministry_id', ministryId);

    console.log(`? WhatsApp ${plan} plan activated for ministry ${ministryId}`);

    // Notify ministry leader via in-app notification
    await supabase
      .from('notifications')
      .insert({
        type:    'whatsapp_plan_activated',
        title:   'WhatsApp Plan Activated!',
        message: `Your ${plan.charAt(0).toUpperCase() + plan.slice(1)} WhatsApp plan is now active. Connect your WhatsApp Business Account to start broadcasting.`,
        target_audience: 'specific',
        ministry_id: ministryId,
        created_at:  new Date().toISOString(),
        is_read:     false,
      })
      .catch(err => console.error('Notification insert failed (non-fatal):', err));
  }

  // -- customer.subscription.updated ----------------------------------------
  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object;
    const ministryId = sub.metadata?.ministryId;
    if (!ministryId) return jsonOk({ received: true });

    const stripeStatus = sub.status; // active | past_due | canceled | trialing etc.
    const planStatus   = mapStripeStatus(stripeStatus);

    await supabase
      .from('ministry_whatsapp_configs')
      .update({
        plan_status:            planStatus,
        stripe_subscription_id: sub.id,
        updated_at:             new Date().toISOString(),
      })
      .eq('ministry_id', ministryId);

    console.log(`Subscription updated for ministry ${ministryId}: ${stripeStatus} ? ${planStatus}`);
  }

  // -- customer.subscription.deleted ----------------------------------------
  if (event.type === 'customer.subscription.deleted') {
    const sub        = event.data.object;
    const ministryId = sub.metadata?.ministryId;
    if (!ministryId) return jsonOk({ received: true });

    await supabase
      .from('ministry_whatsapp_configs')
      .update({
        plan_status: 'cancelled',
        updated_at:  new Date().toISOString(),
      })
      .eq('ministry_id', ministryId);

    console.log(`Subscription cancelled for ministry ${ministryId}`);
  }

  // -- invoice.payment_failed ------------------------------------------------
  if (event.type === 'invoice.payment_failed') {
    const invoice    = event.data.object;
    const ministryId = invoice.subscription_details?.metadata?.ministryId
                    ?? invoice.metadata?.ministryId;
    if (!ministryId) return jsonOk({ received: true });

    await supabase
      .from('ministry_whatsapp_configs')
      .update({
        plan_status: 'past_due',
        updated_at:  new Date().toISOString(),
      })
      .eq('ministry_id', ministryId);

    // Notify ministry about failed payment
    await supabase
      .from('notifications')
      .insert({
        type:        'whatsapp_payment_failed',
        title:       'WhatsApp Payment Failed',
        message:     'Your WhatsApp plan payment failed. Please update your billing details to keep your broadcasts active.',
        ministry_id: ministryId,
        created_at:  new Date().toISOString(),
        is_read:     false,
      })
      .catch(() => {});

    console.log(`Payment failed for ministry ${ministryId}`);
  }

  return jsonOk({ received: true });
});

// -- Helpers -------------------------------------------------------------------

function mapStripeStatus(stripeStatus: string): string {
  const map: Record<string, string> = {
    active:             'active',
    trialing:           'trialing',
    past_due:           'past_due',
    canceled:           'cancelled',
    incomplete:         'pending',
    incomplete_expired: 'cancelled',
    unpaid:             'past_due',
  };
  return map[stripeStatus] ?? 'pending';
}

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

    const signed = `${timestamp}.${payload}`;
    const key    = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sigBuf  = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed));
    const computed = Array.from(new Uint8Array(sigBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return computed === v1;
  } catch {
    return false;
  }
}

function jsonOk(body: object) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/*
DEPLOYMENT:
  supabase functions new whatsapp-subscription-webhook
  supabase functions deploy whatsapp-subscription-webhook

STRIPE WEBHOOK SETUP:
  1. Go to https://dashboard.stripe.com/webhooks
  2. Add endpoint:
     URL: https://YOUR_PROJECT_REF.supabase.co/functions/v1/whatsapp-subscription-webhook
  3. Select events:
     - checkout.session.completed
     - customer.subscription.updated
     - customer.subscription.deleted
     - invoice.payment_failed
  4. Copy signing secret ? set as STRIPE_WHATSAPP_WEBHOOK_SECRET

ENVIRONMENT SECRETS:
  STRIPE_WHATSAPP_WEBHOOK_SECRET   Webhook signing secret from Stripe Dashboard

IMPORTANT — STRIPE SUBSCRIPTION METADATA:
  When creating the Stripe subscription in create-whatsapp-subscription,
  the ministryId and plan must be in subscription_data[metadata]:

    subscription_data[metadata][ministryId] = ministryId
    subscription_data[metadata][plan]       = plan

  Add these to the URLSearchParams in whatsapp-save-credentials-function.ts
  create-whatsapp-subscription action.
*/