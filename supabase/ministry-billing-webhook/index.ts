// Supabase Edge Function: ministry-billing-webhook
// =====================================================================
// Phase 6 (6b) — activates MINISTRY subscriptions on payment success. Register this as
// a SECOND webhook endpoint (alongside the existing user stripe-webhook/paystack-webhook)
// in both providers; it only acts on events whose metadata carries a ministry_id.
//
// Stripe:   checkout.session.completed / customer.subscription.updated|deleted
// Paystack: charge.success
// -> upsert ministry_subscriptions (plan_type, status, provider ids, period end,
//    server-derived limits) which the entitlements resolver reads.
//
// Secrets: STRIPE_WEBHOOK_SECRET (this endpoint's signing secret), PAYSTACK_SECRET_KEY.
// verify_jwt must be OFF for this function (providers don't send a Supabase JWT).
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Server-authoritative plan -> limits (mirrors MINISTRY_PLANS). -1 = unlimited.
const PLAN_LIMITS: Record<string, { members: number; broadcasts: number; video: number }> = {
  basic: { members: 100, broadcasts: 0, video: 0 },
  standard: { members: 500, broadcasts: 100, video: 600 },
  premium: { members: 2000, broadcasts: 500, video: 3000 },
  enterprise: { members: -1, broadcasts: -1, video: -1 },
};

const enc = new TextEncoder();

async function hmacHex(algo: 'SHA-256' | 'SHA-512', key: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: algo }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function admin() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

async function activate(sub: {
  ministryId: string; plan: string; cycle?: string; status: string;
  stripeSubId?: string; stripeCustId?: string; periodEnd?: string | null; amount?: number | null;
}) {
  const lim = PLAN_LIMITS[sub.plan];
  if (!lim) { console.warn('unknown ministry plan', sub.plan); return; }
  const db = admin();
  const { data: existing } = await db
    .from('ministry_subscriptions').select('id')
    .eq('ministry_id', sub.ministryId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const row: Record<string, unknown> = {
    ministry_id: sub.ministryId,
    plan_type: sub.plan,
    status: sub.status,
    billing_cycle: sub.cycle === 'yearly' ? 'yearly' : 'monthly',
    member_limit: lim.members,
    broadcast_limit: lim.broadcasts,
    video_minutes_limit: lim.video,
    white_label_enabled: sub.plan === 'enterprise',
    custom_domain_enabled: sub.plan === 'enterprise',
    priority_support: sub.plan === 'enterprise',
    current_period_end: sub.periodEnd ?? null,
    amount_cents: sub.amount ?? null,
    currency: 'usd',
    ...(sub.stripeSubId ? { stripe_subscription_id: sub.stripeSubId } : {}),
    ...(sub.stripeCustId ? { stripe_customer_id: sub.stripeCustId } : {}),
    updated_at: new Date().toISOString(),
  };
  if (existing?.id) await db.from('ministry_subscriptions').update(row).eq('id', existing.id);
  else await db.from('ministry_subscriptions').insert(row);
  // Reflect lifecycle on the tenant (subscriptionEnforcement/UI read this).
  await db.from('ministry_groups')
    .update({ subscription_status: sub.status === 'active' ? 'active' : sub.status })
    .eq('id', sub.ministryId);
}

serve(async (req) => {
  try {
    const raw = await req.text();
    const stripeSig = req.headers.get('stripe-signature');
    const paystackSig = req.headers.get('x-paystack-signature');

    // ── Stripe ──────────────────────────────────────────────────────────
    if (stripeSig) {
      const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
      if (!secret) return new Response('no secret', { status: 500 });
      const parts = Object.fromEntries(stripeSig.split(',').map((s) => s.split('=')));
      const expected = await hmacHex('SHA-256', secret, `${parts.t}.${raw}`);
      if (expected !== parts.v1) return new Response('bad signature', { status: 400 });

      const event = JSON.parse(raw);
      const obj = event.data?.object ?? {};
      const meta = obj.metadata ?? {};
      const ministryId = meta.ministry_id;
      if (!ministryId) return new Response('ignored (not ministry)', { status: 200 }); // user event

      if (event.type === 'checkout.session.completed' || event.type === 'customer.subscription.updated') {
        await activate({
          ministryId, plan: meta.plan, cycle: meta.cycle, status: 'active',
          stripeSubId: obj.subscription ?? obj.id,
          stripeCustId: obj.customer,
          periodEnd: obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null,
          amount: obj.amount_total ?? null,
        });
      } else if (event.type === 'customer.subscription.deleted') {
        await admin().from('ministry_subscriptions')
          .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
          .eq('ministry_id', ministryId);
        await admin().from('ministry_groups').update({ subscription_status: 'cancelled' }).eq('id', ministryId);
      }
      return new Response('ok', { status: 200 });
    }

    // ── Paystack ────────────────────────────────────────────────────────
    if (paystackSig) {
      const key = Deno.env.get('PAYSTACK_SECRET_KEY');
      if (!key) return new Response('no secret', { status: 500 });
      const expected = await hmacHex('SHA-512', key, raw);
      if (expected !== paystackSig) return new Response('bad signature', { status: 400 });

      const event = JSON.parse(raw);
      const meta = event.data?.metadata ?? {};
      const ministryId = meta.ministry_id;
      if (!ministryId) return new Response('ignored (not ministry)', { status: 200 });
      if (event.event === 'charge.success') {
        await activate({
          ministryId, plan: meta.plan, cycle: meta.cycle, status: 'active',
          amount: event.data?.amount ?? null,
        });
      }
      return new Response('ok', { status: 200 });
    }

    return new Response('no signature', { status: 400 });
  } catch (error) {
    console.error('ministry-billing-webhook error:', error);
    return new Response('error', { status: 500 });
  }
});
