import { supabase } from '@rekindle/supabase';

// Phase 6 (6b) — MINISTRY (tenant) billing. Distinct from the individual-user
// subscriptions the existing stripe-subscription/paystack functions handle: this
// subscribes a whole ministry to a SaaS plan, writing ministry_subscriptions (which
// the entitlements resolver reads). Provider-agnostic — the ministry-checkout edge
// function creates a Stripe Checkout Session OR a Paystack transaction; the webhook
// upserts ministry_subscriptions on payment success.

export type BillingProvider = 'stripe' | 'paystack';
export type BillingCycle = 'monthly' | 'yearly';
export type MinistryPlanSlug = 'basic' | 'standard' | 'premium' | 'enterprise';

export interface MinistryPlan {
  slug: MinistryPlanSlug;
  name: string;
  priceMonthly: number; // display price (USD); the edge fn maps to the provider amount/price id
  priceYearly: number;
  currency: string;
  limits: { members: number; broadcasts: number; videoMinutes: number }; // -1 = unlimited
  highlights: string[];
}

// The sellable ministry plans. Capabilities are derived server-side from the plan +
// ministry_subscriptions columns (see @rekindle/auth/ministryEntitlements). Keep the
// slugs aligned with ministry_subscriptions.plan_type (basic/standard/premium/enterprise).
export const MINISTRY_PLANS: MinistryPlan[] = [
  {
    slug: 'basic', name: 'Basic', priceMonthly: 19, priceYearly: 190, currency: 'USD',
    limits: { members: 100, broadcasts: 0, videoMinutes: 0 },
    highlights: ['Up to 100 members', 'Devotionals, prayer & content', 'Member directory & check-in'],
  },
  {
    slug: 'standard', name: 'Standard', priceMonthly: 49, priceYearly: 490, currency: 'USD',
    limits: { members: 500, broadcasts: 100, videoMinutes: 600 },
    highlights: ['Up to 500 members', 'Broadcasts & live meetings', 'Branding & team roles', 'Ministry analytics'],
  },
  {
    slug: 'premium', name: 'Premium', priceMonthly: 99, priceYearly: 990, currency: 'USD',
    limits: { members: 2000, broadcasts: 500, videoMinutes: 3000 },
    highlights: ['Up to 2,000 members', 'Recording & replays', 'Role permissions', 'Advanced analytics'],
  },
  {
    slug: 'enterprise', name: 'Enterprise', priceMonthly: 249, priceYearly: 2490, currency: 'USD',
    limits: { members: -1, broadcasts: -1, videoMinutes: -1 },
    highlights: ['Unlimited members', 'White-label & custom domain', 'Priority support', 'Everything in Premium'],
  },
];

export const getMinistryPlan = (slug: string): MinistryPlan | undefined =>
  MINISTRY_PLANS.find((p) => p.slug === slug);

/**
 * Start checkout for a ministry plan. Returns a redirect URL to the provider's
 * hosted checkout (Stripe Checkout / Paystack). The caller must be a ministry admin
 * (enforced server-side). On success the webhook activates ministry_subscriptions.
 */
export async function startMinistryCheckout(opts: {
  ministryId: string;
  plan: MinistryPlanSlug;
  provider: BillingProvider;
  cycle?: BillingCycle;
}): Promise<{ url?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('ministry-checkout', {
    body: {
      action: 'checkout',
      ministryId: opts.ministryId,
      plan: opts.plan,
      provider: opts.provider,
      cycle: opts.cycle ?? 'monthly',
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
