import { supabase } from '@rekindle/supabase';

// "What would you like help with?" — the consumer app's main menu shows the
// groups a person picked (user_profiles.metadata.nav_focus, a list of
// NAV_GROUPS ids) and tucks the rest under "More". Nothing is hidden for
// good, and anyone who hasn't chosen sees everything.

export interface NavFocusOption {
  id: string;
  emoji: string;
  label: string;
  description: string;
}

export const NAV_FOCUS_OPTIONS: NavFocusOption[] = [
  { id: 'the-word', emoji: '📖', label: 'Daily devotionals and the Bible', description: 'Devotionals, reading plans, Scripture memory and books' },
  { id: 'prayer', emoji: '🙏', label: 'Prayer', description: 'Guided prayers, your prayer journal and the prayer wall' },
  { id: 'ministries', emoji: '⛪', label: 'My church or ministry', description: 'Join your church on Rekindle and keep up with it' },
  { id: 'live-channels', emoji: '📺', label: 'Live services', description: 'Watch live church services and join meetings' },
  { id: 'community', emoji: '🤝', label: 'Encouragement from others', description: 'Testimonies, revelations, challenges and worship music' },
];

export const ALL_NAV_FOCUS = NAV_FOCUS_OPTIONS.map((o) => o.id);

/** The person's chosen groups, or null if they haven't chosen. */
export function navFocusFromProfile(profile: unknown): string[] | null {
  const focus = (profile?.metadata as any)?.nav_focus;
  return Array.isArray(focus) ? focus.filter((id): id is string => typeof id === 'string') : null;
}

/** Saves the choice into user_profiles.metadata, keeping the other keys
 *  stored there (referral activity, first login and so on). */
export async function saveNavFocus(userId: string, focus: string[]): Promise<{ error?: string }> {
  const { data, error: readError } = await supabase
    .from('user_profiles')
    .select('metadata')
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) return { error: readError.message };
  const metadata = { ...((data?.metadata as Record<string, unknown>) ?? {}), nav_focus: focus };
  const { error } = await supabase.from('user_profiles').update({ metadata }).eq('user_id', userId);
  return error ? { error: error.message } : {};
}
