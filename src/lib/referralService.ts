// src/lib/referralService.ts
// Comprehensive referral system service with database integration

import { supabase, safeMutation } from './supabase';

// ============================================
// TYPES AND INTERFACES
// ============================================

export interface ReferralCode {
  id: string;
  user_id: string;
  code: string;
  created_at: string;
  expires_at: string | null;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  metadata: Record<string, any>;
}

export interface Referral {
  id: string;
  referrer_user_id: string;
  referred_user_id: string;
  referral_code_id: string;
  referral_code: string;
  status: 'pending' | 'active' | 'completed' | 'expired';
  referred_at: string;
  activated_at: string | null;
  completed_at: string | null;
  metadata: Record<string, any>;
  referrer_profile?: {
    full_name: string;
    avatar_url: string;
  };
  referred_profile?: {
    full_name: string;
    avatar_url: string;
  };
}

export interface ReferralReward {
  id: string;
  referral_id: string;
  user_id: string;
  reward_type: 'xp' | 'badge' | 'premium_days' | 'points';
  reward_value: Record<string, any>;
  awarded_at: string;
  claimed_at: string | null;
  is_claimed: boolean;
  metadata: Record<string, any>;
}

export interface ReferralMilestone {
  id: string;
  user_id: string;
  milestone_type: string;
  milestone_value: number;
  achieved_at: string;
  reward_type: string | null;
  reward_value: Record<string, any> | null;
  is_claimed: boolean;
  claimed_at: string | null;
}

export interface ReferralAnalytics {
  user_id: string;
  date: string;
  total_referrals: number;
  active_referrals: number;
  completed_referrals: number;
  total_xp_earned: number;
  total_rewards_earned: number;
  conversion_rate: number;
  metadata: Record<string, any>;
}

export interface ReferralStats {
  totalReferrals: number;
  activeReferrals: number;
  pendingReferrals: number;
  completedReferrals: number;
  totalXPEarned: number;
  conversionRate: number;
  unclaimedRewards: number;
  milestones: ReferralMilestone[];
}

// ============================================
// REFERRAL CODE OPERATIONS
// ============================================

/**
 * Generate a new referral code for the current user
 */
export const generateReferralCode = async (userId: string): Promise<{ code: ReferralCode | null; error: string | null }> => {
  try {
    // First, check if user already has an active code
    const { data: existing } = await supabase
      .from('referral_codes')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (existing) {
      return { code: existing, error: null };
    }

    // Generate new code using the database function
    const { data: newCodeData, error: codeError } = await supabase
      .rpc('generate_referral_code');

    if (codeError) throw codeError;

    // Create the referral code record
    const { data, error } = await supabase
      .from('referral_codes')
      .insert({
        user_id: userId,
        code: newCodeData,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    return { code: data, error: null };
  } catch (error: any) {
    console.error('[ReferralService] Generate code error:', error);
    return { code: null, error: error.message || 'Failed to generate referral code' };
  }
};

/**
 * Get user's referral codes
 */
export const getUserReferralCodes = async (userId: string): Promise<{ codes: ReferralCode[]; error: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('referral_codes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { codes: data || [], error: null };
  } catch (error: any) {
    console.error('[ReferralService] Get codes error:', error);
    return { codes: [], error: error.message };
  }
};

/**
 * Validate a referral code
 */
export const validateReferralCode = async (code: string): Promise<{ valid: boolean; codeData: ReferralCode | null; error: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('referral_codes')
      .select(`
        *,
        user_profiles!referral_codes_user_id_fkey(full_name, avatar_url)
      `)
      .eq('code', code)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { valid: false, codeData: null, error: 'Invalid referral code' };
      }
      throw error;
    }

    // Check expiration
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return { valid: false, codeData: null, error: 'Referral code has expired' };
    }

    // Check max uses
    if (data.max_uses && data.current_uses >= data.max_uses) {
      return { valid: false, codeData: null, error: 'Referral code has reached maximum uses' };
    }

    return { valid: true, codeData: data, error: null };
  } catch (error: any) {
    console.error('[ReferralService] Validate code error:', error);
    return { valid: false, codeData: null, error: error.message };
  }
};

/**
 * Deactivate a referral code
 */
export const deactivateReferralCode = async (codeId: string, userId: string): Promise<{ success: boolean; error: string | null }> => {
  return safeMutation(async () => {
    return await supabase
      .from('referral_codes')
      .update({ is_active: false })
      .eq('id', codeId)
      .eq('user_id', userId)
      .select()
      .single();
  });
};

// ============================================
// REFERRAL OPERATIONS
// ============================================

/**
 * Process a referral signup
 */
export const processReferralSignup = async (
  referredUserId: string,
  referralCode: string
): Promise<{ success: boolean; referralId: string | null; error: string | null }> => {
  try {
    const { data, error } = await supabase.rpc('process_referral_signup', {
      p_referred_user_id: referredUserId,
      p_referral_code: referralCode,
    });

    if (error) throw error;

    if (!data.success) {
      return { success: false, referralId: null, error: data.error };
    }

    return { success: true, referralId: data.referral_id, error: null };
  } catch (error: any) {
    console.error('[ReferralService] Process signup error:', error);
    return { success: false, referralId: null, error: error.message };
  }
};

/**
 * Get referrals made by a user
 */
export const getUserReferrals = async (
  userId: string,
  status?: string
): Promise<{ referrals: Referral[]; error: string | null }> => {
  try {
    let query = supabase
      .from('referrals')
      .select(`
        *,
        referrer_profile:user_profiles!referrals_referrer_user_id_fkey(full_name, avatar_url),
        referred_profile:user_profiles!referrals_referred_user_id_fkey(full_name, avatar_url)
      `)
      .eq('referrer_user_id', userId)
      .order('referred_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { referrals: data || [], error: null };
  } catch (error: any) {
    console.error('[ReferralService] Get referrals error:', error);
    return { referrals: [], error: error.message };
  }
};

/**
 * Activate a referral (when referred user becomes active)
 */
export const activateReferral = async (referralId: string): Promise<{ success: boolean; error: string | null }> => {
  try {
    const { data, error } = await supabase.rpc('activate_referral', {
      p_referral_id: referralId,
    });

    if (error) throw error;

    if (!data.success) {
      return { success: false, error: data.error };
    }

    return { success: true, error: null };
  } catch (error: any) {
    console.error('[ReferralService] Activate referral error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Check if a user was referred
 */
export const checkUserReferral = async (userId: string): Promise<{ referred: boolean; referral: Referral | null; error: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('referrals')
      .select(`
        *,
        referrer_profile:user_profiles!referrals_referrer_user_id_fkey(full_name, avatar_url)
      `)
      .eq('referred_user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { referred: false, referral: null, error: null };
      }
      throw error;
    }

    return { referred: true, referral: data, error: null };
  } catch (error: any) {
    console.error('[ReferralService] Check user referral error:', error);
    return { referred: false, referral: null, error: error.message };
  }
};

// ============================================
// REWARD OPERATIONS
// ============================================

/**
 * Get user's referral rewards
 */
export const getUserRewards = async (
  userId: string,
  claimedOnly: boolean = false
): Promise<{ rewards: ReferralReward[]; error: string | null }> => {
  try {
    let query = supabase
      .from('referral_rewards')
      .select('*')
      .eq('user_id', userId)
      .order('awarded_at', { ascending: false });

    if (claimedOnly) {
      query = query.eq('is_claimed', false);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { rewards: data || [], error: null };
  } catch (error: any) {
    console.error('[ReferralService] Get rewards error:', error);
    return { rewards: [], error: error.message };
  }
};

/**
 * Claim a reward
 */
export const claimReward = async (rewardId: string, userId: string): Promise<{ success: boolean; error: string | null }> => {
  return safeMutation(async () => {
    return await supabase
      .from('referral_rewards')
      .update({
        is_claimed: true,
        claimed_at: new Date().toISOString(),
      })
      .eq('id', rewardId)
      .eq('user_id', userId)
      .select()
      .single();
  });
};

/**
 * Claim all unclaimed rewards
 */
export const claimAllRewards = async (userId: string): Promise<{ count: number; totalXP: number; error: string | null }> => {
  try {
    // Get all unclaimed rewards
    const { rewards, error: fetchError } = await getUserRewards(userId, false);
    if (fetchError) throw new Error(fetchError);

    const unclaimedRewards = rewards.filter(r => !r.is_claimed);
    
    if (unclaimedRewards.length === 0) {
      return { count: 0, totalXP: 0, error: null };
    }

    // Calculate total XP
    const totalXP = unclaimedRewards
      .filter(r => r.reward_type === 'xp')
      .reduce((sum, r) => sum + (r.reward_value.amount || 0), 0);

    // Claim all rewards
    const { error: claimError } = await supabase
      .from('referral_rewards')
      .update({
        is_claimed: true,
        claimed_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('is_claimed', false);

    if (claimError) throw claimError;

    return { count: unclaimedRewards.length, totalXP, error: null };
  } catch (error: any) {
    console.error('[ReferralService] Claim all rewards error:', error);
    return { count: 0, totalXP: 0, error: error.message };
  }
};

// ============================================
// MILESTONE OPERATIONS
// ============================================

/**
 * Get user's milestones
 */
export const getUserMilestones = async (userId: string): Promise<{ milestones: ReferralMilestone[]; error: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('referral_milestones')
      .select('*')
      .eq('user_id', userId)
      .order('achieved_at', { ascending: false });

    if (error) throw error;

    return { milestones: data || [], error: null };
  } catch (error: any) {
    console.error('[ReferralService] Get milestones error:', error);
    return { milestones: [], error: error.message };
  }
};

/**
 * Claim a milestone reward
 */
export const claimMilestone = async (milestoneId: string, userId: string): Promise<{ success: boolean; error: string | null }> => {
  return safeMutation(async () => {
    return await supabase
      .from('referral_milestones')
      .update({
        is_claimed: true,
        claimed_at: new Date().toISOString(),
      })
      .eq('id', milestoneId)
      .eq('user_id', userId)
      .select()
      .single();
  });
};

// ============================================
// ANALYTICS OPERATIONS
// ============================================

/**
 * Get user's referral statistics
 */
export const getReferralStats = async (userId: string): Promise<{ stats: ReferralStats | null; error: string | null }> => {
  try {
    // Get referrals
    const { referrals, error: refError } = await getUserReferrals(userId);
    if (refError) throw new Error(refError);

    // Get rewards
    const { rewards, error: rewardError } = await getUserRewards(userId);
    if (rewardError) throw new Error(rewardError);

    // Get milestones
    const { milestones, error: milestoneError } = await getUserMilestones(userId);
    if (milestoneError) throw new Error(milestoneError);

    // Calculate stats
    const totalReferrals = referrals.length;
    const activeReferrals = referrals.filter(r => r.status === 'active').length;
    const pendingReferrals = referrals.filter(r => r.status === 'pending').length;
    const completedReferrals = referrals.filter(r => r.status === 'completed').length;
    
    const totalXPEarned = rewards
      .filter(r => r.reward_type === 'xp')
      .reduce((sum, r) => sum + (r.reward_value.amount || 0), 0);
    
    const conversionRate = totalReferrals > 0 
      ? (activeReferrals / totalReferrals) * 100 
      : 0;
    
    const unclaimedRewards = rewards.filter(r => !r.is_claimed).length;

    const stats: ReferralStats = {
      totalReferrals,
      activeReferrals,
      pendingReferrals,
      completedReferrals,
      totalXPEarned,
      conversionRate,
      unclaimedRewards,
      milestones,
    };

    return { stats, error: null };
  } catch (error: any) {
    console.error('[ReferralService] Get stats error:', error);
    return { stats: null, error: error.message };
  }
};

/**
 * Get referral analytics history
 */
export const getReferralAnalytics = async (
  userId: string,
  days: number = 30
): Promise<{ analytics: ReferralAnalytics[]; error: string | null }> => {
  try {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const { data, error } = await supabase
      .from('referral_analytics')
      .select('*')
      .eq('user_id', userId)
      .gte('date', fromDate.toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (error) throw error;

    return { analytics: data || [], error: null };
  } catch (error: any) {
    console.error('[ReferralService] Get analytics error:', error);
    return { analytics: [], error: error.message };
  }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generate shareable referral link
 */
export const generateReferralLink = (code: string): string => {
  const baseUrl = window.location.origin;
  return `${baseUrl}/signup?ref=${code}`;
};

/**
 * Copy referral link to clipboard
 */
export const copyReferralLink = async (code: string): Promise<boolean> => {
  try {
    const link = generateReferralLink(code);
    await navigator.clipboard.writeText(link);
    return true;
  } catch (error) {
    console.error('[ReferralService] Copy link error:', error);
    return false;
  }
};

/**
 * Share referral via Web Share API
 */
export const shareReferral = async (code: string, userName: string = 'Your friend'): Promise<boolean> => {
  try {
    if (!navigator.share) {
      return false;
    }

    const link = generateReferralLink(code);
    await navigator.share({
      title: 'Join Rekindle',
      text: `${userName} invited you to join Rekindle - A spiritual mentorship and prayer app`,
      url: link,
    });
    
    return true;
  } catch (error) {
    console.error('[ReferralService] Share error:', error);
    return false;
  }
};

/**
 * Format reward value for display
 */
export const formatRewardValue = (reward: ReferralReward): string => {
  switch (reward.reward_type) {
    case 'xp':
      return `${reward.reward_value.amount} XP`;
    case 'badge':
      return `Badge: ${reward.reward_value.badge_id}`;
    case 'premium_days':
      return `${reward.reward_value.days} Premium Days`;
    case 'points':
      return `${reward.reward_value.amount} Points`;
    default:
      return 'Reward';
  }
};

/**
 * Get milestone display info
 */
export const getMilestoneInfo = (milestone: ReferralMilestone): { title: string; description: string; icon: string } => {
  const milestoneMap: Record<string, any> = {
    first_referral: {
      title: 'First Referral',
      description: 'You invited your first friend to Rekindle',
      icon: '🌟',
    },
    'total_referrals_5': {
      title: '5 Referrals',
      description: 'You\'ve invited 5 friends to join Rekindle',
      icon: '🎯',
    },
    'total_referrals_10': {
      title: '10 Referrals',
      description: 'You\'ve invited 10 friends to join Rekindle',
      icon: '🏆',
    },
    'active_referrals_5': {
      title: 'Community Builder',
      description: '5 of your referrals are actively using Rekindle',
      icon: '👥',
    },
  };

  const key = `${milestone.milestone_type}_${milestone.milestone_value}`;
  return milestoneMap[key] || {
    title: milestone.milestone_type,
    description: `Milestone achieved: ${milestone.milestone_value}`,
    icon: '✨',
  };
};