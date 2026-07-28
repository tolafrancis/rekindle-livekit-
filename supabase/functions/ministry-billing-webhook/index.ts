// Supabase Edge Function: ministry-billing-webhook
// =====================================================================
// Activates/updates Ministry Partner subscriptions on payment events. Register
// this as a SECOND webhook endpoint (alongside the existing user
// stripe-webhook/paystack-webhook) in both providers; it only acts on events
// whose metadata carries a ministry_id.
//
// Stripe:   checkout.session.completed, customer.subscription.updated,
//           customer.subscription.deleted, invoice.payment_failed
// Paystack: subscription.create, charge.success, invoice.payment_failed,
//           subscription.disable
// -> upsert ministry_subscriptions (plan_type, status, provider ids, period
//    end, member_limit/features from ministry_partner_plans) which the
//    entitlements resolver reads.
//
// PayPal has no webhook here in this phase — see ministry-checkout, which
// inserts a 'pending_paypal_confirmation' row for manual admin activation.
//
// Secrets: STRIPE_WEBHOOK_SECRET (this endpoint's signing secret), PAYSTACK_SECRET_KEY.
// verify_jwt must be OFF for this function (providers don't send a Supabase JWT).
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const enc = new TextEncoder();

async function hmacHex(algo: 'SHA-256' | 'SHA-512', key: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: algo }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function admin() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

async function upsert(sub: {
  ministryId: string; plan?: string; cycle?: string; status: string; country?: string;
  provider: 'stripe' | 'paystack';
  stripeSubId?: string; stripeCustId?: string;
  paystackSubCode?: string; paystackCustCode?: string;
  periodEnd?: string | null; amount?: number | null;
}) {
  const db = admin();

  // NOTE: ministry_partner_plans.features is a display array of marketing copy
  // ("Under 100 members", ...) — do NOT write it into ministry_subscriptions.features,
  // which ministryEntitlements.ts reads as a BOOLEAN capability-flag override object.
  // All Ministry Partner tiers include live channels/broadcast per the landing page, so
  // grant those unconditionally here rather than gating them by plan rank.
  let memberLimit: number | null = null;
  let storageLimitMb: number | null = null;
  let meetingHoursLimit: number | null = null;
  let broadcastHoursLimit: number | null = null;
  if (sub.plan) {
    const { data: planRow } = await db
      .from('ministry_partner_plans')
      .select('max_members, storage_gb, meeting_hours_included, broadcast_hours_included')
      .eq('slug', sub.plan).maybeSingle();
    if (planRow) {
      const p = planRow as {
        max_members: number | null; storage_gb: number | null;
        meeting_hours_included: number | null; broadcast_hours_included: number | null;
      };
      memberLimit = p.max_members ?? -1;
      storageLimitMb = p.storage_gb != null ? p.storage_gb * 1024 : null;
      meetingHoursLimit = p.meeting_hours_included ?? null; // null = unlimited
      broadcastHoursLimit = p.broadcast_hours_included ?? null;
    }
  }

  const { data: existing } = await db
    .from('ministry_subscriptions').select('id')
    .eq('ministry_id', sub.ministryId).order('created_at', { ascending: false }).limit(1).maybeSingle();

  const row: Record<string, unknown> = {
    ministry_id: sub.ministryId,
    ...(sub.plan ? { plan_type: sub.plan } : {}),
    status: sub.status,
    ...(sub.cycle ? { billing_cycle: sub.cycle } : {}),
    ...(memberLimit !== null ? { member_limit: memberLimit } : {}),
    // Every Ministry Partner tier includes live channels/broadcast per the landing
    // page — grant unconditionally rather than gating by plan rank.
    ...(sub.plan ? { broadcast_limit: -1, video_minutes_limit: -1 } : {}),
    ...(sub.plan ? { storage_limit_mb: storageLimitMb, meeting_hours_limit: meetingHoursLimit, broadcast_hours_limit: broadcastHoursLimit } : {}),
    ...(sub.plan === 'ministry_plus' ? { white_label_enabled: true, priority_support: true } : {}),
    ...(sub.country ? { country: sub.country } : {}),
    payment_provider: sub.provider,
    ...(sub.periodEnd !== undefined ? { current_period_end: sub.periodEnd } : {}),
    ...(sub.amount != null ? { amount_cents: sub.amount } : {}),
    currency: sub.provider === 'paystack' ? 'ngn' : 'usd',
    ...(sub.stripeSubId ? { stripe_subscription_id: sub.stripeSubId } : {}),
    ...(sub.stripeCustId ? { stripe_customer_id: sub.stripeCustId } : {}),
    ...(sub.paystackSubCode ? { paystack_subscription_code: sub.paystackSubCode } : {}),
    ...(sub.paystackCustCode ? { paystack_customer_code: sub.paystackCustCode } : {}),
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) await db.from('ministry_subscriptions').update(row).eq('id', existing.id);
  else await db.from('ministry_subscriptions').insert(row);

  // Reflect lifecycle on the tenant (subscriptionEnforcement/UI read this).
  await db.from('ministry_groups').update({ subscription_status: sub.status }).eq('id', sub.ministryId);
}

// Paystack add-on purchases (ministry-checkout's purchase-addon action) are
// their own separate Paystack subscription per purchase — distinguished from
// a base-plan event by metadata.addon, and upserted into ministry_addons
// instead of ministry_subscriptions.
async function upsertAddon(a: {
  ministryId: string; addonType: string; unitGb: number | null; unitMembers: number | null;
  priceUsd: number; paystackSubCode?: string;
}) {
  const db = admin();
  await db.from('ministry_addons').insert({
    ministry_id: a.ministryId,
    addon_type: a.addonType,
    quantity: 1,
    unit_gb: a.unitGb,
    unit_members: a.unitMembers,
    price_usd: a.priceUsd,
    status: 'active',
    paystack_subscription_code: a.paystackSubCode ?? null,
  });
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

      if (event.type === 'checkout.session.completed') {
        await upsert({
          ministryId, plan: meta.plan, cycle: meta.cycle, country: meta.country, status: 'active', provider: 'stripe',
          stripeSubId: obj.subscription ?? obj.id,
          stripeCustId: obj.customer,
          amount: obj.amount_total ?? null,
        });
      } else if (event.type === 'customer.subscription.updated') {
        // Stripe subscription statuses: active, past_due, unpaid, canceled, trialing, incomplete...
        await upsert({
          ministryId, plan: meta.plan, cycle: meta.cycle, country: meta.country,
          status: obj.status ?? 'active', provider: 'stripe',
          stripeSubId: obj.id, stripeCustId: obj.customer,
          periodEnd: obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null,
        });
      } else if (event.type === 'customer.subscription.deleted') {
        await admin().from('ministry_subscriptions')
          .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
          .eq('ministry_id', ministryId);
        await admin().from('ministry_groups').update({ subscription_status: 'cancelled' }).eq('id', ministryId);
      } else if (event.type === 'invoice.payment_failed') {
        await admin().from('ministry_subscriptions')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq('ministry_id', ministryId);
        await admin().from('ministry_groups').update({ subscription_status: 'past_due' }).eq('id', ministryId);
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

      const isAddon = meta.addon === true || meta.addon === 'true';
      if (isAddon) {
        if (event.event === 'subscription.create') {
          await upsertAddon({
            ministryId, addonType: meta.addon_type, unitGb: meta.unit_gb ?? null, unitMembers: meta.unit_members ?? null,
            priceUsd: Number(meta.price_usd ?? 0), paystackSubCode: event.data?.subscription_code,
          });
        } else if (event.event === 'subscription.disable') {
          // Match the specific add-on subscription being disabled, not just
          // ministry+type — a ministry can hold more than one of the same SKU.
          await admin().from('ministry_addons')
            .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
            .eq('paystack_subscription_code', event.data?.subscription_code ?? '');
        }
        return new Response('ok', { status: 200 });
      }

      if (event.event === 'subscription.create') {
        await upsert({
          ministryId, plan: meta.plan, cycle: meta.cycle, country: meta.country, status: 'active', provider: 'paystack',
          paystackSubCode: event.data?.subscription_code,
          paystackCustCode: event.data?.customer?.customer_code,
        });
      } else if (event.event === 'charge.success') {
        await upsert({
          ministryId, plan: meta.plan, cycle: meta.cycle, country: meta.country, status: 'active', provider: 'paystack',
          paystackCustCode: event.data?.customer?.customer_code,
          amount: event.data?.amount ?? null,
        });
      } else if (event.event === 'invoice.payment_failed') {
        await admin().from('ministry_subscriptions')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq('ministry_id', ministryId);
        await admin().from('ministry_groups').update({ subscription_status: 'past_due' }).eq('id', ministryId);
      } else if (event.event === 'subscription.disable') {
        await admin().from('ministry_subscriptions')
          .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
          .eq('ministry_id', ministryId);
        await admin().from('ministry_groups').update({ subscription_status: 'cancelled' }).eq('id', ministryId);
      }
      return new Response('ok', { status: 200 });
    }

    return new Response('no signature', { status: 400 });
  } catch (error) {
    console.error('ministry-billing-webhook error:', error);
    return new Response('error', { status: 500 });
  }
});
