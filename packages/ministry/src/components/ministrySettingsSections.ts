import { LayoutDashboard, Settings, Users, BookOpen, MessageSquare, CreditCard, Calendar } from 'lucide-react';
import { isUkCountryCode } from '../giftAid/countries';

// Ministry Settings sections and the tools inside each one. Kept apart from
// MinistrySettingsHub (a lazily loaded chunk) so MinistrySpace and the hub
// can share them without the hub being bundled into MinistrySpace.

export type SettingsSectionId =
  | 'overview'
  | 'members'
  | 'events'
  | 'content'
  | 'messages'
  | 'finance'
  | 'profile';

/** Section ids used before Settings was split into one tool per view. A
 *  remembered view or an old link may still carry one. */
const LEGACY_SECTIONS: Record<string, SettingsSectionId> = {
  general: 'profile',
  people: 'members',
  engagement: 'messages',
  'finance-billing': 'finance',
};
export const normalizeSettingsSection = (id: string | undefined | null): SettingsSectionId => {
  if (!id) return 'overview';
  if (id in LEGACY_SECTIONS) return LEGACY_SECTIONS[id];
  return (SECTIONS.some((sec) => sec.id === id) ? id : 'overview') as SettingsSectionId;
};

interface SectionDef {
  id: SettingsSectionId;
  label: string;
  icon: any;
  description: string;
}

export const SECTIONS: SectionDef[] = [
  { id: 'overview', label: 'Overview',         icon: LayoutDashboard, description: 'Ministry stats & quick actions' },
  { id: 'members',  label: 'Members',          icon: Users,           description: 'Members, new people, registrations, join link, small groups & teams' },
  { id: 'events',   label: 'Events',           icon: Calendar,        description: 'Services and events' },
  { id: 'content',  label: 'Content',          icon: BookOpen,        description: 'Devotionals, library, video, announcements & rules' },
  { id: 'messages', label: 'Messages',         icon: MessageSquare,   description: 'Prayer requests, inbox & WhatsApp' },
  { id: 'finance',  label: 'Finance',          icon: CreditCard,      description: 'Donations, gateways, Gift Aid & plan' },
  { id: 'profile',  label: 'Ministry profile', icon: Settings,        description: 'Profile, branding, member menu, domain & birthdays' },
];

/** The tools inside each section. Each opens on its own; the first is the default. */
export const SECTION_TOOLS: Record<SettingsSectionId, Array<{ id: string; label: string }>> = {
  overview: [],
  members: [
    { id: 'members', label: 'Members' },
    { id: 'new-people', label: 'New people' },
    { id: 'registrations', label: 'Registrations' },
    { id: 'join-link', label: 'Join link & QR' },
    { id: 'small-groups', label: 'Small groups' },
    { id: 'volunteer-teams', label: 'Volunteer teams' },
  ],
  events: [{ id: 'events', label: 'Events' }],
  content: [
    { id: 'devotionals', label: 'Devotionals' },
    { id: 'prayer-library', label: 'Prayer library' },
    { id: 'video-messages', label: 'Video messages' },
    { id: 'announcements', label: 'Announcements' },
    { id: 'testimonies', label: 'Testimonies' },
    { id: 'rules', label: 'Rules' },
  ],
  messages: [
    { id: 'prayer-requests', label: 'Prayer requests' },
    { id: 'evangelism-inbox', label: 'Evangelism inbox' },
    { id: 'whatsapp', label: 'WhatsApp' },
  ],
  finance: [
    { id: 'donations', label: 'Donations' },
    { id: 'payment-gateways', label: 'Payment gateways' },
    { id: 'gift-aid-settings', label: 'Gift Aid' },
    { id: 'billing', label: 'Plan & billing' },
  ],
  profile: [
    { id: 'profile', label: 'Profile & branding' },
    { id: 'member-menu', label: 'Member menu' },
    { id: 'custom-domain', label: 'Custom domain' },
    { id: 'birthdays', label: 'Birthday wishes' },
  ],
};

/** Tools that only apply to UK ministries (Gift Aid is a UK tax relief). */
const UK_ONLY_TOOLS = new Set(['gift-aid-settings']);

/** The tools a given ministry sees in a section. Gift Aid is left out for
 *  ministries outside the UK rather than opening on an empty panel. */
export const toolsForSection = (
  section: SettingsSectionId,
  countryCode: string | null | undefined,
): Array<{ id: string; label: string }> => {
  const tools = SECTION_TOOLS[section] ?? [];
  return isUkCountryCode(countryCode) ? tools : tools.filter((tool) => !UK_ONLY_TOOLS.has(tool.id));
};
