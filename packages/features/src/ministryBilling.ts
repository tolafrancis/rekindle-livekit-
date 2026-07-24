import { supabase } from '@rekindle/supabase';

// Phase 6 (6b) — MINISTRY (tenant) billing, now the "Ministry Partner" regional
// subscription flow. Distinct from the individual-user subscriptions the existing
// stripe-subscription/paystack functions handle: this subscribes a whole ministry
// to a plan, writing ministry_subscriptions (which the entitlements resolver
// reads). Provider-agnostic — the ministry-checkout edge function creates a
// Stripe Checkout Session, a Paystack subscription transaction, or returns a
// hosted PayPal billing link; the webhook upserts ministry_subscriptions on
// Stripe/Paystack payment success (PayPal is manually confirmed for now — see
// ministry-checkout's PayPal branch).
//
// Pricing/plan IDs are admin-configurable in the `ministry_partner_plans` table
// (Settings -> Payment Configuration -> Ministry Partner Plans) rather than
// hardcoded here, so changing a price or payment link needs no deploy.

export type BillingProvider = 'stripe' | 'paystack' | 'paypal';
export type BillingCycle = 'monthly' | 'annual';

export interface MinistryPartnerPlan {
  id: string;
  slug: string;
  name: string;
  minMembers: number;
  maxMembers: number | null; // null = unbounded (e.g. "500+")
  ngnPriceMonthly: number;
  ngnPriceAnnual: number;
  usdPriceMonthly: number;
  usdPriceAnnual: number;
  paystackPlanCode: string | null;
  stripePriceIdMonthly: string | null;
  stripePriceIdAnnual: string | null;
  paypalBillingLinkMonthly: string | null;
  paypalBillingLinkAnnual: string | null;
  features: string[];
  isActive: boolean;
  displayOrder: number;
}

function mapPlanRow(row: Record<string, unknown>): MinistryPartnerPlan {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    minMembers: row.min_members as number,
    maxMembers: (row.max_members as number | null) ?? null,
    ngnPriceMonthly: Number(row.ngn_price_monthly),
    ngnPriceAnnual: Number(row.ngn_price_annual),
    usdPriceMonthly: Number(row.usd_price_monthly),
    usdPriceAnnual: Number(row.usd_price_annual),
    paystackPlanCode: (row.paystack_plan_code as string | null) ?? null,
    stripePriceIdMonthly: (row.stripe_price_id_monthly as string | null) ?? null,
    stripePriceIdAnnual: (row.stripe_price_id_annual as string | null) ?? null,
    paypalBillingLinkMonthly: (row.paypal_billing_link_monthly as string | null) ?? null,
    paypalBillingLinkAnnual: (row.paypal_billing_link_annual as string | null) ?? null,
    features: Array.isArray(row.features) ? (row.features as string[]) : [],
    isActive: Boolean(row.is_active),
    displayOrder: Number(row.display_order ?? 0),
  };
}

/** Active Ministry Partner tiers, in display order. Public read (no auth required). */
export async function fetchMinistryPartnerPlans(): Promise<{ plans: MinistryPartnerPlan[]; error?: string }> {
  const { data, error } = await supabase
    .from('ministry_partner_plans')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  if (error) return { plans: [], error: error.message };
  return { plans: (data ?? []).map(mapPlanRow) };
}

/** Resolve the display/charge amount + currency for a plan given a country + cycle. */
export function resolvePlanPricing(plan: MinistryPartnerPlan, countryCode: string, cycle: BillingCycle) {
  const isNigeria = countryCode === 'NG';
  const currency = isNigeria ? 'NGN' : 'USD';
  const amount = isNigeria
    ? (cycle === 'annual' ? plan.ngnPriceAnnual : plan.ngnPriceMonthly)
    : (cycle === 'annual' ? plan.usdPriceAnnual : plan.usdPriceMonthly);
  const suggestedProvider: BillingProvider = isNigeria ? 'paystack' : 'stripe';
  return { currency, amount, suggestedProvider };
}

/**
 * Start checkout for a Ministry Partner plan. Returns a redirect URL to the
 * provider's hosted checkout (Stripe Checkout / Paystack subscription / PayPal
 * billing link). The caller must be a ministry admin (enforced server-side).
 * On success the webhook activates ministry_subscriptions (Stripe/Paystack);
 * PayPal inserts a pending row for manual admin confirmation.
 */
export async function startMinistryCheckout(opts: {
  ministryId: string;
  plan: string;
  provider: BillingProvider;
  cycle?: BillingCycle;
  country: string;
}): Promise<{ url?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('ministry-checkout', {
    body: {
      action: 'checkout',
      ministryId: opts.ministryId,
      plan: opts.plan,
      provider: opts.provider,
      cycle: opts.cycle ?? 'monthly',
      country: opts.country,
      returnUrl: typeof window !== 'undefined' ? window.location.origin + '/settings/billing' : undefined,
    },
  });
  if (error) return { error: error.message };
  return { url: (data as { url?: string })?.url };
}

/** Open the provider billing portal (manage/cancel) for the ministry's subscription. */
export async function openMinistryBillingPortal(ministryId: string): Promise<{ url?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('ministry-checkout', {
    body: {
      action: 'portal',
      ministryId,
      returnUrl: typeof window !== 'undefined' ? window.location.origin + '/settings/billing' : undefined,
    },
  });
  if (error) return { error: error.message };
  return { url: (data as { url?: string })?.url };
}
