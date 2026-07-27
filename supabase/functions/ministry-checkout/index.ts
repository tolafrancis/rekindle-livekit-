// Supabase Edge Function: ministry-checkout
// =====================================================================
// MINISTRY (tenant) subscription checkout for the "Ministry Partner" plan.
// Provider-agnostic and region-routed: Nigeria pays via Paystack (NGN,
// recurring via a pre-created Paystack Plan); everywhere else pays via
// Stripe (USD, recurring via a Stripe Price) or a PayPal hosted billing link.
// Pricing and provider IDs are read from ministry_partner_plans — never
// hardcoded — so admins can change them without a deploy.
//
// Requests (POST; caller must be a leader/admin/owner of ministryId):
//   { action:'checkout', ministryId, plan, provider:'stripe'|'paystack'|'paypal',
//     cycle:'monthly'|'annual', country, returnUrl }
//        -> { url }   (redirect the admin to the provider's hosted checkout)
//   { action:'portal', ministryId, returnUrl }  -> { url }   (Stripe billing portal)
//
// Secrets: STRIPE_SECRET_KEY, PAYSTACK_SECRET_KEY (shared with the existing
// billing fns). Pricing is SERVER-AUTHORITATIVE here (never trust client
// amounts) — always re-read from ministry_partner_plans by slug.
//
// PayPal has no live webhook in this phase (see ministry-billing-webhook):
// we insert a 'pending_paypal_confirmation' row up front (reflecting intent
// to pay) and an admin manually flips it to 'active' after verifying the
// payment in the PayPal dashboard.
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const form = (obj: Record<string, string>) =>
  Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

// Human-readable line-item name for Stripe's inline price_data fallback,
// when the catalog SKU has no pre-created stripe_price_id.
function catalogRowLabel(addonType: string, unitGb: number | null, unitMembers: number | null): string {
  if (addonType === 'storage_pack') return `+${(unitGb ?? 0) >= 1024 ? `${(unitGb ?? 0) / 1024} TB` : `${unitGb} GB`} storage`;
  if (addonType === 'member_block') return `+${unitMembers ?? 0} members`;
  return 'Gift Aid claims & HMRC submission';
}

interface PlanRow {
  slug: string;
  name: string;
  max_members: number | null;
  ngn_price_monthly: number;
  ngn_price_annual: number;
  usd_price_monthly: number;
  usd_price_annual: number;
  storage_gb: number | null;
  meeting_hours_included: number | null;
  broadcast_hours_included: number | null;
  paystack_plan_code: string | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_annual: string | null;
  paypal_billing_link_monthly: string | null;
  paypal_billing_link_annual: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { action, ministryId, plan, provider, cycle, country, returnUrl, catalogId } = await req.json();
    if (!action || !ministryId) return json({ error: 'action and ministryId are required' }, 400);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    const PAYSTACK_KEY = Deno.env.get('PAYSTACK_SECRET_KEY');

    // Authorize: caller must administer this ministry.
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: isAdmin } = await admin.rpc('is_group_admin', { p_ministry_id: ministryId, p_user_id: user.id });
    if (!isAdmin) return json({ error: 'Not authorized to manage billing for this ministry' }, 403);

    const back = returnUrl || `${SUPABASE_URL}`;

    // ── Billing portal (Stripe) ──────────────────────────────────────────
    if (action === 'portal') {
      if (!STRIPE_KEY) return json({ error: 'Stripe not configured' }, 500);
      const { data: sub } = await admin
        .from('ministry_subscriptions').select('stripe_customer_id')
        .eq('ministry_id', ministryId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      const customer = (sub as { stripe_customer_id?: string } | null)?.stripe_customer_id;
      if (!customer) return json({ error: 'No billing account yet — subscribe first.' }, 400);
      const r = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ customer, return_url: back }),
      });
      const j = await r.json();
      if (!r.ok) return json({ error: j?.error?.message || 'Stripe portal error' }, 502);
      return json({ url: j.url });
    }

    // ── Purchase an add-on (storage pack / member block / Gift Aid) ────────
    // Stripe: attaches a new item to the ministry's EXISTING subscription —
    // immediate, synchronous, no hosted checkout needed (the ministry
    // already has a saved payment method from its base plan). Paystack has
    // no "add a line item" concept, so an add-on is a genuinely separate
    // Paystack subscription with its own plan code, requiring the same
    // hosted-authorization redirect as the base plan. PayPal isn't wired
    // for add-ons yet — the base plan's PayPal path is already a manual
    // admin-confirmation fallback; stacking that onto add-ons too is a
    // clear scope cut rather than a half-built third flow.
    if (action === 'purchase-addon') {
      if (!catalogId) return json({ error: 'catalogId is required' }, 400);

      const { data: catalogRow, error: catalogErr } = await admin
        .from('ministry_addon_catalog').select('*').eq('id', catalogId).eq('is_active', true).maybeSingle();
      if (catalogErr || !catalogRow) return json({ error: 'Unknown or inactive add-on' }, 400);
      const c = catalogRow as {
        id: string; addon_type: string; unit_gb: number | null; unit_members: number | null;
        price_usd: number; stripe_price_id: string | null; paystack_plan_code: string | null;
      };

      const countryCode = typeof country === 'string' ? country.toUpperCase() : 'US';
      const isNigeria = countryCode === 'NG';
      if (isNigeria && provider !== 'paystack') return json({ error: 'Nigeria must use Paystack' }, 400);
      if (!isNigeria && provider === 'paystack') return json({ error: 'Paystack is only available for Nigeria' }, 400);

      if (provider === 'paystack') {
        if (!PAYSTACK_KEY) return json({ error: 'Paystack not configured' }, 500);
        if (!c.paystack_plan_code) return json({ error: 'This add-on has no Paystack plan code configured yet' }, 400);
        const r = await fetch('https://api.paystack.co/transaction/initialize', {
          method: 'POST',
          headers: { Authorization: `Bearer ${PAYSTACK_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            plan: c.paystack_plan_code,
            callback_url: `${back}?billing=success`,
            metadata: {
              ministry_id: ministryId, addon: true, catalog_id: c.id, addon_type: c.addon_type,
              unit_gb: c.unit_gb, unit_members: c.unit_members, price_usd: c.price_usd, country: countryCode,
            },
          }),
        });
        const j = await r.json();
        if (!j?.status) return json({ error: j?.message || 'Paystack init error' }, 502);
        return json({ url: j.data.authorization_url });
      }

      if (provider === 'stripe') {
        if (!STRIPE_KEY) return json({ error: 'Stripe not configured' }, 500);
        const { data: sub } = await admin
          .from('ministry_subscriptions').select('stripe_subscription_id')
          .eq('ministry_id', ministryId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();
        const subscriptionId = (sub as { stripe_subscription_id?: string } | null)?.stripe_subscription_id;
        if (!subscriptionId) return json({ error: 'Subscribe to a Ministry Partner plan with a card before buying add-ons' }, 400);

        const body: Record<string, string> = { subscription: subscriptionId, quantity: '1' };
        if (c.stripe_price_id) {
          body['price'] = c.stripe_price_id;
        } else {
          body['price_data[currency]'] = 'usd';
          body['price_data[unit_amount]'] = String(Math.round(c.price_usd * 100));
          body['price_data[recurring][interval]'] = 'month';
          body['price_data[product_data][name]'] = catalogRowLabel(c.addon_type, c.unit_gb, c.unit_members);
        }
        const r = await fetch('https://api.stripe.com/v1/subscription_items', {
          method: 'POST',
          headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form(body),
        });
        const j = await r.json();
        if (!r.ok) return json({ error: j?.error?.message || 'Stripe add-on purchase error' }, 502);

        await admin.from('ministry_addons').insert({
          ministry_id: ministryId,
          addon_type: c.addon_type,
          quantity: 1,
          unit_gb: c.unit_gb,
          unit_members: c.unit_members,
          price_usd: c.price_usd,
          status: 'active',
          stripe_subscription_item_id: j.id,
        });
        return json({ success: true });
      }

      return json({ error: 'PayPal is not available for add-on purchases yet — use a card (Stripe)' }, 400);
    }

    // ── Checkout ─────────────────────────────────────────────────────────
    if (action !== 'checkout') return json({ error: `Unknown action: ${action}` }, 400);

    const { data: planRow, error: planErr } = await admin
      .from('ministry_partner_plans').select('*').eq('slug', plan).eq('is_active', true).maybeSingle();
    if (planErr || !planRow) return json({ error: `Unknown or inactive plan: ${plan}` }, 400);
    const p = planRow as PlanRow;

    const isAnnual = cycle === 'annual';
    const countryCode = typeof country === 'string' ? country.toUpperCase() : 'US';
    const isNigeria = countryCode === 'NG';

    // Enforce the routing rule server-side too — never trust the client alone.
    if (isNigeria && provider !== 'paystack') {
      return json({ error: 'Nigeria must use Paystack' }, 400);
    }
    if (!isNigeria && provider === 'paystack') {
      return json({ error: 'Paystack is only available for Nigeria' }, 400);
    }

    if (provider === 'paystack') {
      if (!PAYSTACK_KEY) return json({ error: 'Paystack not configured' }, 500);
      if (!p.paystack_plan_code) return json({ error: 'This plan has no Paystack plan code configured yet' }, 400);
      const r = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${PAYSTACK_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          plan: p.paystack_plan_code, // Paystack derives the amount/currency from the Plan and creates a recurring subscription after first charge
          callback_url: `${back}?billing=success`,
          metadata: { ministry_id: ministryId, plan: p.slug, cycle: isAnnual ? 'annual' : 'monthly', country: countryCode },
        }),
      });
      const j = await r.json();
      if (!j?.status) return json({ error: j?.message || 'Paystack init error' }, 502);
      return json({ url: j.data.authorization_url });
    }

    if (provider === 'stripe') {
      if (!STRIPE_KEY) return json({ error: 'Stripe not configured' }, 500);
      const priceId = isAnnual ? p.stripe_price_id_annual : p.stripe_price_id_monthly;
      const amount = isAnnual ? p.usd_price_annual : p.usd_price_monthly;

      const body: Record<string, string> = {
        mode: 'subscription',
        'line_items[0][quantity]': '1',
        success_url: `${back}?billing=success`,
        cancel_url: `${back}?billing=cancelled`,
        'metadata[ministry_id]': ministryId,
        'metadata[plan]': p.slug,
        'metadata[cycle]': isAnnual ? 'annual' : 'monthly',
        'metadata[country]': countryCode,
        'subscription_data[metadata][ministry_id]': ministryId,
        'subscription_data[metadata][plan]': p.slug,
        'subscription_data[metadata][cycle]': isAnnual ? 'annual' : 'monthly',
        'subscription_data[metadata][country]': countryCode,
      };
      if (priceId) {
        body['line_items[0][price]'] = priceId;
      } else {
        // No Price ID configured yet for this tier — fall back to an inline recurring price.
        body['line_items[0][price_data][currency]'] = 'usd';
        body['line_items[0][price_data][unit_amount]'] = String(Math.round(amount * 100));
        body['line_items[0][price_data][product_data][name]'] = `${p.name} — Ministry Partner`;
        body['line_items[0][price_data][recurring][interval]'] = isAnnual ? 'year' : 'month';
      }
      if (user.email) body['customer_email'] = user.email;

      const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form(body),
      });
      const j = await r.json();
      if (!r.ok) return json({ error: j?.error?.message || 'Stripe checkout error' }, 502);
      return json({ url: j.url });
    }

    if (provider === 'paypal') {
      const link = isAnnual ? p.paypal_billing_link_annual : p.paypal_billing_link_monthly;
      if (!link) return json({ error: 'This plan has no PayPal billing link configured yet' }, 400);

      // No PayPal webhook in this phase — record intent-to-pay now (status stays
      // 'pending_paypal_confirmation' until an admin manually verifies the payment
      // in the PayPal dashboard and flips it to 'active'). Caps/limits are set here
      // already so that flip is the ONLY thing the admin needs to change.
      const amount = isAnnual ? p.usd_price_annual : p.usd_price_monthly;
      await admin.from('ministry_subscriptions').insert({
        ministry_id: ministryId,
        plan_type: p.slug,
        status: 'pending_paypal_confirmation',
        billing_cycle: isAnnual ? 'annual' : 'monthly',
        member_limit: p.max_members ?? -1,
        broadcast_limit: -1,
        video_minutes_limit: -1,
        storage_limit_mb: p.storage_gb != null ? p.storage_gb * 1024 : null,
        meeting_hours_limit: p.meeting_hours_included ?? null,
        broadcast_hours_limit: p.broadcast_hours_included ?? null,
        ...(p.slug === 'ministry_plus' ? { white_label_enabled: true, priority_support: true } : {}),
        amount_cents: Math.round(amount * 100),
        currency: 'USD',
        payment_provider: 'paypal',
        country: countryCode,
      });

      return json({ url: link });
    }

    return json({ error: `Unknown provider: ${provider}` }, 400);
  } catch (error) {
    console.error('ministry-checkout error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
