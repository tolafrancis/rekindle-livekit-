import { supabase } from '@/lib/supabase';
import { getLocalDateString } from '@/lib/utils';

export type StreakSource = 'daily_devotional' | 'devotional_library' | 'prayer_library';

export interface StreakSummary {
  current: number;       // consecutive days up to today (or yesterday if today not done yet)
  longest: number;       // best run ever
  activeToday: boolean;  // did a qualifying activity already today
  lastActive: string | null;
}

const EMPTY: StreakSummary = { current: 0, longest: 0, activeToday: false, lastActive: null };

/**
 * Records that the user did a qualifying activity today. Idempotent per local day
 * (one row per user per day). Streak is non-critical, so failures never throw.
 */
export async function recordDailyActivity(userId: string | undefined | null, source: StreakSource): Promise<void> {
  if (!userId) return;
  try {
    const { error } = await supabase
      .from('daily_activity')
      .upsert(
        { user_id: userId, activity_date: getLocalDateString(), source },
        { onConflict: 'user_id,activity_date' }
      );
    if (error) {
      console.error('[streak] recordDailyActivity DB error:', error.message, error);
      return;
    }
    console.log('[streak] recorded', getLocalDateString(), source);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('streak:updated'));
    }
  } catch (e) {
    console.warn('[streak] recordDailyActivity failed', e);
  }
}

const dayBefore = (iso: string): string => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return getLocalDateString(d);
};

/**
 * Computes current and longest streak from the activity log. Derived from the log
 * (not a stored counter) so it self-heals and never double-counts.
 */
export async function getStreakSummary(userId: string | undefined | null): Promise<StreakSummary> {
  if (!userId) return EMPTY;
  try {
    const { data, error } = await supabase
      .from('daily_activity')
      .select('activity_date')
      .eq('user_id', userId)
      .order('activity_date', { ascending: false })
      .limit(400);

    if (error) {
      console.error('[streak] getStreakSummary DB error:', error.message, error);
      return EMPTY;
    }
    if (!data || data.length === 0) {
      console.log('[streak] read for user', userId, '→ 0 rows visible (check RLS / user_id match)');
      return EMPTY;
    }

    console.log('[streak] read for user', userId, '→ rows:', data.map((r: any) => r.activity_date));

    const daySet = new Set<string>(data.map((r: any) => r.activity_date));
    const sortedDesc = Array.from(daySet).sort().reverse();
    const today = getLocalDateString();
    const yesterday = dayBefore(today);
    const activeToday = daySet.has(today);

    // Current streak: walk backwards from today (or yesterday if today isn't done yet)
    let current = 0;
    let cursor: string | null = activeToday ? today : (daySet.has(yesterday) ? yesterday : null);
    while (cursor && daySet.has(cursor)) {
      current++;
      cursor = dayBefore(cursor);
    }

    // Longest streak: scan ascending for the longest consecutive run
    const sortedAsc = [...sortedDesc].reverse();
    let longest = 0;
    let run = 0;
    let prev: string | null = null;
    for (const d of sortedAsc) {
      run = prev && dayBefore(d) === prev ? run + 1 : 1;
      if (run > longest) longest = run;
      prev = d;
    }

    return { current, longest, activeToday, lastActive: sortedDesc[0] ?? null };
  } catch (e) {
    console.warn('[streak] getStreakSummary failed', e);
    return EMPTY;
  }
}

/** Next milestone target for encouragement (7, 30, 100, 365, then +365). */
export function nextMilestone(current: number): number {
  const marks = [7, 30, 100, 365];
  for (const m of marks) if (current < m) return m;
  return Math.ceil((current + 1) / 365) * 365;
}
