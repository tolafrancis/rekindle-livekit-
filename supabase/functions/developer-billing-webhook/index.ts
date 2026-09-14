// supabase/functions/developer-billing-webhook/index.ts
// =====================================================================
// Activates the standalone Interactive Meetings API's "pay-as-you-go"
// plan (migration 0347) once a developer-api-keys' 'enable-billing'
// checkout session actually completes. A SEPARATE endpoint from
// ministry-billing-webhook on purpose — that one explicitly only acts on
// events carrying metadata.ministry_id (see its own header comment); this
// one only acts on metadata.developer_account = 'true'. Register this as
// its own webhook endpoint in the Stripe dashboard alongside the others.
//
// Stripe only — this plan has no Paystack equivalent (same disclosed gap
// as the Live Translation add-on's Phase 2: Paystack has no metered-
// subscription-item mechanism). A Nigerian developer can still sign up
// and use the free plan; pay-as-you-go is Stripe-only for now.
//
// Handles:
//   checkout.session.completed — stores stripe_customer_id +
//     stripe_subscription_item_id (the METERED line item's id, fetched
//     from the resulting subscription — Checkout's own session object
//     doesn't carry subscription_item ids) and flips plan to
//     'pay_as_you_go'.
//   customer.subscription.deleted — falls back to the free plan; the
//     account keeps working, just loses pay-as-you-go's higher limits.
//
// Secrets: STRIPE_WEBHOOK_SECRET (register a distinct one for THIS
// endpoint in the Stripe dashboard — don't reuse ministry-billing-
// webhook's, they're different endpoint URLs), STRIPE_SECRET_KEY (to look
// up the subscription's item id after checkout.session.completed).
// verify_jwt must be OFF (Stripe doesn't send a Supabase JWT).
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
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

serve(async (req) => {
  try {
    const raw = await req.text();
    const sig = req.headers.get('stripe-signature');
    if (!sig) return new Response('missing signature', { status: 400 });

    const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!secret) return new Response('no secret', { status: 500 });
    const parts = Object.fromEntries(sig.split(',').map((s) => s.split('=')));
    const expected = await hmacHex(secret, `${parts.t}.${raw}`);
    if (expected !== parts.v1) return new Response('bad signature', { status: 400 });

    const event = JSON.parse(raw);
    const obj = event.data?.object ?? {};
    const meta = obj.metadata ?? {};

    if (event.type === 'checkout.session.completed') {
      if (meta.developer_account !== 'true') return new Response('ignored (not a developer account)', { status: 200 });
      const ownerUserId = meta.owner_user_id;
      if (!ownerUserId) return new Response('ignored (no owner_user_id)', { status: 200 });

      const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
      const subscriptionId = obj.subscription as string | undefined;
      if (!STRIPE_KEY || !subscriptionId) return new Response('ignored (no subscription)', { status: 200 });

      // Checkout Sessions don't carry the subscription's line-item ids
      // directly — the metered price's subscription_item.id (what usage
      // records get reported against) only exists once the subscription
      // itself is created. Fetch it.
      const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
        headers: { Authorization: `Bearer ${STRIPE_KEY}` },
      });
      const sub = await subRes.json();
      const itemId = sub?.items?.data?.[0]?.id as string | undefined;
      if (!subRes.ok || !itemId) {
        console.error('[developer-billing-webhook] could not resolve subscription item id', sub);
        return new Response('could not resolve subscription item', { status: 502 });
      }

      const { error } = await admin()
        .from('developer_accounts')
        .update({
          plan: 'pay_as_you_go',
          stripe_customer_id: obj.customer ?? null,
          stripe_subscription_item_id: itemId,
        })
        .eq('owner_user_id', ownerUserId);
      if (error) console.error('[developer-billing-webhook] developer_accounts update failed:', error);

      return new Response('ok', { status: 200 });
    }

    if (event.type === 'customer.subscription.deleted') {
      if (meta.developer_account !== 'true') return new Response('ignored (not a developer account)', { status: 200 });
      const ownerUserId = meta.owner_user_id;
      if (!ownerUserId) return new Response('ignored (no owner_user_id)', { status: 200 });

      const { error } = await admin()
        .from('developer_accounts')
        .update({ plan: 'free', stripe_subscription_item_id: null })
        .eq('owner_user_id', ownerUserId);
      if (error) console.error('[developer-billing-webhook] downgrade-to-free failed:', error);

      return new Response('ok', { status: 200 });
    }

    return new Response('ignored (unhandled event type)', { status: 200 });
  } catch (error) {
    console.error('developer-billing-webhook error:', error);
    return new Response('error', { status: 500 });
  }
});
