import { supabase } from '@rekindle/supabase';
import { FREE_TIER_MEETING_LIMITS } from './subscriptionEnforcement';

export { FREE_TIER_MEETING_LIMITS };

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
  meetingHours: number | null; // null = unlimited
  broadcastHours: number | null; // null = unlimited
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
  /** Messenger/Instagram/website-chat channels in the Evangelism Inbox
   * ("Ministry CRM" in plan marketing copy). WhatsApp is on every plan and
   * isn't gated by this. */
  crmChannels: boolean;
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
  meetingHours: 5,
  broadcastHours: 0,
};

const NO_CAPS: MinistryCaps = {
  branding: false,
  whiteLabel: false,
  customDomain: false,
  liveChannels: false,
  // "Free Ministry Meetings": every ministry gets Interactive Meetings even
  // with no paid plan — bounded by FREE_TIER_MEETING_LIMITS (checked at
  // creation time via checkMinistryMeetingQuota below), not unlimited.
  interactiveMeetings: true,
  recordMeetings: false,
  broadcastMessaging: false,
  manageTeam: false,
  rolePermissions: false,
  advancedAnalytics: false,
  prioritySupport: false,
  crmChannels: false,
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
const PLAN_RANK: Record<string, number> = { starter: 1, growth_partner: 2, ministry_partner: 3, ministry_plus: 4 };
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
    // "Full Ministry CRM suite on Growth Partner and above" per the plan
    // copy (0258_ministry_tier_rebrand.sql) and the ministry_inbox_gate
    // upgrade prompt — same rank threshold as manageTeam/recordMeetings.
    crmChannels: feat('crmChannels', rank >= 2),
    // rank >= 4 = top tier only (ministry_plus) — was rank >= 3 back when there
    // were only 3 tiers; the 0258 rebrand added a 4th tier above ministry_partner.
    rolePermissions: feat('rolePermissions', rank >= 4),
    advancedAnalytics: feat('advancedAnalytics', rank >= 4),
    prioritySupport: !!sub.priority_support || feat('prioritySupport', rank >= 4),
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
        // meeting_hours_limit/broadcast_hours_limit: null in the DB means
        // unlimited (Ministry Partner and up) and must stay null here, not
        // fall back to FREE_LIMITS — only an *absent column* (undefined) falls back.
        meetingHours: sub.meeting_hours_limit !== undefined ? sub.meeting_hours_limit : FREE_LIMITS.meetingHours,
        broadcastHours: sub.broadcast_hours_limit !== undefined ? sub.broadcast_hours_limit : FREE_LIMITS.broadcastHours,
      },
      caps: capsFromSub(sub),
    };
  } catch (error) {
    console.error('[ministryEntitlements] resolve error:', error);
    return FREE_ENTITLEMENTS;
  }
}

function startOfMonthIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Free-tier monthly meeting TIME budget (minutes) for a ministry with no paid
 * plan — only meaningful when caps.interactiveMeetings came from NO_CAPS
 * (i.e. free), not from an active subscription (those aren't quota-limited
 * here). No cap on how many meetings, only on total allotted minutes and how
 * many can be live at once — see FREE_TIER_MEETING_LIMITS' header comment.
 *
 * Ministries have TWO separate meeting surfaces on two different tables —
 * this checks whichever one the caller is creating from, so each gets its
 * own budget rather than sharing one counter (a known simplification, not a
 * unified ministry-wide cap):
 *   - 'ministry_video_meetings' (the standalone ministry app's own Meetings tab)
 *   - 'live_channel_video_meetings' (a ministry-owned channel's meetings — pass channelId)
 *
 * used/limit are in MINUTES.
 */
export async function checkMinistryMeetingQuota(
  ministryId: string,
  table: 'ministry_video_meetings' | 'live_channel_video_meetings',
  channelId?: string,
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const isChannelTable = table === 'live_channel_video_meetings';
  const limitMinutes = FREE_TIER_MEETING_LIMITS.monthlyHours * 60;

  const minutesQuery = supabase.from(table).select('duration_minutes').gte('created_at', startOfMonthIso());
  const { data } = isChannelTable
    ? await minutesQuery.eq('channel_id', channelId ?? '')
    : await minutesQuery.eq('ministry_id', ministryId);
  const used = (data ?? []).reduce((sum: number, r: { duration_minutes?: number }) => sum + (r.duration_minutes ?? 0), 0);
  if (used >= limitMinutes) return { allowed: false, used, limit: limitMinutes };

  const activeQuery = supabase.from(table).select('id', { count: 'exact', head: true }).eq('is_active', true);
  const { count: activeCount } = isChannelTable
    ? await activeQuery.eq('channel_id', channelId ?? '')
    : await activeQuery.eq('ministry_id', ministryId);
  if ((activeCount ?? 0) >= FREE_TIER_MEETING_LIMITS.maxConcurrentActive) {
    return { allowed: false, used, limit: limitMinutes };
  }

  return { allowed: true, used, limit: limitMinutes };
}
