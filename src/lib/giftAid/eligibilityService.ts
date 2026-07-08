// =============================================================================
// Gift Aid — eligibility service (Phase 2)
// Folder: src/lib/giftAid/
// -----------------------------------------------------------------------------
// Reads the eligibility engine (ga_get_eligible_donations RPC), lets admins
// include/exclude individual donations, and computes the Claims Dashboard
// summary. Eligibility itself is computed server-side; this is the thin client.
// =============================================================================

import { supabase } from '@/lib/supabase';

export type GiftAidReason =
  | 'eligible'
  | 'excluded_by_admin'
  | 'anonymous_donation'
  | 'donation_not_completed'
  | 'no_active_declaration'
  | string;

export type GiftAidClaimStatus =
  | 'ready'
  | 'pending'
  | 'submitted'
  | 'accepted'
  | 'rejected';

export interface EligibleDonationRow {
  donationId: string;
  donorName: string | null;
  donorEmail: string | null;
  donorId: string | null;
  amount: number;
  amountCents: number;
  currency: string;
  donationDate: string;
  fundAllocation: string | null;
  campaignId: string | null;
  isAnonymous: boolean;
  donationStatus: string | null;
  eligible: boolean;
  reason: GiftAidReason;
  estimatedGiftAid: number;
  claimStatus: GiftAidClaimStatus;
  adminExcluded: boolean;
}

export interface LoadEligibleOptions {
  from?: string | null; // ISO timestamp
  to?: string | null;
}

/** Friendly text for an eligibility reason. */
export function reasonLabel(reason: GiftAidReason): string {
  switch (reason) {
    case 'eligible': return 'Eligible';
    case 'excluded_by_admin': return 'Excluded by admin';
    case 'anonymous_donation': return 'Anonymous donation';
    case 'donation_not_completed': return 'Payment not completed';
    case 'no_active_declaration': return 'No active declaration';
    default: return reason;
  }
}

/** Load every donation for a ministry with its eligibility verdict. */
export async function loadEligibleDonations(
  ministryId: string,
  opts: LoadEligibleOptions = {},
): Promise<EligibleDonationRow[]> {
  const { data, error } = await supabase.rpc('ga_get_eligible_donations', {
    p_ministry_id: ministryId,
    p_from: opts.from ?? null,
    p_to: opts.to ?? null,
  });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    donationId: r.donation_id,
    donorName: r.donor_name,
    donorEmail: r.donor_email,
    donorId: r.donor_id,
    amount: Number(r.amount ?? 0),
    amountCents: Number(r.amount_cents ?? 0),
    currency: r.currency || 'GBP',
    donationDate: r.donation_date,
    fundAllocation: r.fund_allocation,
    campaignId: r.campaign_id,
    isAnonymous: !!r.is_anonymous,
    donationStatus: r.donation_status,
    eligible: !!r.eligible,
    reason: r.reason,
    estimatedGiftAid: Number(r.estimated_gift_aid ?? 0),
    claimStatus: (r.claim_status as GiftAidClaimStatus) || 'ready',
    adminExcluded: !!r.admin_excluded,
  }));
}

/** Include or exclude a donation from Gift Aid (admin override). */
export async function setDonationExclusion(
  ministryId: string,
  donationId: string,
  excluded: boolean,
  reason?: string,
  actorUserId?: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('gift_aid_donation_status')
    .upsert(
      {
        ministry_id: ministryId,
        donation_id: donationId,
        admin_excluded: excluded,
        exclude_reason: excluded ? (reason || null) : null,
        updated_by: actorUserId || null,
      },
      { onConflict: 'donation_id' },
    );
  if (error) throw error;

  // Best-effort audit (append-only).
  try {
    await supabase.from('gift_aid_audit_log').insert({
      ministry_id: ministryId,
      actor_user_id: actorUserId || null,
      event_type: 'status_changed',
      event_data: { donation_id: donationId, admin_excluded: excluded, reason: reason || null },
    });
  } catch (e) {
    console.warn('audit (status_changed) failed:', e);
  }
}

// -- dashboard summary --------------------------------------------------------

export interface CurrencyTotal {
  currency: string;
  eligibleAmount: number;
  estimatedGiftAid: number;
  eligibleCount: number;
}

export interface GiftAidSummary {
  totalDonations: number;
  eligibleCount: number;
  ineligibleCount: number;
  /** Totals grouped by currency (eligible donations only). */
  byCurrency: CurrencyTotal[];
  /** GBP convenience figures for the headline cards. */
  gbpEligibleAmount: number;
  gbpEstimatedGiftAid: number;
  /** Claim lifecycle counts across eligible donations. */
  claimStatusCounts: Record<GiftAidClaimStatus, number>;
  /** Why ineligible ones were rejected. */
  reasonCounts: Record<string, number>;
  /** True if there are eligible donations in a currency other than GBP. */
  hasNonGbpEligible: boolean;
}

export function computeGiftAidSummary(rows: EligibleDonationRow[]): GiftAidSummary {
  const byCurrencyMap = new Map<string, CurrencyTotal>();
  const claimStatusCounts: Record<GiftAidClaimStatus, number> = {
    ready: 0, pending: 0, submitted: 0, accepted: 0, rejected: 0,
  };
  const reasonCounts: Record<string, number> = {};
  let eligibleCount = 0;
  let ineligibleCount = 0;

  for (const r of rows) {
    if (r.eligible) {
      eligibleCount++;
      const cur = r.currency || 'GBP';
      const ct = byCurrencyMap.get(cur) || { currency: cur, eligibleAmount: 0, estimatedGiftAid: 0, eligibleCount: 0 };
      ct.eligibleAmount += r.amount;
      ct.estimatedGiftAid += r.estimatedGiftAid;
      ct.eligibleCount += 1;
      byCurrencyMap.set(cur, ct);
      if (claimStatusCounts[r.claimStatus] !== undefined) claimStatusCounts[r.claimStatus]++;
    } else {
      ineligibleCount++;
      reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1;
    }
  }

  const byCurrency = Array.from(byCurrencyMap.values()).sort((a, b) => b.eligibleAmount - a.eligibleAmount);
  const gbp = byCurrencyMap.get('GBP');

  return {
    totalDonations: rows.length,
    eligibleCount,
    ineligibleCount,
    byCurrency,
    gbpEligibleAmount: gbp?.eligibleAmount || 0,
    gbpEstimatedGiftAid: gbp?.estimatedGiftAid || 0,
    claimStatusCounts,
    reasonCounts,
    hasNonGbpEligible: byCurrency.some((c) => c.currency !== 'GBP'),
  };
}
