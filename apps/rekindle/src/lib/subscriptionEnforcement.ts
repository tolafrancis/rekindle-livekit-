// =====================================================
// SUBSCRIPTION ENFORCEMENT ENGINE
// Strict tier-based access control with real-time enforcement
// =====================================================

import { supabase } from '@/lib/supabase';

// =====================================================
// VALIDATION HELPERS
// =====================================================

/**
 * Validate if a string is a proper UUID
 */
function isValidUUID(str: string | null | undefined): boolean {
  if (!str) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// =====================================================
// TYPES
// =====================================================

export interface SubscriptionTier {
  id: string;
  name: string;
  slug: string;
  
  // Live Channel Limits
  max_live_channels: number | null;
  can_create_live_channels: boolean;
  can_host_interactive_meetings: boolean;
  max_meeting_duration_minutes: number | null;
  can_record_meetings: boolean;
  can_access_replays: boolean;
  max_replay_sessions: number | null;
  can_use_broadcast_messaging: boolean;
  can_schedule_recurring_sessions: boolean;
  max_co_hosts: number;
  can_invite_guest_speakers: boolean;
  can_enable_prayer_topics: boolean;
  can_use_moderation_tools: boolean;
  
  // Content Access
  devotional_access_level: 'limited' | 'unlimited';
  devotional_library_access_level: 'limited' | 'unlimited';
  prayer_library_access_level: 'limited' | 'unlimited';
  can_access_book_summaries: boolean;
  bible_reading_plans_access: 'limited' | 'unlimited';
  
  // Community
  community_prayer_wall_access: 'limited' | 'full';
  can_share_revelations: boolean;
  can_participate_in_community: boolean;
  
  // Personal Tools
  max_journal_entries: number | null;
  max_scripture_memory_verses: number;
  gracecounsel_ai_usage: 'limited' | 'expanded' | 'unlimited';
  
  // Counsellor
  can_book_counsellor: boolean;
  
  // Analytics
  analytics_level: 'basic' | 'advanced' | 'ministry' | 'enterprise';
  can_export_data: boolean;
  can_access_channel_analytics: boolean;
  can_access_community_insights: boolean;
  
  // Downloads
  can_download_offline: boolean;
  
  // Ministry Features
  can_access_counsellor_dashboard: boolean;
  can_manage_team: boolean;
  can_use_role_permissions: boolean;
  can_customize_dashboard: boolean;
  can_use_ministry_branding: boolean;
  
  // White-Label
  can_use_white_label: boolean;
  can_customize_homepage: boolean;
  can_use_custom_widgets: boolean;
  has_priority_infrastructure: boolean;
  has_sla_support: boolean;
  
  // Support
  support_level: 'community' | 'priority' | 'dedicated' | 'sla';
}

export interface UserSubscription {
  id: string;
  user_id: string;
  subscription_tier_id: string;
  status: 'active' | 'past_due' | 'cancelled' | 'expired' | 'trial';
  started_at: string;
  expires_at: string | null;
  trial_ends_at: string | null;
  is_admin_override: boolean;
  live_channels_created: number;
  total_meeting_minutes: number;
  tier: SubscriptionTier;
}

export interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
  tier_required?: string;
  current_tier?: string;
  upgrade_url?: string;
}

export interface UsageCheckResult extends AccessCheckResult {
  current_usage: number;
  limit: number | null; // null = unlimited
  percentage?: number;
}

export interface UsageLimits {
  storage_mb: number;
  api_calls: number;
  live_minutes: number;
  members: number;
}

export interface CurrentUsage {
  storage_mb: number;
  api_calls: number;
  live_minutes: number;
  members: number;
}

export interface LimitCheckResult {
  allowed: boolean;
  limit: number;
  current: number;
  percentage: number;
  exceeds: boolean;
  nearLimit: boolean;
  message?: string;
}


// =====================================================
// CORE SUBSCRIPTION RETRIEVAL
// =====================================================

/**
 * Get user's active subscription with full tier details
 */
export async function getUserActiveSubscription(userId: string): Promise<UserSubscription | null> {
  try {
    // Validate userId is a proper UUID
    if (!isValidUUID(userId)) {
      console.warn('[Subscription] Invalid userId provided (expected UUID, got):', userId || 'undefined');
      return null;
    }

    const { data, error } = await supabase.rpc('get_user_active_subscription', {
      p_user_id: userId
    });

    if (error) {
      console.error('[Subscription] RPC error:', error);
      throw error;
    }
    
    if (!data || data.length === 0) {
      console.log('[Subscription] No active subscription found for user');
      return null;
    }

    const subscription = data[0];
    
    // Parse tier details from JSONB
    const tierDetails = subscription.tier_details;

    return {
      id: subscription.subscription_id,
      user_id: userId,
      subscription_tier_id: tierDetails.id,
      status: subscription.status,
      started_at: new Date().toISOString(),
      expires_at: subscription.expires_at,
      trial_ends_at: null,
      is_admin_override: false,
      live_channels_created: 0,
      total_meeting_minutes: 0,
      tier: tierDetails as SubscriptionTier
    };
  } catch (error) {
    console.error('[Subscription] Error getting active subscription:', error);
    return null;
  }
}

/**
 * Get subscription tier by slug (cached locally)
 */
let tierCache: Record<string, SubscriptionTier> = {};
export async function getSubscriptionTierBySlug(slug: string): Promise<SubscriptionTier | null> {
  // Check cache first
  if (tierCache[slug]) {
    return tierCache[slug];
  }

  try {
    const { data, error } = await supabase
      .from('subscription_tiers')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (error) throw error;
    if (!data) return null;

    // Cache the tier
    tierCache[slug] = data as SubscriptionTier;
    return data as SubscriptionTier;
  } catch (error) {
    console.error('[Subscription] Error getting tier:', error);
    return null;
  }
}

/**
 * Clear tier cache (call when tiers are updated)
 */
export function clearTierCache() {
  tierCache = {};
}

// =====================================================
// ACCESS CONTROL - LIVE CHANNELS
// =====================================================

/**
 * Check if user can create a new live channel
 */
export async function canCreateLiveChannel(userId: string): Promise<AccessCheckResult> {
  const subscription = await getUserActiveSubscription(userId);
  
  if (!subscription) {
    return {
      allowed: false,
      reason: 'No active subscription found',
      tier_required: 'premium',
      upgrade_url: '/subscribe'
    };
  }

  const tier = subscription.tier;

  // Check if tier allows creating channels
  if (!tier.can_create_live_channels) {
    return {
      allowed: false,
      reason: 'Your subscription tier does not allow creating live channels',
      tier_required: 'premium',
      current_tier: tier.slug,
      upgrade_url: '/subscribe'
    };
  }

  // Check channel limit
  if (tier.max_live_channels !== null) {
    // Count user's active channels - FIXED to match LiveChannels.tsx query
    const { count, error } = await supabase
      .from('live_channels')
      .select('id', { count: 'exact' })
      .eq('owner_id', userId);

    if (error) {
      console.error('[Subscription] Error counting channels:', error);
      // Provide more detailed error info for debugging
      return {
        allowed: false,
        reason: `Unable to verify channel limit: ${error.message || JSON.stringify(error)}`
      };
    }

    if ((count || 0) >= tier.max_live_channels) {
      return {
        allowed: false,
        reason: `Channel limit reached (${tier.max_live_channels} channels). Upgrade to create more channels.`,
        tier_required: tier.slug === 'premium' ? 'premium_plus' : tier.slug === 'premium_plus' ? 'ministry' : 'ministry_plus',
        current_tier: tier.slug,
        upgrade_url: '/subscribe'
      };
    }
  }

  return { allowed: true };
}

/**
 * Check if user can host interactive meetings
 */
export async function canHostInteractiveMeeting(userId: string): Promise<AccessCheckResult> {
  const subscription = await getUserActiveSubscription(userId);
  
  if (!subscription) {
    return {
      allowed: false,
      reason: 'No active subscription found',
      tier_required: 'premium_plus'
    };
  }

  if (!subscription.tier.can_host_interactive_meetings) {
    return {
      allowed: false,
      reason: 'Interactive meetings require Premium Plus or higher',
      tier_required: 'premium_plus',
      current_tier: subscription.tier.slug
    };
  }

  return { allowed: true };
}

/**
 * Get maximum meeting duration for user
 */
export async function getMaxMeetingDuration(userId: string): Promise<number | null> {
  const subscription = await getUserActiveSubscription(userId);
  if (!subscription) return 0;
  return subscription.tier.max_meeting_duration_minutes; // null = unlimited
}

/**
 * Check if user can record meetings
 */
export async function canRecordMeetings(userId: string): Promise<AccessCheckResult> {
  const subscription = await getUserActiveSubscription(userId);
  
  if (!subscription) {
    return {
      allowed: false,
      reason: 'No active subscription found',
      tier_required: 'ministry_plus'
    };
  }

  if (!subscription.tier.can_record_meetings) {
    return {
      allowed: false,
      reason: 'Meeting recording requires Ministry Plus',
      tier_required: 'ministry_plus',
      current_tier: subscription.tier.slug
    };
  }

  return { allowed: true };
}

/**
 * Check if user can access replay library
 */
export async function canAccessReplays(userId: string): Promise<AccessCheckResult> {
  const subscription = await getUserActiveSubscription(userId);
  
  if (!subscription) {
    return {
      allowed: false,
      reason: 'No active subscription found',
      tier_required: 'premium_plus'
    };
  }

  if (!subscription.tier.can_access_replays) {
    return {
      allowed: false,
      reason: 'Replay access requires Premium Plus or higher',
      tier_required: 'premium_plus',
      current_tier: subscription.tier.slug
    };
  }

  return { allowed: true };
}

/**
 * Check if user can use broadcast messaging
 */
export async function canUseBroadcastMessaging(userId: string): Promise<AccessCheckResult> {
  const subscription = await getUserActiveSubscription(userId);
  
  if (!subscription) {
    return {
      allowed: false,
      reason: 'No active subscription found',
      tier_required: 'ministry'
    };
  }

  if (!subscription.tier.can_use_broadcast_messaging) {
    return {
      allowed: false,
      reason: 'Broadcast messaging requires Ministry tier or higher',
      tier_required: 'ministry',
      current_tier: subscription.tier.slug
    };
  }

  return { allowed: true };
}

// =====================================================
// ACCESS CONTROL - CONTENT & LIBRARY
// =====================================================

/**
 * Check if user can access book summaries
 */
export async function canAccessBookSummaries(userId: string): Promise<AccessCheckResult> {
  const subscription = await getUserActiveSubscription(userId);
  
  if (!subscription) {
    return {
      allowed: false,
      reason: 'Book summaries require Premium subscription',
      tier_required: 'premium'
    };
  }

  if (!subscription.tier.can_access_book_summaries) {
    return {
      allowed: false,
      reason: 'Book summaries require Premium subscription',
      tier_required: 'premium',
      current_tier: subscription.tier.slug
    };
  }

  return { allowed: true };
}

/**
 * Check if user can share revelations
 */
export async function canShareRevelations(userId: string): Promise<AccessCheckResult> {
  const subscription = await getUserActiveSubscription(userId);
  
  if (!subscription) {
    return {
      allowed: false,
      reason: 'Sharing revelations requires Premium subscription',
      tier_required: 'premium'
    };
  }

  if (!subscription.tier.can_share_revelations) {
    return {
      allowed: false,
      reason: 'Sharing revelations requires Premium subscription',
      tier_required: 'premium',
      current_tier: subscription.tier.slug
    };
  }

  return { allowed: true };
}

/**
 * Check if user can book counsellor
 */
export async function canBookCounsellor(userId: string): Promise<AccessCheckResult> {
  const subscription = await getUserActiveSubscription(userId);
  
  if (!subscription) {
    return {
      allowed: false,
      reason: 'Counsellor booking requires Premium subscription',
      tier_required: 'premium'
    };
  }

  if (!subscription.tier.can_book_counsellor) {
    return {
      allowed: false,
      reason: 'Counsellor booking requires Premium subscription',
      tier_required: 'premium',
      current_tier: subscription.tier.slug
    };
  }

  return { allowed: true };
}

/**
 * Check scripture memory limit
 */
export async function canAddScriptureMemory(userId: string): Promise<UsageCheckResult> {
  const subscription = await getUserActiveSubscription(userId);
  
  if (!subscription) {
    return {
      allowed: false,
      reason: 'No active subscription found',
      current_usage: 0,
      limit: 5
    };
  }

  // Count current scripture memories
  const { count, error } = await supabase
    .from('scripture_memory')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    console.error('[Subscription] Error counting scripture memories:', error);
    return {
      allowed: false,
      reason: 'Unable to verify scripture memory count',
      current_usage: 0,
      limit: subscription.tier.max_scripture_memory_verses
    };
  }

  const currentCount = count || 0;
  const limit = subscription.tier.max_scripture_memory_verses;

  if (currentCount >= limit) {
    return {
      allowed: false,
      reason: `Scripture memory limit reached (${limit} verses)`,
      current_usage: currentCount,
      limit: limit,
      percentage: 100
    };
  }

  return {
    allowed: true,
    current_usage: currentCount,
    limit: limit,
    percentage: Math.round((currentCount / limit) * 100)
  };
}

// =====================================================
// ACCESS CONTROL - ANALYTICS & FEATURES
// =====================================================

/**
 * Check if user can access advanced analytics
 */
export async function canAccessAdvancedAnalytics(userId: string): Promise<AccessCheckResult> {
  const subscription = await getUserActiveSubscription(userId);
  
  if (!subscription) {
    return {
      allowed: false,
      reason: 'Advanced analytics require Premium subscription',
      tier_required: 'premium'
    };
  }

  if (subscription.tier.analytics_level === 'basic') {
    return {
      allowed: false,
      reason: 'Advanced analytics require Premium or higher',
      tier_required: 'premium',
      current_tier: subscription.tier.slug
    };
  }

  return { allowed: true };
}

/**
 * Check if user can export data
 */
export async function canExportData(userId: string): Promise<AccessCheckResult> {
  const subscription = await getUserActiveSubscription(userId);
  
  if (!subscription) {
    return {
      allowed: false,
      reason: 'Data export requires Premium subscription',
      tier_required: 'premium'
    };
  }

  if (!subscription.tier.can_export_data) {
    return {
      allowed: false,
      reason: 'Data export requires Premium subscription',
      tier_required: 'premium',
      current_tier: subscription.tier.slug
    };
  }

  return { allowed: true };
}

/**
 * Check if user can download offline content
 */
export async function canDownloadOffline(userId: string): Promise<AccessCheckResult> {
  const subscription = await getUserActiveSubscription(userId);
  
  if (!subscription) {
    return {
      allowed: false,
      reason: 'Offline downloads require Premium subscription',
      tier_required: 'premium'
    };
  }

  if (!subscription.tier.can_download_offline) {
    return {
      allowed: false,
      reason: 'Offline downloads require Premium subscription',
      tier_required: 'premium',
      current_tier: subscription.tier.slug
    };
  }

  return { allowed: true };
}

/**
 * Check if user can access counsellor dashboard
 */
export async function canAccessCounsellorDashboard(userId: string): Promise<AccessCheckResult> {
  const subscription = await getUserActiveSubscription(userId);
  
  if (!subscription) {
    return {
      allowed: false,
      reason: 'Counsellor dashboard requires Ministry subscription',
      tier_required: 'ministry'
    };
  }

  if (!subscription.tier.can_access_counsellor_dashboard) {
    return {
      allowed: false,
      reason: 'Counsellor dashboard requires Ministry subscription',
      tier_required: 'ministry',
      current_tier: subscription.tier.slug
    };
  }

  return { allowed: true };
}

/**
 * Check if user can use white-label features
 */
export async function canUseWhiteLabel(userId: string): Promise<AccessCheckResult> {
  const subscription = await getUserActiveSubscription(userId);
  
  if (!subscription) {
    return {
      allowed: false,
      reason: 'White-label features require Ministry Plus subscription',
      tier_required: 'ministry_plus'
    };
  }

  if (!subscription.tier.can_use_white_label) {
    return {
      allowed: false,
      reason: 'White-label features require Ministry Plus subscription',
      tier_required: 'ministry_plus',
      current_tier: subscription.tier.slug
    };
  }

  return { allowed: true };
}

// =====================================================
// USAGE LOGGING
// =====================================================

/**
 * Log subscription usage activity
 */
export async function logUsage(
  _userId: string,
  _usageType: string,
  _resourceType?: string,
  _resourceId?: string,
  _quantity: number = 1,
  _durationMinutes?: number,
  _metadata?: Record<string, any>
): Promise<void> {
  // log_subscription_usage RPC removed — subscription system replaced by Partner model
  return;
}

// =====================================================
// ADMIN FUNCTIONS
// =====================================================

/**
 * Admin: Assign subscription to user (bypass payment)
 */
export async function adminAssignSubscription(
  userId: string,
  tierSlug: string,
  adminUserId: string,
  reason: string,
  expiresAt?: string,
  notes?: string
): Promise<{ success: boolean; error?: string; subscription?: any }> {
  try {
    // Get the tier
    const tier = await getSubscriptionTierBySlug(tierSlug);
    if (!tier) {
      return { success: false, error: 'Invalid subscription tier' };
    }

    // Get existing active subscription
    const { data: existingSubscriptions } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');

    const existingSubscription = existingSubscriptions?.[0];

    // Create override log
    await supabase.from('subscription_admin_overrides').insert({
      user_id: userId,
      admin_id: adminUserId,
      previous_tier: existingSubscription?.tier_id || existingSubscription?.subscription_tier_id,
      new_tier: tier.id,
      previous_status: existingSubscription?.status,
      new_status: 'active',
      previous_expires_at: existingSubscription?.expires_at,
      new_expires_at: expiresAt || null,
      reason: reason,
      notes: notes,
      user_subscription_id: existingSubscription?.id
    });

    // Cancel existing subscription if it exists
    if (existingSubscription) {
      await supabase
        .from('user_subscriptions')
        .update({ 
          status: 'cancelled', 
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existingSubscription.id);
    }

    // Create new subscription (use tier_id not subscription_tier_id)
    const { data: newSubscription, error } = await supabase
      .from('user_subscriptions')
      .insert({
        user_id: userId,
        tier_id: tier.id,  // Changed from subscription_tier_id
        status: 'active',
        starts_at: new Date().toISOString(),
        expires_at: expiresAt || null,
        assigned_by: adminUserId,
        assignment_reason: reason,
        notes: notes
      })
      .select()
      .single();

    if (error) {
      console.error('[Subscription] Insert error:', error);
      throw error;
    }

    // Update user_profiles
    await supabase
      .from('user_profiles')
      .update({
        subscription_tier: tierSlug,
        subscription_status: 'active',
        subscription_ends_at: expiresAt || null
      })
      .eq('user_id', userId);

    return { success: true, subscription: newSubscription };
  } catch (error: any) {
    console.error('[Subscription] Error assigning subscription:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Admin: Upgrade user subscription
 */
export async function adminUpgradeSubscription(
  userId: string,
  newTierSlug: string,
  adminUserId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 1); // Default to 1 month
  
  return adminAssignSubscription(
    userId,
    newTierSlug,
    adminUserId,
    reason,
    expiresAt.toISOString(),
    'Upgraded by admin'
  );
}

/**
 * Admin: Downgrade user subscription
 */
export async function adminDowngradeSubscription(
  userId: string,
  newTierSlug: string,
  adminUserId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  return adminAssignSubscription(
    userId,
    newTierSlug,
    adminUserId,
    reason,
    undefined,
    'Downgraded by admin'
  );
}

/**
 * Admin: Cancel user subscription
 */
export async function adminCancelSubscription(
  userId: string,
  adminUserId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get active subscription
    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (!subscription) {
      return { success: false, error: 'No active subscription found' };
    }

    // Log override
    await supabase.from('subscription_admin_overrides').insert({
      user_id: userId,
      admin_id: adminUserId,
      previous_tier: subscription.subscription_tier_id,
      new_tier: null,
      previous_status: 'active',
      new_status: 'cancelled',
      previous_expires_at: subscription.expires_at,
      new_expires_at: new Date().toISOString(),
      reason: reason,
      user_subscription_id: subscription.id
    });

    // Cancel subscription
    await supabase
      .from('user_subscriptions')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', subscription.id);

    // Move to free tier
    const freeTier = await getSubscriptionTierBySlug('free');
    if (freeTier) {
      await adminAssignSubscription(userId, 'free', adminUserId, 'Cancelled subscription', undefined, reason);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[Subscription] Error cancelling subscription:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Admin: Extend subscription expiry date
 */
export async function adminExtendSubscription(
  userId: string,
  newExpiryDate: string,
  adminUserId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (!subscription) {
      return { success: false, error: 'No active subscription found' };
    }

    // Log override
    await supabase.from('subscription_admin_overrides').insert({
      user_id: userId,
      admin_id: adminUserId,
      previous_tier: subscription.subscription_tier_id,
      new_tier: subscription.subscription_tier_id,
      previous_status: 'active',
      new_status: 'active',
      previous_expires_at: subscription.expires_at,
      new_expires_at: newExpiryDate,
      reason: reason,
      user_subscription_id: subscription.id
    });

    // Update expiry
    await supabase
      .from('user_subscriptions')
      .update({ expires_at: newExpiryDate })
      .eq('id', subscription.id);

    // Update user_profiles
    await supabase
      .from('user_profiles')
      .update({ subscription_ends_at: newExpiryDate })
      .eq('user_id', userId);

    return { success: true };
  } catch (error: any) {
    console.error('[Subscription] Error extending subscription:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all subscription tiers
 */
export async function getAllSubscriptionTiers(): Promise<SubscriptionTier[]> {
  try {
    const { data, error } = await supabase
      .from('subscription_tiers')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;
    return (data as SubscriptionTier[]) || [];
  } catch (error) {
    console.error('[Subscription] Error getting tiers:', error);
    return [];
  }
}

/**
 * Get subscription statistics for admin
 */
export async function getSubscriptionStats(): Promise<{
  total_users: number;
  by_tier: Record<string, number>;
  active_subscriptions: number;
  expired_subscriptions: number;
}> {
  try {
    const { data: users, error } = await supabase
      .from('user_profiles')
      .select('subscription_tier');

    if (error) throw error;

    const byTier: Record<string, number> = {};
    users?.forEach((user: any) => {
      const tier = user.subscription_tier || 'free';
      byTier[tier] = (byTier[tier] || 0) + 1;
    });

    const { count: activeCount } = await supabase
      .from('user_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    const { count: expiredCount } = await supabase
      .from('user_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'expired');

    return {
      total_users: users?.length || 0,
      by_tier: byTier,
      active_subscriptions: activeCount || 0,
      expired_subscriptions: expiredCount || 0
    };
  } catch (error) {
    console.error('[Subscription] Error getting stats:', error);
    return {
      total_users: 0,
      by_tier: {},
      active_subscriptions: 0,
      expired_subscriptions: 0
    };
  }
}

// =====================================================
// LEGACY MINISTRY FUNCTIONS (PRESERVED FOR COMPATIBILITY)
// =====================================================

/**
 * Get subscription limits for a ministry
 */
export async function getMinistryLimits(ministryId: string): Promise<UsageLimits | null> {
  try {
    // Get ministry's current subscription
    const { data: subscription } = await supabase
      .from('ministry_subscriptions')
      .select('*')
      .eq('ministry_id', ministryId)
      .single();

    if (!subscription) {
      // Return default free tier limits
      return {
        storage_mb: 500,
        api_calls: 1000,
        live_minutes: 60,
        members: 25
      };
    }

    // Return limits from subscription
    return {
      storage_mb: subscription.storage_limit_mb || 500,
      api_calls: subscription.api_calls_limit || 1000,
      live_minutes: subscription.video_minutes_limit || 60,
      members: subscription.member_limit || 25
    };
  } catch (error) {
    console.error('[Subscription] Error getting limits:', error);
    return null;
  }
}

/**
 * Get current usage for a ministry
 */
export async function getMinistryUsage(ministryId: string): Promise<CurrentUsage | null> {
  try {
    // Get latest usage metrics
    const { data: usage } = await supabase
      .from('ministry_usage_metrics')
      .select('*')
      .eq('ministry_id', ministryId)
      .order('period_start', { ascending: false })
      .limit(1)
      .single();

    if (!usage) {
      return {
        storage_mb: 0,
        api_calls: 0,
        live_minutes: 0,
        members: 0
      };
    }

    return {
      storage_mb: usage.storage_used_mb || 0,
      api_calls: usage.api_calls_count || 0,
      live_minutes: usage.live_minutes_used || 0,
      members: usage.members_count || 0
    };
  } catch (error) {
    console.error('[Subscription] Error getting usage:', error);
    return null;
  }
}

/**
 * Check if ministry can perform an action based on limits
 */
export async function checkLimit(
  ministryId: string,
  limitType: 'storage' | 'api_calls' | 'live_minutes' | 'members',
  incrementBy: number = 0
): Promise<LimitCheckResult> {
  const limits = await getMinistryLimits(ministryId);
  const usage = await getMinistryUsage(ministryId);

  if (!limits || !usage) {
    return {
      allowed: false,
      limit: 0,
      current: 0,
      percentage: 0,
      exceeds: true,
      nearLimit: false,
      message: 'Unable to verify limits'
    };
  }

  const limitMap: Record<string, keyof UsageLimits> = {
    storage: 'storage_mb',
    api_calls: 'api_calls',
    live_minutes: 'live_minutes',
    members: 'members'
  };

  const key = limitMap[limitType];
  const limit = limits[key];
  const current = usage[key];
  const projected = current + incrementBy;
  const percentage = (projected / limit) * 100;

  const exceeds = projected > limit;
  const nearLimit = percentage >= 80 && percentage < 100;

  let message: string | undefined;
  if (exceeds) {
    message = `${limitType} limit exceeded. Upgrade your plan to continue.`;
  } else if (nearLimit) {
    message = `Warning: ${limitType} usage at ${Math.round(percentage)}%`;
  }

  return {
    allowed: !exceeds,
    limit,
    current: projected,
    percentage: Math.round(percentage),
    exceeds,
    nearLimit,
    message
  };
}

/**
 * Enforce storage limit before upload
 */
export async function enforceStorageLimit(
  ministryId: string,
  fileSizeMB: number
): Promise<{ allowed: boolean; message?: string }> {
  const check = await checkLimit(ministryId, 'storage', fileSizeMB);
  
  if (!check.allowed) {
    return {
      allowed: false,
      message: `Storage limit exceeded. You've used ${check.current}MB of ${check.limit}MB. Please upgrade your plan.`
    };
  }

  if (check.nearLimit) {
    return {
      allowed: true,
      message: `Storage warning: ${check.percentage}% used`
    };
  }

  return { allowed: true };
}

/**
 * Enforce API call limit
 */
export async function enforceApiLimit(ministryId: string): Promise<{ allowed: boolean; message?: string }> {
  const check = await checkLimit(ministryId, 'api_calls', 1);
  
  if (!check.allowed) {
    return {
      allowed: false,
      message: 'API call limit exceeded for this billing period. Upgrade to continue.'
    };
  }

  // Increment usage
  await incrementUsage(ministryId, 'api_calls', 1);

  return { allowed: true };
}

/**
 * Enforce live streaming minutes limit
 */
export async function enforceLiveMinutesLimit(
  ministryId: string,
  minutes: number
): Promise<{ allowed: boolean; message?: string }> {
  const check = await checkLimit(ministryId, 'live_minutes', minutes);
  
  if (!check.allowed) {
    return {
      allowed: false,
      message: 'Live streaming minutes exceeded. Upgrade to unlock more streaming time.'
    };
  }

  return { allowed: true };
}

/**
 * Enforce member count limit
 */
export async function enforceMemberLimit(ministryId: string): Promise<{ allowed: boolean; message?: string }> {
  const check = await checkLimit(ministryId, 'members', 1);
  
  if (!check.allowed) {
    return {
      allowed: false,
      message: `Member limit reached (${check.limit} members). Upgrade to add more members.`
    };
  }

  return { allowed: true };
}

/**
 * Increment usage counter
 */
export async function incrementUsage(
  ministryId: string,
  usageType: 'storage' | 'api_calls' | 'live_minutes' | 'members',
  amount: number
): Promise<void> {
  try {
    // Get current period metrics
    const { data: currentMetrics } = await supabase
      .from('ministry_usage_metrics')
      .select('*')
      .eq('ministry_id', ministryId)
      .gte('period_end', new Date().toISOString())
      .single();

    if (!currentMetrics) {
      // Create new period
      const limits = await getMinistryLimits(ministryId);
      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await supabase.from('ministry_usage_metrics').insert({
        ministry_id: ministryId,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        storage_used_mb: usageType === 'storage' ? amount : 0,
        api_calls_count: usageType === 'api_calls' ? amount : 0,
        live_minutes_used: usageType === 'live_minutes' ? amount : 0,
        members_count: usageType === 'members' ? amount : 0,
        storage_limit_mb: limits?.storage_mb,
        api_calls_limit: limits?.api_calls,
        live_minutes_limit: limits?.live_minutes,
        members_limit: limits?.members
      });
    } else {
      // Update existing
      const updateField = {
        storage: 'storage_used_mb',
        api_calls: 'api_calls_count',
        live_minutes: 'live_minutes_used',
        members: 'members_count'
      }[usageType];

      await supabase
        .from('ministry_usage_metrics')
        .update({
          [updateField]: (currentMetrics[updateField] || 0) + amount,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentMetrics.id);
    }

    // Check if warning threshold reached (80%)
    const check = await checkLimit(ministryId, usageType, 0);
    if (check.nearLimit && !check.exceeds) {
      await sendUsageWarning(ministryId, usageType, check.percentage);
    }
  } catch (error) {
    console.error('[Subscription] Error incrementing usage:', error);
  }
}

/**
 * Send usage warning notification
 */
async function sendUsageWarning(
  ministryId: string,
  usageType: string,
  percentage: number
): Promise<void> {
  try {
    // Get ministry details
    const { data: ministry } = await supabase
      .from('ministries')
      .select('name, owner_id')
      .eq('id', ministryId)
      .single();

    if (!ministry) return;

    // Create notification (implement your notification system)
    console.log(`[Subscription] Warning: ${ministry.name} at ${percentage}% ${usageType} usage`);

    // You can implement email/in-app notifications here
    // await sendEmail(...);
    // await createNotification(...);
  } catch (error) {
    console.error('[Subscription] Error sending warning:', error);
  }
}

/**
 * Lock ministry features when limits exceeded
 */
export async function lockMinistryFeatures(ministryId: string, reason: string): Promise<void> {
  try {
    await supabase
      .from('ministries')
      .update({
        subscription_status: 'suspended',
        suspension_reason: reason
      })
      .eq('id', ministryId);

    // Log the suspension
    await supabase.from('audit_logs').insert({
      actor_id: 'system',
      actor_type: 'system',
      action: 'ministry_auto_suspended',
      entity_type: 'ministry',
      entity_id: ministryId,
      target_ministry_id: ministryId,
      metadata: { reason }
    });
  } catch (error) {
    console.error('[Subscription] Error locking features:', error);
  }
}

/**
 * Unlock ministry features
 */
export async function unlockMinistryFeatures(ministryId: string): Promise<void> {
  try {
    await supabase
      .from('ministries')
      .update({
        subscription_status: 'active',
        suspension_reason: null
      })
      .eq('id', ministryId);
  } catch (error) {
    console.error('[Subscription] Error unlocking features:', error);
  }
}

/**
 * Get usage summary for dashboard
 */
export async function getUsageSummary(ministryId: string) {
  const limits = await getMinistryLimits(ministryId);
  const usage = await getMinistryUsage(ministryId);

  if (!limits || !usage) return null;

  return {
    storage: {
      used: usage.storage_mb,
      limit: limits.storage_mb,
      percentage: Math.round((usage.storage_mb / limits.storage_mb) * 100),
      exceeded: usage.storage_mb > limits.storage_mb
    },
    apiCalls: {
      used: usage.api_calls,
      limit: limits.api_calls,
      percentage: Math.round((usage.api_calls / limits.api_calls) * 100),
      exceeded: usage.api_calls > limits.api_calls
    },
    liveMinutes: {
      used: usage.live_minutes,
      limit: limits.live_minutes,
      percentage: Math.round((usage.live_minutes / limits.live_minutes) * 100),
      exceeded: usage.live_minutes > limits.live_minutes
    },
    members: {
      used: usage.members,
      limit: limits.members,
      percentage: Math.round((usage.members / limits.members) * 100),
      exceeded: usage.members > limits.members
    }
  };
}