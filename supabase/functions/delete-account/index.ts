// Supabase Edge Function: delete-account
// =====================================================================
// Permanently deletes the signed-in user's account (Apple requires apps
// that offer sign-up to offer in-app deletion). Called from the shared
// DeleteAccountSection in packages/features.
//
//   1. Cancels any Stripe subscription immediately, and disables any
//      Paystack subscription, so the user isn't billed after deletion.
//   2. prepare_user_account_deletion() (migration 0422) refuses ministry
//      owners and clears the NO ACTION references that would block the
//      delete.
//   3. auth.admin.deleteUser() removes the user; everything else cascades.
//
// Secrets: STRIPE_SECRET_KEY, PAYSTACK_SECRET_KEY.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as Sentry from 'npm:@sentry/deno@^10';

Sentry.init({ dsn: Deno.env.get('SENTRY_DSN'), defaultIntegrations: false, tracesSampleRate: 0 });
Sentry.setTag('function', 'delete-account');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });

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
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    // Ministry owners are refused before anything is cancelled.
    const { count: ownedMinistries } = await supabase
      .from('ministries')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id);
    if (ownedMinistries) {
      return json({
        error: 'You own a ministry. Transfer it to another leader or close it before deleting your account.',
        code: 'OWNS_MINISTRY',
      }, 409);
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('stripe_subscription_id, paystack_subscription_code, paystack_email_token')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profile?.stripe_subscription_id) {
      if (!stripeSecretKey) throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in Supabase secrets.');
      const cancelResponse = await fetch(
        `https://api.stripe.com/v1/subscriptions/${profile.stripe_subscription_id}`,
        { method: 'DELETE', headers: { 'Authorization': `Bearer ${stripeSecretKey}` } }
      );
      if (!cancelResponse.ok) {
        const cancelData = await cancelResponse.json().catch(() => ({}));
        const message: string = cancelData?.error?.message ?? 'Failed to cancel subscription';
        // Already gone on Stripe's side: nothing left to bill, carry on.
        if (!message.includes('No such subscription')) throw new Error(message);
      }
    }

    if (profile?.paystack_subscription_code && paystackSecretKey) {
      // Best effort: a failed disable is logged, not fatal.
      try {
        const disableResponse = await fetch('https://api.paystack.co/subscription/disable', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${paystackSecretKey}`
          },
          body: JSON.stringify({
            code: profile.paystack_subscription_code,
            token: profile.paystack_email_token || ''
          })
        });
        const disableData = await disableResponse.json();
        if (!disableResponse.ok || !disableData.status) {
          console.warn('Paystack disable failed:', disableData?.message);
        }
      } catch (err) {
        console.warn('Paystack disable failed:', err);
      }
    }

    const { error: prepareError } = await supabase.rpc('prepare_user_account_deletion', {
      p_user_id: user.id,
    });
    if (prepareError) {
      if (prepareError.message?.startsWith('OWNS_MINISTRY')) {
        return json({
          error: 'You own a ministry. Transfer it to another leader or close it before deleting your account.',
          code: 'OWNS_MINISTRY',
        }, 409);
      }
      throw new Error(prepareError.message);
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error(deleteError.message);

    return json({ success: true });

  } catch (error: any) {
    console.error('Delete account error:', error);
    Sentry.captureException(error);
    await Sentry.flush(2000);
    return json({ error: error.message }, 500);
  }
});
