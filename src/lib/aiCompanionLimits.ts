// =============================================================================
// AI Companion (GraceCounsel) fair-use limits.
// -----------------------------------------------------------------------------
// gpt-4o-mini is cheap (~$0.0005–0.001 per exchange), so these caps are about
// fairness / abuse prevention, not raw cost. Daily caps keep any single user
// bounded; monthly caps are a backstop against hitting the daily cap every day.
// Counts are the user's OWN messages (role='user') in ai_chat_messages.
// =============================================================================
import { supabase } from './supabase';

export type AiTier = 'free' | 'premium' | 'premium_plus' | 'ministry';

export const AI_COMPANION_LIMITS: Record<AiTier, { daily: number; monthly: number }> = {
  free:         { daily: 10,  monthly: 100 },
  premium:      { daily: 50,  monthly: 1000 },
  premium_plus: { daily: 150, monthly: 3000 },
  ministry:     { daily: 300, monthly: 5000 },
};

export function tierLimits(tier?: string | null) {
  return AI_COMPANION_LIMITS[(tier as AiTier)] ?? AI_COMPANION_LIMITS.free;
}

export interface AiLimitStatus {
  allowed: boolean;
  reason?: 'daily' | 'monthly';
  tier: AiTier;
  dayCount: number;
  dayLimit: number;
  monthCount: number;
  monthLimit: number;
  remainingToday: number;
}

/**
 * Check whether the user may send another AI Companion message. Counts the
 * user's own messages today and this month against their tier's caps. On any
 * query error it FAILS OPEN (allows the message) so a transient DB blip never
 * blocks a paying user mid-conversation.
 */
export async function checkAiLimit(userId: string, tier?: string | null): Promise<AiLimitStatus> {
  const t = (AI_COMPANION_LIMITS[tier as AiTier] ? (tier as AiTier) : 'free');
  const limits = AI_COMPANION_LIMITS[t];

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  let dayCount = 0;
  let monthCount = 0;
  try {
    const [dayRes, monthRes] = await Promise.all([
      supabase.from('ai_chat_messages').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('role', 'user').gte('created_at', startOfDay),
      supabase.from('ai_chat_messages').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('role', 'user').gte('created_at', startOfMonth),
    ]);
    dayCount = dayRes.count ?? 0;
    monthCount = monthRes.count ?? 0;
  } catch {
    // Fail open — never hard-block on a transient error.
    return {
      allowed: true, tier: t,
      dayCount: 0, dayLimit: limits.daily,
      monthCount: 0, monthLimit: limits.monthly,
      remainingToday: limits.daily,
    };
  }

  const dailyExceeded = dayCount >= limits.daily;
  const monthlyExceeded = monthCount >= limits.monthly;

  return {
    allowed: !dailyExceeded && !monthlyExceeded,
    reason: monthlyExceeded ? 'monthly' : dailyExceeded ? 'daily' : undefined,
    tier: t,
    dayCount,
    dayLimit: limits.daily,
    monthCount,
    monthLimit: limits.monthly,
    remainingToday: Math.max(0, limits.daily - dayCount),
  };
}
