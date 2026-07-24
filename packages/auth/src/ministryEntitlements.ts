import { supabase } from '@rekindle/supabase';

// Ministry (tenant) entitlements: resolves a ministry's subscription into concrete
// limits + capability flags that gate modules, branding, white-label, custom domains,
// and live/recording. The MINISTRY plan lives entirely on ministry_subscriptions (its
// own taxonomy — Ministry Partner tier_1/tier_2/tier_3 from ministry_partner_plans —
// plus its own caps/limits columns and a `features` jsonb BOOLEAN-FLAG override, e.g.
// { branding: true }; NOT the display feature-string array on ministry_partner_plans,
// which is a different, unrelated `features` field on a different table). Does not
// map to subscription_tiers (that's the individual-user tier table). Provider-agnostic:
// Stripe/Paystack write the row, this just reads the resolved state.

export interface MinistryLimits {
  members: number; // -1 = unlimited
  storageMb: number;
  broadcasts: number;
  videoMinutes: number;
  apiCalls: number;
}

export interface MinistryCaps {
  branding: boolean;
  whiteLabel: boolean;
  customDomain: boolean;
  liveChannels: boolean;
  interactiveMeetings: boolean;
  recordMeetings: boolean;
  broadcastMessaging: boolean;
  manageTeam: boolean;
  rolePermissions: boolean;
  advancedAnalytics: boolean;
  prioritySupport: boolean;
}

export interface MinistryEntitlements {
  tierSlug: string;
  tierName: string;
  status: string; // 'free' | 'trialing' | 'active' | 'past_due' | 'cancelled'
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  limits: MinistryLimits;
  caps: MinistryCaps;
}

const FREE_LIMITS: MinistryLimits = {
  members: 25,
  storageMb: 500,
  broadcasts: 0,
  videoMinutes: 60,
  apiCalls: 1000,
};

const NO_CAPS: MinistryCaps = {
  branding: false,
  whiteLabel: false,
  customDomain: false,
  liveChannels: false,
  interactiveMeetings: false,
  recordMeetings: false,
  broadcastMessaging: false,
  manageTeam: false,
  rolePermissions: false,
  advancedAnalytics: false,
  prioritySupport: false,
};

export const FREE_ENTITLEMENTS: MinistryEntitlements = {
  tierSlug: 'free',
  tierName: 'Free',
  status: 'free',
  trialEndsAt: null,
  currentPeriodEnd: null,
  limits: FREE_LIMITS,
  caps: NO_CAPS,
};

// Ministry plan taxonomy (ministry_subscriptions.plan_type) ranked for tier-gating.
// Slugs come from ministry_partner_plans (Ministry Partner tiers).
const PLAN_RANK: Record<string, number> = { tier_1: 1, tier_2: 2, tier_3: 3 };
// Only an 'active' subscription entitles (status ∈ pending|active|suspended|cancelled|expired).
const ACTIVE_STATES = ['active'];

// Derive caps from the ministry_subscriptions row: explicit boolean columns win,
// then the `features` jsonb override, then a plan-rank / limit-based default.
function capsFromSub(sub: any): MinistryCaps {
  const rank = PLAN_RANK[sub.plan_type as string] ?? 0;
  const f = sub.features && typeof sub.features === 'object' ? sub.features : {};
  const feat = (k: string, fallback: boolean) => (typeof f[k] === 'boolean' ? f[k] : fallback);
  const broadcastAllowed = (sub.broadcast_limit ?? 0) !== 0; // 0 = none, -1 = unlimited
  const liveAllowed = (sub.video_minutes_limit ?? 0) !== 0;
  return {
    branding: feat('branding', rank >= 2),
    whiteLabel: !!sub.white_label_enabled || feat('whiteLabel', false),
    customDomain: !!sub.custom_domain_enabled || feat('customDomain', false),
    liveChannels: feat('liveChannels', liveAllowed),
    interactiveMeetings: feat('interactiveMeetings', liveAllowed),
    recordMeetings: feat('recordMeetings', rank >= 2),
    broadcastMessaging: feat('broadcastMessaging', broadcastAllowed),
    manageTeam: feat('manageTeam', rank >= 2),
    rolePermissions: feat('rolePermissions', rank >= 3),
    advancedAnalytics: feat('advancedAnalytics', rank >= 3),
    prioritySupport: !!sub.priority_support || feat('prioritySupport', rank >= 3),
  };
}

/**
 * Resolve a ministry's entitlements from its ministry_subscriptions row. Falls back to
 * FREE when there's no active subscription (the common case today — table is empty).
 */
export async function getMinistryEntitlements(
  ministryId: string | null | undefined,
): Promise<MinistryEntitlements> {
  if (!ministryId) return FREE_ENTITLEMENTS;
  try {
    const { data: sub } = await supabase
      .from('ministry_subscriptions')
      .select('*')
      .eq('ministry_id', ministryId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub || !ACTIVE_STATES.includes(sub.status)) return FREE_ENTITLEMENTS;

    return {
      tierSlug: sub.plan_type || 'free',
      tierName: sub.plan_type ? sub.plan_type[0].toUpperCase() + sub.plan_type.slice(1) : 'Free',
      status: sub.status,
      trialEndsAt: sub.trial_ends_at ?? null,
      currentPeriodEnd: sub.current_period_end ?? null,
      limits: {
        members: sub.member_limit ?? FREE_LIMITS.members,
        storageMb: sub.storage_limit_mb ?? FREE_LIMITS.storageMb,
        broadcasts: sub.broadcast_limit ?? FREE_LIMITS.broadcasts,
        videoMinutes: sub.video_minutes_limit ?? FREE_LIMITS.videoMinutes,
        apiCalls: sub.api_calls_limit ?? FREE_LIMITS.apiCalls,
      },
      caps: capsFromSub(sub),
    };
  } catch (error) {
    console.error('[ministryEntitlements] resolve error:', error);
    return FREE_ENTITLEMENTS;
  }
}
