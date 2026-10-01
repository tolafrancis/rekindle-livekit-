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
  storageGb: number;
  meetingHoursIncluded: number | null; // null = unlimited
  broadcastHoursIncluded: number | null; // null = unlimited
  memberOverageBlockSize: number | null;
  memberOveragePriceUsd: number | null;
  giftAidAddonPriceUsd: number | null;
  /** Billing-page participant cap (100/150/300/500 etc.) — a marketing
   *  number covering BOTH Meetings and Webinars, not the technical
   *  enforcement cap (that's the flat MEETING_PARTICIPANT_CAP in
   *  livekit-token/index.ts, same for every tier). Repurposes the
   *  webinar_audience_cap column (2026-09-21). null = not shown. */
  participantCap: number | null;
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
    storageGb: Number(row.storage_gb ?? 0),
    meetingHoursIncluded: (row.meeting_hours_included as number | null) ?? null,
    broadcastHoursIncluded: (row.broadcast_hours_included as number | null) ?? null,
    memberOverageBlockSize: (row.member_overage_block_size as number | null) ?? null,
    memberOveragePriceUsd: row.member_overage_price_usd != null ? Number(row.member_overage_price_usd) : null,
    giftAidAddonPriceUsd: row.gift_aid_addon_price_usd != null ? Number(row.gift_aid_addon_price_usd) : null,
    participantCap: row.webinar_audience_cap != null ? Number(row.webinar_audience_cap) : null,
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

// ── Add-ons (storage packs / member blocks / Gift Aid) ─────────────────────
// Purchasable on top of any base plan — see ministry_addon_catalog (0259) /
// ministry_addons (purchased instances) and the purchase-addon action on
// ministry-checkout.

export interface MinistryAddonCatalogItem {
  id: string;
  addonType: 'storage_pack' | 'member_block' | 'gift_aid' | 'live_translation' | 'participant_block';
  label: string;
  unitGb: number | null;
  unitMembers: number | null;
  unitHours: number | null;
  /** Extra participants this add-on grants, stacked on top of the plan's
   *  own participantCap (billing-page cap, not the technical one). */
  unitParticipants: number | null;
  priceUsd: number;
  /** Nigeria (Paystack) price — null on older rows that predate this
   *  (2026-09-21); callers should fall back to a USD display in that case. */
  priceNgn: number | null;
}

export interface MinistryAddon {
  id: string;
  addonType: 'storage_pack' | 'member_block' | 'gift_aid' | 'live_translation' | 'participant_block';
  quantity: number;
  unitGb: number | null;
  unitMembers: number | null;
  unitHours: number | null;
  unitParticipants: number | null;
  priceUsd: number;
  priceNgn: number | null;
  status: 'active' | 'cancelled';
  purchasedAt: string;
}

function mapCatalogRow(row: Record<string, unknown>): MinistryAddonCatalogItem {
  return {
    id: row.id as string,
    addonType: row.addon_type as MinistryAddonCatalogItem['addonType'],
    label: row.label as string,
    unitGb: (row.unit_gb as number | null) ?? null,
    unitMembers: (row.unit_members as number | null) ?? null,
    unitHours: (row.unit_hours as number | null) ?? null,
    unitParticipants: (row.unit_participants as number | null) ?? null,
    priceUsd: Number(row.price_usd),
    priceNgn: row.price_ngn != null ? Number(row.price_ngn) : null,
  };
}

function mapAddonRow(row: Record<string, unknown>): MinistryAddon {
  return {
    id: row.id as string,
    addonType: row.addon_type as MinistryAddon['addonType'],
    quantity: Number(row.quantity ?? 1),
    unitGb: (row.unit_gb as number | null) ?? null,
    unitMembers: (row.unit_members as number | null) ?? null,
    unitHours: (row.unit_hours as number | null) ?? null,
    unitParticipants: (row.unit_participants as number | null) ?? null,
    priceUsd: Number(row.price_usd),
    priceNgn: row.price_ngn != null ? Number(row.price_ngn) : null,
    status: row.status as MinistryAddon['status'],
    purchasedAt: row.purchased_at as string,
  };
}

/** Sum of active live_translation add-on hours this ministry has bought
 *  this billing cycle (quantity * unitHours across all active rows). Used
 *  for the usage display in MinistryTranslationServiceManager.tsx —
 *  actual enforcement is server-side (ministry_has_active_translation_plan,
 *  migration 0345), this is purely for showing "X of Y hours" to the admin. */
export function totalTranslationHoursPurchased(addons: MinistryAddon[]): number {
  return addons
    .filter((a) => a.addonType === 'live_translation')
    .reduce((sum, a) => sum + a.quantity * (a.unitHours ?? 0), 0);
}

/** Sum of active participant_block add-on participants this ministry has
 *  bought (quantity * unitParticipants across all active rows) — add to a
 *  plan's own participantCap for the ministry's effective billing-page cap. */
export function totalParticipantsPurchased(addons: MinistryAddon[]): number {
  return addons
    .filter((a) => a.addonType === 'participant_block')
    .reduce((sum, a) => sum + a.quantity * (a.unitParticipants ?? 0), 0);
}

/** Active, purchasable add-on catalog. Public read (no auth required). */
export async function fetchAddonCatalog(): Promise<{ items: MinistryAddonCatalogItem[]; error?: string }> {
  const { data, error } = await supabase
    .from('ministry_addon_catalog').select('*').eq('is_active', true).order('display_order', { ascending: true });
  if (error) return { items: [], error: error.message };
  return { items: (data ?? []).map(mapCatalogRow) };
}

/** A ministry's currently active purchased add-ons. */
export async function fetchMinistryAddons(ministryId: string): Promise<{ addons: MinistryAddon[]; error?: string }> {
  const { data, error } = await supabase
    .from('ministry_addons').select('*')
    .eq('ministry_id', ministryId).eq('status', 'active').order('purchased_at', { ascending: false });
  if (error) return { addons: [], error: error.message };
  return { addons: (data ?? []).map(mapAddonRow) };
}

/**
 * A ministry's effective recording-retention override for RecordingRetentionBadge
 * (see BillingSettings.tsx, where storage_pack ministries set this):
 *   - undefined: no active storage_pack — badge should use its fixed kind default.
 *   - null:      storage_pack, retention set to "Never delete".
 *   - number:    storage_pack, custom day count.
 */
export async function getEffectiveRecordingRetentionDays(ministryId: string): Promise<number | null | undefined> {
  const { addons } = await fetchMinistryAddons(ministryId);
  if (!addons.some((a) => a.addonType === 'storage_pack')) return undefined;
  const { data } = await supabase
    .from('ministry_groups')
    .select('recording_retention_days')
    .eq('id', ministryId)
    .maybeSingle();
  return (data as { recording_retention_days: number | null } | null)?.recording_retention_days ?? null;
}

/**
 * Buy an add-on. Stripe purchases complete immediately (no url returned —
 * it's added to the ministry's existing subscription synchronously);
 * Paystack returns a hosted authorization url to redirect to, same as the
 * base plan checkout.
 */
export async function purchaseAddon(opts: {
  ministryId: string;
  catalogId: string;
  provider: BillingProvider;
  country: string;
}): Promise<{ success?: boolean; url?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('ministry-checkout', {
    body: {
      action: 'purchase-addon',
      ministryId: opts.ministryId,
      catalogId: opts.catalogId,
      provider: opts.provider,
      country: opts.country,
      returnUrl: typeof window !== 'undefined' ? window.location.origin + '/settings/billing' : undefined,
    },
  });
  if (error) return { error: error.message };
  return data as { success?: boolean; url?: string };
}
