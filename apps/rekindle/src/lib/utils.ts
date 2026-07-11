// =====================================================
// UTILS.TS - TEMPORARY COMBINED FILE
// =====================================================
// NOTE: This file temporarily contains BOTH:
// 1. Original Tailwind utility (cn function)
// 2. Subscription Upgrade Service (temporary - should be in separate file)
//
// TODO: Move subscription functions to src/lib/subscriptionUpgradeService.ts
// =====================================================

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { supabase } from '@/lib/supabase';

// =====================================================
// ORIGINAL TAILWIND UTILITY - KEEP THIS
// =====================================================

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// =====================================================
// SUBSCRIPTION UPGRADE SERVICE - TEMPORARY LOCATION
// TODO: Move to separate file subscriptionUpgradeService.ts
// =====================================================

export type SubscriptionTier = 'free' | 'premium' | 'premium_plus' | 'ministry';

export const TIER_HIERARCHY: Record<SubscriptionTier, number> = {
  'free': 0,
  'premium': 1,
  'premium_plus': 2,
  'ministry': 3
};

interface UpgradeResult {
  success: boolean;
  error?: string;
  previousTier?: SubscriptionTier;
  newTier?: SubscriptionTier;
}

/**
 * Universal subscription upgrade handler
 * Works for ANY tier transition
 */
export async function handleSubscriptionUpgrade(
  userId: string,
  newTier: SubscriptionTier
): Promise<UpgradeResult> {
  try {
    const { data: currentProfile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('subscription_tier')
      .eq('user_id', userId)
      .single();

    if (fetchError) throw fetchError;

    const previousTier = (currentProfile?.subscription_tier || 'free') as SubscriptionTier;

    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ 
        subscription_tier: newTier,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (updateError) throw updateError;

    await performTierSpecificSetup(userId, newTier, previousTier);
    await logSubscriptionChange(userId, previousTier, newTier);

    console.log(`[Subscription] Upgraded ${userId} from ${previousTier} to ${newTier}`);

    return { 
      success: true,
      previousTier,
      newTier
    };
  } catch (error) {
    console.error('[Subscription] Upgrade failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Upgrade failed' 
    };
  }
}

async function performTierSpecificSetup(
  userId: string,
  newTier: SubscriptionTier,
  previousTier: SubscriptionTier
): Promise<void> {
  
  if (newTier === 'ministry') {
    await setupMinistryAccess(userId);
  }

  if (newTier === 'premium_plus') {
    await setupPremiumPlusAccess(userId);
  }

  if (newTier === 'premium') {
    await setupPremiumAccess(userId);
  }

  if (TIER_HIERARCHY[newTier] < TIER_HIERARCHY[previousTier]) {
    await handleDowngrade(userId, newTier, previousTier);
  }
}

async function setupMinistryAccess(userId: string): Promise<void> {
  try {
    await addUserToOwnedMinistries(userId);
    console.log('[Ministry] Setup completed for user:', userId);
  } catch (error) {
    console.error('[Ministry] Setup failed:', error);
  }
}

async function setupPremiumPlusAccess(userId: string): Promise<void> {
  try {
    console.log('[Premium Plus] Setup completed for user:', userId);
  } catch (error) {
    console.error('[Premium Plus] Setup failed:', error);
  }
}

async function setupPremiumAccess(userId: string): Promise<void> {
  try {
    console.log('[Premium] Setup completed for user:', userId);
  } catch (error) {
    console.error('[Premium] Setup failed:', error);
  }
}

async function handleDowngrade(
  userId: string,
  newTier: SubscriptionTier,
  previousTier: SubscriptionTier
): Promise<void> {
  try {
    console.log(`[Subscription] Handling downgrade from ${previousTier} to ${newTier}`);

    if (previousTier === 'ministry' && newTier !== 'ministry') {
      console.log('[Ministry] User downgraded but keeping ministry membership');
    }

    if (newTier === 'free') {
      console.log('[Free] User downgraded to free tier');
    }
  } catch (error) {
    console.error('[Subscription] Downgrade handling failed:', error);
  }
}

async function addUserToOwnedMinistries(userId: string): Promise<void> {
  try {
    const { data: ministries, error: ministriesError } = await supabase
      .from('ministries')
      .select('id')
      .eq('owner_id', userId);

    if (ministriesError) throw ministriesError;

    if (!ministries || ministries.length === 0) {
      console.log('[Ministry] No ministries found for user');
      return;
    }

    for (const ministry of ministries) {
      const { error: memberError } = await supabase
        .from('ministry_members')
        .upsert({
          ministry_id: ministry.id,
          user_id: userId,
          role: 'leader',
          status: 'active',
          created_at: new Date().toISOString()
        }, {
          onConflict: 'ministry_id,user_id'
        });

      if (memberError) {
        console.error('[Ministry] Failed to add user to ministry:', memberError);
      }
    }

    console.log(`[Ministry] Added user to ${ministries.length} ministries as leader`);
  } catch (error) {
    console.error('[Ministry] Error adding user to ministries:', error);
    throw error;
  }
}

async function logSubscriptionChange(
  userId: string,
  previousTier: SubscriptionTier,
  newTier: SubscriptionTier
): Promise<void> {
  try {
    const { error } = await supabase
      .from('subscription_changes')
      .insert({
        user_id: userId,
        previous_tier: previousTier,
        new_tier: newTier,
        changed_at: new Date().toISOString()
      });

    if (error && error.code !== '42P01') {
      console.error('[Subscription] Failed to log change:', error);
    }
  } catch (error) {
    console.error('[Subscription] Logging error:', error);
  }
}

/**
 * Create ministry and automatically add creator as leader
 */
export async function createMinistryWithLeader(
  userId: string,
  ministryData: {
    name: string;
    description?: string;
    logo_url?: string;
  }
): Promise<{ success: boolean; ministryId?: string; error?: string }> {
  try {
    const { data: ministry, error: ministryError } = await supabase
      .from('ministries')
      .insert({
        name: ministryData.name,
        description: ministryData.description,
        logo_url: ministryData.logo_url,
        owner_id: userId,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (ministryError) throw ministryError;

    const { error: memberError } = await supabase
      .from('ministry_members')
      .upsert({
        ministry_id: ministry.id,
        user_id: userId,
        role: 'leader',
        status: 'active',
        created_at: new Date().toISOString()
      }, {
        onConflict: 'ministry_id,user_id'
      });

    if (memberError) {
      console.error('[Ministry] Failed to add creator as leader:', memberError);
    }

    return { 
      success: true, 
      ministryId: ministry.id 
    };
  } catch (error) {
    console.error('[Ministry] Creation failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Creation failed' 
    };
  }
}

/**
 * Check if user needs ministry membership setup
 */
export async function ensureMinistryMembership(userId: string): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('subscription_tier')
      .eq('user_id', userId)
      .single();

    if (profile?.subscription_tier === 'ministry') {
      await addUserToOwnedMinistries(userId);
    }
  } catch (error) {
    console.error('[Ministry] Error ensuring membership:', error);
  }
}

/**
 * Check if upgrade is allowed
 */
export function canUpgradeToTier(
  currentTier: SubscriptionTier,
  targetTier: SubscriptionTier,
  options?: {
    allowDowngrades?: boolean;
  }
): { allowed: boolean; reason?: string } {
  const allowDowngrades = options?.allowDowngrades ?? true;

  const isDowngrade = TIER_HIERARCHY[targetTier] < TIER_HIERARCHY[currentTier];

  if (isDowngrade && !allowDowngrades) {
    return {
      allowed: false,
      reason: 'Downgrades are not allowed. Please contact support.'
    };
  }

  if (currentTier === targetTier) {
    return {
      allowed: false,
      reason: 'User is already on this tier'
    };
  }

  return { allowed: true };
}

/**
 * Get tier features for comparison
 */
export function getTierFeatures(tier: SubscriptionTier): string[] {
  const features: Record<SubscriptionTier, string[]> = {
    'free': [
      'Basic features',
      'View live streams',
      'Join channels',
      'Limited uploads'
    ],
    'premium': [
      'All Free features',
      'View analytics for owned channels',
      'Priority support',
      'Unlimited uploads',
      'No ads'
    ],
    'premium_plus': [
      'All Premium features',
      'Advanced analytics',
      'Custom branding',
      'API access',
      'White-label options'
    ],
    'ministry': [
      'All Premium Plus features',
      'Ministry management',
      'Ministry channel analytics',
      'Member management',
      'Multi-admin support',
      'Donation integration'
    ]
  };

  return features[tier] || [];
}

/**
 * Manual upgrade function for testing/admin panel
 */
export async function adminUpgradeUser(
  adminUserId: string,
  targetUserId: string,
  newTier: SubscriptionTier
): Promise<UpgradeResult> {
  try {
    const { data: admin } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', adminUserId)
      .single();

    if (admin?.role !== 'admin') {
      return { 
        success: false, 
        error: 'Unauthorized: Admin access required' 
      };
    }

    return await handleSubscriptionUpgrade(targetUserId, newTier);
  } catch (error) {
    console.error('[Admin] Upgrade failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Upgrade failed' 
    };
  }
}

// =====================================================
// DATE HELPERS
// =====================================================
/**
 * Returns the current calendar date in the VIEWER'S LOCAL timezone as "YYYY-MM-DD".
 *
 * Use this for date-only scheduling gates instead of
 *   new Date().toISOString().split('T')[0]
 * which returns the UTC date and therefore rolls over at the wrong moment
 * (e.g. it only becomes "today" at 07:00 in a UTC+7 timezone like Vietnam).
 */
export function getLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns the UTC instant (ISO string) for the END of the viewer's local day
 * for the given date — i.e. local 23:59:59.999. Useful when filtering a
 * timestamptz column so that anything scheduled for "today" (local) is included,
 * regardless of the UTC offset.
 */
export function endOfLocalDayISO(date: Date = new Date()): string {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
}
