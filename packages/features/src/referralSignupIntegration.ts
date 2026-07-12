// src/lib/referralSignupIntegration.ts
// Helper functions to integrate referral system with user signup

import { supabase } from '@rekindle/supabase';
import { processReferralSignup, activateReferral } from './referralService';

// ============================================
// SIGNUP INTEGRATION
// ============================================

/**
 * Process referral code during user signup
 * Call this after user account is created
 */
export const applyReferralCodeOnSignup = async (
  userId: string,
  referralCode: string | null
): Promise<{ success: boolean; error: string | null }> => {
  if (!referralCode) {
    return { success: true, error: null };
  }

  try {
    const { success, referralId, error } = await processReferralSignup(userId, referralCode);

    if (!success) {
      console.warn('Referral processing failed:', error);
      // Don't block signup if referral fails
      return { success: true, error };
    }

    console.log('Referral processed successfully:', referralId);
    return { success: true, error: null };
  } catch (error: any) {
    console.error('Apply referral error:', error);
    // Don't block signup if referral fails
    return { success: true, error: error.message };
  }
};

/**
 * Check if user should have their referral activated
 * Call this when user completes onboarding or becomes "active"
 */
export const checkAndActivateReferral = async (userId: string): Promise<void> => {
  try {
    // Check if user has a pending referral
    const { data: referral, error } = await supabase
      .from('referrals')
      .select('id, status')
      .eq('referred_user_id', userId)
      .eq('status', 'pending')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No referral found, that's okay
        return;
      }
      throw error;
    }

    if (referral) {
      // Activate the referral
      const { success, error: activateError } = await activateReferral(referral.id);
      
      if (success) {
        console.log('Referral activated for user:', userId);
      } else {
        console.warn('Failed to activate referral:', activateError);
      }
    }
  } catch (error) {
    console.error('Check and activate referral error:', error);
  }
};

/**
 * Criteria for when a referral should be activated
 * Customize these based on your app's definition of "active user"
 */
export const shouldActivateReferral = (userActivity: {
  daysActive?: number;
  prayersCompleted?: number;
  devotionalsRead?: number;
  hasCompletedOnboarding?: boolean;
}): boolean => {
  // Example criteria - customize as needed
  return !!(
    userActivity.hasCompletedOnboarding ||
    (userActivity.daysActive && userActivity.daysActive >= 3) ||
    (userActivity.prayersCompleted && userActivity.prayersCompleted >= 5) ||
    (userActivity.devotionalsRead && userActivity.devotionalsRead >= 3)
  );
};

/**
 * Track user activity and auto-activate referral when criteria met
 */
export const trackActivityAndActivateReferral = async (
  userId: string,
  activityType: 'prayer' | 'devotional' | 'onboarding',
  count?: number
): Promise<void> => {
  try {
    // Get user's current activity stats
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('metadata')
      .eq('user_id', userId)
      .single();

    const metadata = profile?.metadata || {};
    const activity = metadata.activity || {};

    // Update activity based on type
    switch (activityType) {
      case 'prayer':
        activity.prayersCompleted = (activity.prayersCompleted || 0) + 1;
        break;
      case 'devotional':
        activity.devotionalsRead = (activity.devotionalsRead || 0) + 1;
        break;
      case 'onboarding':
        activity.hasCompletedOnboarding = true;
        break;
    }

    // Calculate days active
    const firstLogin = metadata.firstLoginAt || new Date().toISOString();
    const daysSinceFirst = Math.floor(
      (Date.now() - new Date(firstLogin).getTime()) / (1000 * 60 * 60 * 24)
    );
    activity.daysActive = daysSinceFirst;

    // Update profile
    await supabase
      .from('user_profiles')
      .update({
        metadata: {
          ...metadata,
          activity,
          firstLoginAt: firstLogin,
        },
      })
      .eq('user_id', userId);

    // Check if should activate referral
    if (shouldActivateReferral(activity)) {
      await checkAndActivateReferral(userId);
    }
  } catch (error) {
    console.error('Track activity error:', error);
  }
};

/**
 * Store referral code in session/localStorage for later application
 * Use this when user visits with referral code but hasn't signed up yet
 */
export const storeReferralCodeForLater = (code: string): void => {
  try {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('pending_referral_code', code);
      localStorage.setItem('pending_referral_code', code);
      
      // Also store timestamp for expiration check
      const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
      localStorage.setItem('pending_referral_expires', expiresAt.toString());
    }
  } catch (error) {
    console.error('Store referral code error:', error);
  }
};

/**
 * Retrieve stored referral code
 */
export const getStoredReferralCode = (): string | null => {
  try {
    if (typeof window === 'undefined') return null;

    // Check session storage first
    let code = sessionStorage.getItem('pending_referral_code');
    if (code) return code;

    // Check local storage with expiration
    code = localStorage.getItem('pending_referral_code');
    const expiresAt = localStorage.getItem('pending_referral_expires');

    if (code && expiresAt) {
      const expires = parseInt(expiresAt, 10);
      if (Date.now() < expires) {
        return code;
      } else {
        // Expired, clear it
        clearStoredReferralCode();
      }
    }

    return null;
  } catch (error) {
    console.error('Get stored referral code error:', error);
    return null;
  }
};

/**
 * Clear stored referral code
 */
export const clearStoredReferralCode = (): void => {
  try {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('pending_referral_code');
      localStorage.removeItem('pending_referral_code');
      localStorage.removeItem('pending_referral_expires');
    }
  } catch (error) {
    console.error('Clear stored referral code error:', error);
  }
};

// ============================================
// WEBHOOK HANDLERS (for automated activation)
// ============================================

/**
 * Example webhook handler for external services
 * Call this when receiving confirmation that user is active
 */
export const handleUserActivationWebhook = async (
  userId: string,
  activationData: {
    event: string;
    timestamp: string;
    metadata?: Record<string, any>;
  }
): Promise<void> => {
  try {
    // Log the activation event
    await supabase
      .from('user_activity_log')
      .insert({
        user_id: userId,
        event_type: 'activation',
        event_data: activationData,
        timestamp: activationData.timestamp,
      });

    // Activate referral
    await checkAndActivateReferral(userId);
  } catch (error) {
    console.error('Webhook handler error:', error);
  }
};

// ============================================
// ANALYTICS HELPERS
// ============================================

/**
 * Track referral conversion events
 */
export const trackReferralEvent = async (
  userId: string,
  eventType: 'signup' | 'activation' | 'conversion',
  metadata?: Record<string, any>
): Promise<void> => {
  try {
    await supabase
      .from('analytics_events')
      .insert({
        user_id: userId,
        event_type: `referral_${eventType}`,
        event_data: metadata || {},
        timestamp: new Date().toISOString(),
      });
  } catch (error) {
    console.error('Track referral event error:', error);
  }
};

// ============================================
// EXPORT ALL FUNCTIONS
// ============================================

export default {
  applyReferralCodeOnSignup,
  checkAndActivateReferral,
  shouldActivateReferral,
  trackActivityAndActivateReferral,
  storeReferralCodeForLater,
  getStoredReferralCode,
  clearStoredReferralCode,
  handleUserActivationWebhook,
  trackReferralEvent,
};