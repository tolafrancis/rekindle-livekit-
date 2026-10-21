import { supabase } from '@rekindle/supabase';

// Leader-chosen member menu (ministry_groups.settings.member_menu). A ministry
// leader picks which screens their ministry's menu shows, so a Bible study
// group isn't handed live channels, giving and a social feed it never uses.
//
// Stored as a list of hidden item keys, `<groupId>.<childId>`, or
// `<groupId>.*` for a whole group. Anything not listed shows, so ministries
// that never open this screen keep the full menu. Settings is never hidden.
// This sits under the platform feature switches and plan caps: it can only
// hide more, never bring back something those hide.

/** Fired on window after a save: detail { ministryId, hidden }. */
export const MEMBER_MENU_SAVED_EVENT = 'rk-member-menu-saved';

export interface MemberMenuItem {
  key: string;
  label: string;
}
export interface MemberMenuGroup {
  id: string;
  label: string;
  description: string;
  /** Items a leader can hide one by one. Empty: the group hides as a whole. */
  items: MemberMenuItem[];
}

export const MEMBER_MENU: MemberMenuGroup[] = [
  { id: 'word', label: 'The Word', description: 'Daily reading and study', items: [
    { key: 'word.devotionals', label: 'Devotionals' },
    { key: 'word.reading', label: 'Reading Plan' },
    { key: 'word.scripture', label: 'Scripture Memory' },
    { key: 'word.books', label: 'Books' },
  ] },
  { id: 'prayer', label: 'Prayers', description: 'Praying together and alone', items: [
    { key: 'prayer.ministry', label: 'Our Prayers' },
    { key: 'prayer.library', label: 'Prayer Library' },
    { key: 'prayer.journal', label: 'Journal' },
    { key: 'prayer.wall', label: 'Prayer Wall' },
  ] },
  { id: 'community', label: 'Community', description: 'Sharing with each other', items: [
    { key: 'community.feed', label: 'Feed' },
    { key: 'community.revelations', label: 'Revelations' },
    { key: 'community.qa', label: 'Q&A' },
    { key: 'community.challenges', label: 'Challenges' },
  ] },
  { id: 'groups', label: 'Small Groups', description: 'Group chats and joining groups', items: [] },
  { id: 'live', label: 'Live', description: 'Live services and webinars (when your plan includes them)', items: [
    { key: 'live.live', label: 'Live Channel' },
    { key: 'live.webinars', label: 'Webinars' },
  ] },
  { id: 'admin', label: 'Ministry', description: 'News, care and giving', items: [
    { key: 'admin.announcements', label: 'Announcements' },
    { key: 'admin.rules', label: 'Rules & Guidelines' },
    { key: 'admin.requests', label: 'Prayer Requests' },
    { key: 'admin.testimonies', label: 'Testimonies' },
    { key: 'admin.donations', label: 'Donations' },
    { key: 'admin.meetings', label: 'Meetings' },
  ] },
];

export const groupKey = (groupId: string) => `${groupId}.*`;

/** Every key a leader can switch, whole-group keys included. */
export const ALL_MEMBER_MENU_KEYS: string[] = MEMBER_MENU.flatMap((g) =>
  g.items.length ? g.items.map((i) => i.key) : [groupKey(g.id)],
);

export interface MemberMenuPreset {
  id: string;
  label: string;
  description: string;
  hidden: string[];
}

export const MEMBER_MENU_PRESETS: MemberMenuPreset[] = [
  {
    id: 'everything',
    label: 'Everything',
    description: 'Every screen your plan includes.',
    hidden: [],
  },
  {
    id: 'bible-study',
    label: 'Bible study group',
    description: 'Devotionals, reading plan, prayer, Q&A, small groups and meetings.',
    hidden: ['word.books', 'prayer.library', 'prayer.journal', 'community.feed', 'community.revelations',
      'community.challenges', 'live.live', 'live.webinars', 'admin.testimonies', 'admin.donations'],
  },
  {
    id: 'prayer-group',
    label: 'Prayer group',
    description: 'Prayers, the prayer wall, prayer requests and meetings.',
    hidden: ['word.reading', 'word.scripture', 'word.books', 'community.feed', 'community.revelations',
      'community.qa', 'community.challenges', 'live.webinars', 'admin.donations'],
  },
];

/** Hidden keys stored for a ministry. Unknown or malformed values hide nothing. */
export function hiddenMemberMenu(settings: unknown): Set<string> {
  const hidden = (settings as any)?.member_menu?.hidden;
  return new Set(Array.isArray(hidden) ? hidden.filter((k): k is string => typeof k === 'string') : []);
}

/** Leader: save which items are hidden. Merges into the latest stored
 *  settings so it never overwrites changes saved elsewhere meanwhile. */
export async function saveHiddenMemberMenu(ministryId: string, hidden: string[]): Promise<{ error?: string }> {
  const { data, error: readError } = await supabase
    .from('ministry_groups')
    .select('settings')
    .eq('id', ministryId)
    .single();
  if (readError) return { error: readError.message };
  const settings = { ...((data?.settings as Record<string, unknown>) ?? {}), member_menu: { hidden } };
  const { error } = await supabase
    .from('ministry_groups')
    .update({ settings, updated_at: new Date().toISOString() })
    .eq('id', ministryId);
  if (error) return { error: error.message };
  // Lets an open MinistrySpace apply the new menu without a reload.
  window.dispatchEvent(new CustomEvent(MEMBER_MENU_SAVED_EVENT, { detail: { ministryId, hidden } }));
  return {};
}
