/**
 * useUserEntitlements — Partner-based entitlements
 *
 * New model: App is FREE for everyone. Partner status (any donation)
 * unlocks premium features. Ministry features require ministry subscription_tier.
 *
 * FREE for everyone:
 *   - Devotionals, Prayer library, Prayer wall, Community
 *   - Counselling, Scripture memory (unlimited), Book summaries (basic)
 *   - Live channel viewing
 *
 * PARTNER only (any donation):
 *   - Full devotional library (all series)
 *   - Book summaries (full)
 *   - Live channel creation
 *   - Replay access
 *   - Advanced prayer challenges
 *   - WhatsApp devotionals & affirmations
 *   - Offline downloads
 *
 * MINISTRY (subscription_tier = 'ministry'):
 *   - Ministry dashboard, broadcast, analytics, whitelabel
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@rekindle/supabase';

export interface UserEntitlements {
  // Loading state
  isLoading: boolean;

  // Partner status
  isPartner: boolean;
  partnerExpiresAt: string | null;

  // Ministry status
  hasMinistryAccess: boolean;
  isAdmin: boolean;

  // ── Features unlocked by Partner ──────────────────────────
  canCreateLiveChannel: boolean;
  canAccessBookSummaries: boolean;
  canAccessReplays: boolean;
  canDownloadOffline: boolean;
  hasUnlimitedDevotionals: boolean;
  hasUnlimitedPrayerLibrary: boolean;
  canShareRevelations: boolean;

  // ── Features free for everyone ────────────────────────────
  canBookCounsellor: boolean;          // free
  hasUnlimitedScriptureMemory: boolean; // free

  // ── Ministry-only features ────────────────────────────────
  canUseBroadcastMessaging: boolean;
  canAccessAdvancedAnalytics: boolean;
  canExportData: boolean;
  canAccessCounsellorDashboard: boolean;
  canManageTeam: boolean;
  canUseWhiteLabel: boolean;
  canHostInteractiveMeetings: boolean;
  canRecordMeetings: boolean;
  canAccessChannelAnalytics: boolean;

  // Legacy compat
  hasPremiumAccess: boolean;
  maxLiveChannels: number | null;
  maxMeetingDuration: number | null;
  subscription: null;

  refreshEntitlements: () => Promise<void>;
}

const FREE_ENTITLEMENTS: Omit<UserEntitlements, 'isLoading' | 'refreshEntitlements'> = {
  isPartner:                    false,
  partnerExpiresAt:             null,
  hasMinistryAccess:            false,
  isAdmin:                      false,
  // Partner features — locked
  canCreateLiveChannel:         false,
  canAccessBookSummaries:       false,
  canAccessReplays:             false,
  canDownloadOffline:           false,
  hasUnlimitedDevotionals:      false,
  hasUnlimitedPrayerLibrary:    false,
  canShareRevelations:          false,
  // Free features — always on
  canBookCounsellor:            true,
  hasUnlimitedScriptureMemory:  true,
  // Ministry features — locked
  canUseBroadcastMessaging:     false,
  canAccessAdvancedAnalytics:   false,
  canExportData:                false,
  canAccessCounsellorDashboard: false,
  canManageTeam:                false,
  canUseWhiteLabel:             false,
  canHostInteractiveMeetings:   false,
  canRecordMeetings:            false,
  canAccessChannelAnalytics:    false,
  // Legacy
  hasPremiumAccess:             false,
  maxLiveChannels:              null,
  maxMeetingDuration:           null,
  subscription:                 null,
};

export function useUserEntitlements(): UserEntitlements {
  const [isLoading, setIsLoading]       = useState(true);
  const [entitlements, setEntitlements] = useState<Omit<UserEntitlements, 'isLoading' | 'refreshEntitlements'>>(FREE_ENTITLEMENTS);

  const loadEntitlements = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setEntitlements(FREE_ENTITLEMENTS); return; }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role, subscription_tier, partner_expires_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile) { setEntitlements(FREE_ENTITLEMENTS); return; }

      const now              = new Date();
      const isPartner        = !!(profile.partner_expires_at && new Date(profile.partner_expires_at) > now);
      const isAdmin          = profile.role === 'admin' || profile.role === 'super_admin';
      const partnerTier      = (profile as any).partner_tier as 'individual' | 'ministry' | null;
      const isMinistryPartner = isPartner && partnerTier === 'ministry';
      const isMinistry       = isMinistryPartner || ['ministry', 'ministry_plus', 'ministry_starter', 'ministry_growth', 'ministry_enterprise'].includes(profile.subscription_tier || '');
      const partnerOrAdmin   = isPartner || isAdmin;
      const ministryOrAdmin  = isMinistry || isAdmin;

      setEntitlements({
        isPartner,
        partnerExpiresAt:             profile.partner_expires_at || null,
        hasMinistryAccess:            isMinistry,
        isAdmin,
        // Partner features
        canCreateLiveChannel:         isMinistry || isAdmin,
        canAccessBookSummaries:       partnerOrAdmin,
        canAccessReplays:             partnerOrAdmin,
        canDownloadOffline:           partnerOrAdmin,
        hasUnlimitedDevotionals:      partnerOrAdmin,
        hasUnlimitedPrayerLibrary:    true,  // prayer library free for all
        canShareRevelations:          partnerOrAdmin,
        // Free features
        canBookCounsellor:            true,
        hasUnlimitedScriptureMemory:  true,
        // Ministry features
        canUseBroadcastMessaging:     ministryOrAdmin,
        canAccessAdvancedAnalytics:   ministryOrAdmin,
        canExportData:                ministryOrAdmin,
        canAccessCounsellorDashboard: ministryOrAdmin,
        canManageTeam:                ministryOrAdmin,
        canUseWhiteLabel:             ministryOrAdmin,
        canHostInteractiveMeetings:   ministryOrAdmin,
        canRecordMeetings:            ministryOrAdmin,
        canAccessChannelAnalytics:    partnerOrAdmin || ministryOrAdmin,
        // Legacy compat
        hasPremiumAccess:             partnerOrAdmin,
        maxLiveChannels:              isAdmin ? null : isMinistry ? 2 : 0,
        maxMeetingDuration:           ministryOrAdmin ? null : partnerOrAdmin ? 60 : 0,
        subscription:                 null,
      });
    } catch (err) {
      console.error('[Entitlements] Error:', err);
      setEntitlements(FREE_ENTITLEMENTS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntitlements();
  }, [loadEntitlements]);

  return { ...entitlements, isLoading, refreshEntitlements: loadEntitlements };
}
