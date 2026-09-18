// Supabase Edge Function: ministry-donation-webhook
// =====================================================================
// Keeps ministry_stripe_connect and ministry_donations in sync with Stripe.
// A SEPARATE endpoint from ministry-billing-webhook on purpose — that one is
// subscription-lifecycle-specific; this one covers a different data model
// (Connect account status + one-time donation payments) with no natural
// overlap, and each Stripe webhook endpoint needs its own signing secret
// regardless, so splitting costs nothing extra.
//
// Handles:
//   account.updated            — Connect account's charges_enabled/
//                                 payouts_enabled/details_submitted changed.
//                                 Matched via metadata.ministry_id, stamped
//                                 on the Account at creation time (see
//                                 ministry-connect-onboarding) — self-
//                                 sufficient and recoverable if the DB insert
//                                 at creation time ever failed after Stripe's
//                                 API call succeeded. stripe_account_id kept
//                                 as a secondary match key.
//   payment_intent.succeeded   — donation PaymentIntent confirmed. Matched
//   payment_intent.payment_failed  via metadata.ministry_id (ignores
//                                 PaymentIntents from stripe-subscription or
//                                 the untouched create-donation consumer
//                                 path, which never carry this key) and
//                                 .stripe_payment_id on ministry_donations.
//
// IMPORTANT — this endpoint must have "Listen to events on connected
// accounts" enabled in the Stripe Dashboard (a separate toggle from base
// registration), or account.updated events never arrive even though the
// endpoint looks correctly configured. payment_intent.* events don't need
// this toggle (they live on the platform account itself).
//
// Register as its own webhook endpoint (classic/snapshot events, not the v2
// "thin" style):
//   https://<project>.supabase.co/functions/v1/ministry-donation-webhook
//
// Secrets: STRIPE_WEBHOOK_SECRET_DONATIONS (this endpoint's OWN signing
// secret — distinct from ministry-billing-webhook's STRIPE_WEBHOOK_SECRET
// and the consumer app's stripe-webhook's STRIPE_WEBHOOK_SECRET_CONSUMER;
// each registered Stripe webhook endpoint has its own unique secret).
// verify_jwt must be OFF (Stripe doesn't send a Supabase JWT).
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const enc = new TextEncoder();

async function hmacHex(key: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function admin() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

Deno.serve(async (req) => {
  try {
    const raw = await req.text();
    const sigHeader = req.headers.get('stripe-signature');
    if (!sigHeader) return new Response('missing signature', { status: 400 });

    // Two separate Stripe destinations feed this one function, each with its
    // own signing secret: STRIPE_WEBHOOK_SECRET_DONATIONS ("Events from: your
    // account" — payment_intent.*) and STRIPE_WEBHOOK_SECRET_DONATIONS_CONNECT
    // ("Events from: Connected accounts" — account.updated). Stripe's newer
    // Workbench UI treats "Connected accounts" as a distinct destination
    // type, not a toggle on a normal endpoint, so one endpoint can't cover
    // both — try whichever secret actually matches this request.
    const secrets = [
      Deno.env.get('STRIPE_WEBHOOK_SECRET_DONATIONS'),
      Deno.env.get('STRIPE_WEBHOOK_SECRET_DONATIONS_CONNECT'),
    ].filter((s): s is string => !!s);
    if (secrets.length === 0) return new Response('no secret configured', { status: 500 });

    const parts = Object.fromEntries(sigHeader.split(',').map((s) => s.split('=')));
    let verified = false;
    for (const secret of secrets) {
      const expected = await hmacHex(secret, `${parts.t}.${raw}`);
      if (expected === parts.v1) { verified = true; break; }
    }
    if (!verified) return new Response('bad signature', { status: 400 });

    const event = JSON.parse(raw);
    const obj = event.data?.object ?? {};
    const db = admin();

    if (event.type === 'account.updated') {
      const ministryId = obj.metadata?.ministry_id;
      if (!ministryId) return new Response('ignored (no ministry_id)', { status: 200 });

      const chargesEnabled = !!obj.charges_enabled;
      const payoutsEnabled = !!obj.payouts_enabled;
      const detailsSubmitted = !!obj.details_submitted;

      const { data: existing } = await db
        .from('ministry_stripe_connect').select('onboarding_completed_at')
        .eq('stripe_account_id', obj.id).maybeSingle();

      await db.from('ministry_stripe_connect').upsert({
        ministry_id: ministryId,
        stripe_account_id: obj.id,
        charges_enabled: chargesEnabled,
        payouts_enabled: payoutsEnabled,
        details_submitted: detailsSubmitted,
        disabled_reason: obj.requirements?.disabled_reason ?? null,
        currently_due: obj.requirements?.currently_due ?? [],
        ...(chargesEnabled && payoutsEnabled && !existing?.onboarding_completed_at
          ? { onboarding_completed_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'stripe_account_id' });

      return new Response('ok', { status: 200 });
    }

    if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
      const ministryId = obj.metadata?.ministry_id;
      if (!ministryId || obj.metadata?.type !== 'donation') {
        return new Response('ignored (not a ministry donation)', { status: 200 });
      }

      const status = event.type === 'payment_intent.succeeded' ? 'completed' : 'failed';
      await db.from('ministry_donations')
        .update({ payment_status: status, status })
        .eq('stripe_payment_id', obj.id);

      return new Response('ok', { status: 200 });
    }

    return new Response('ignored', { status: 200 });

  } catch (err: any) {
    console.error('Ministry donation webhook error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
