import { Capacitor } from '@capacitor/core';
import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useOnboardingTips } from '@/hooks/useOnboardingTips';
import { useUserAnalytics } from '@/hooks/useUserAnalytics';
import { Flame, Heart, Star, Users, ChevronUp, ChevronDown, SlidersHorizontal } from 'lucide-react';
import {
  Home, LayoutDashboard, Library, FileText, Sparkles, CalendarDays, Book,
  BarChart3, Trophy, LayoutGrid, Quote, UserCheck, Calendar, Bot, Gift,
  Share2, Award, Activity, Globe, Settings, Tv, Mic, Video,
  Church, UsersRound, HandHeart,
} from 'lucide-react';
import { badges } from '../data/badges';
import { CounsellorCard, Counsellor } from './CounsellorCard';
import { BadgeCard } from './BadgeCard';
import { StatCard } from './StatCard';
import { PrayerPointModal } from './PrayerPointModal';
import { AffirmationCard } from './AffirmationCard';
import { StreakWidget } from './StreakWidget';
import { ReminderSetupTip } from './ReminderSetupTip';
import { DeclarationCard } from './DeclarationCard';
import { InstrumentalPlayer } from './InstrumentalPlayer';
import { NotificationFeed } from './NotificationFeed';
import { useNotifications } from '@/hooks/useNotifications';
import { useGroupChatInbox } from '@rekindle/ministry/lib/useGroupChatInbox';
import { useFeatureToggles } from '@rekindle/features/featureToggles';
import { AppFooter } from './AppFooter';
import { registerPush } from '@rekindle/features/usePushNotifications';
import { UpgradePromptModal } from './UpgradePromptModal';
import { canShowPurchaseUI } from '@rekindle/features/platform';
import { OfflineIndicator } from './OfflineIndicator';
import { DailyDevotionalWidget } from './DailyDevotionalWidget';
import { FreeMeetingsPromoCard } from '@rekindle/features/components/FreeMeetingsPromoCard';
import { NavFocusDialog, NavFocusHomeCard } from '@rekindle/features/components/NavFocusDialog';
import { navFocusFromProfile } from '@rekindle/features/navFocus';
import { DevotionalSourceSettings } from './DevotionalSourceSettings';
import { ErrorBoundary } from './ErrorBoundary';
import RouteFallback from './RouteFallback';

import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { supabase } from '@/lib/supabase';
import {
  LogOut,
  User,
  MessageSquare,
  Music,
  RefreshCw,
  Bell,
  Shield,
  Crown,
  Receipt,
  Loader2,
  Search,
  List,
  BookOpen,
  Radio,
  Building2,
  MessagesSquare,
  MoreHorizontal,
  HelpCircle,
  Compass,
  CreditCard,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useUserEntitlements } from '@/hooks/useUserEntitlements';


// Feature tabs are code-split: each one is only downloaded the first time the
// user opens it, instead of every screen (admin, live broadcast, ministries,
// counselling, billing …) being parsed before the app shell can render.
const GraceCounselChat = lazy(() => import('./GraceCounselChat').then((m) => ({ default: m.GraceCounselChat })));
const ReferralGenerator = lazy(() => import('./ReferralGenerator').then((m) => ({ default: m.ReferralGenerator })));
const ProfileSettings = lazy(() => import('./ProfileSettings').then((m) => ({ default: m.ProfileSettings })));
const CounsellorBookingModal = lazy(() => import('./CounsellorBookingModal').then((m) => ({ default: m.CounsellorBookingModal })));
const MyBookings = lazy(() => import('./MyBookings').then((m) => ({ default: m.MyBookings })));
const MusicLibrary = lazy(() => import('./MusicLibrary').then((m) => ({ default: m.MusicLibrary })));
const CommunityPrayerWall = lazy(() => import('./CommunityPrayerWall').then((m) => ({ default: m.CommunityPrayerWall })));
const ScriptureMemory = lazy(() => import('./ScriptureMemory').then((m) => ({ default: m.ScriptureMemory })));
const UserActivityDashboard = lazy(() => import('./UserActivityDashboard').then((m) => ({ default: m.UserActivityDashboard })));
const BookSummaries = lazy(() => import('./BookSummaries').then((m) => ({ default: m.BookSummaries })));
const CommunityRevelations = lazy(() => import('./CommunityRevelations').then((m) => ({ default: m.CommunityRevelations })));
const CommunityActivityFeed = lazy(() => import('./CommunityActivityFeed').then((m) => ({ default: m.CommunityActivityFeed })));
const DevotionalLibrary = lazy(() => import('./DevotionalLibrary').then((m) => ({ default: m.DevotionalLibrary })));
const PrayerLibrary = lazy(() => import('./PrayerLibrary').then((m) => ({ default: m.PrayerLibrary })));
const DailyReminders = lazy(() => import('./DailyReminders').then((m) => ({ default: m.DailyReminders })));
const PrayerJournal = lazy(() => import('./PrayerJournal').then((m) => ({ default: m.PrayerJournal })));
const BibleReadingPlan = lazy(() => import('./BibleReadingPlan').then((m) => ({ default: m.BibleReadingPlan })));
const EnhancedPrayerChallenges = lazy(() => import('./EnhancedPrayerChallenges').then((m) => ({ default: m.EnhancedPrayerChallenges })));
const LiveChannels = lazy(() => import('./LiveChannels').then((m) => ({ default: m.LiveChannels })));
const SubscriptionManager = lazy(() => import('./SubscriptionManager').then((m) => ({ default: m.SubscriptionManager })));
const SponsorshipSystem = lazy(() => import('./SponsorshipSystem').then((m) => ({ default: m.SponsorshipSystem })));
const PaymentHistory = lazy(() => import('./PaymentHistory').then((m) => ({ default: m.PaymentHistory })));
const CounsellorDashboard = lazy(() => import('./CounsellorDashboard').then((m) => ({ default: m.CounsellorDashboard })));
const GlobalSearch = lazy(() => import('./GlobalSearch'));
import FeatureFinder, { FEATURE_NAVIGATE_EVENT, OPEN_FEATURE_FINDER_EVENT } from './FeatureFinder';
import type { FeatureAction } from '@/lib/featureIndex';
import type { TutorialNav } from '@rekindle/features/tutorial/types';
import { RekindleTutorialProvider } from '@/tutorials/RekindleTutorials';
import { WelcomeDialog } from '@/tutorials/WelcomeDialog';
import { HelpMenu } from '@/tutorials/HelpMenu';
import { TutorialLibrary } from '@/tutorials/TutorialLibrary';
const AdminDashboard = lazy(() => import('./AdminDashboard'));
const AdminSystemHealthDashboard = lazy(() => import('./AdminSystemHealthDashboard'));
const MinistriesHub = lazy(() => import('./MinistriesHub'));
const GroupChatInbox = lazy(() => import('@rekindle/ministry/components/GroupChatInbox'));

interface UserProfile {
  id: string;
  full_name: string;
  role: 'user' | 'admin' | 'super_admin';
  subscription_tier: string;
  total_prayers: number;
  prayer_streak: number;
  xp_points: number;
  disciples_count: number;
}

interface PrayerPoint {
  id: string;
  topicId: string;
  title: string;
  content: string;
}

interface Devotional {
  id: string;
  title: string;
  description: string;
}

interface AppLayoutProps {
  pendingRoomJoin?: {
    roomId: number;
    useVideo: boolean;
  } | null;
  onRoomJoinHandled?: () => void;
  initialTab?: string | null;
}

// Constants
const DEVOTIONAL_PROGRESS_LOAD_TIMEOUT = 5000;

// Tab to navigation translation key mapping
const TAB_TO_NAV_KEY: Record<string, string> = {
  'home': 'home',
  'my-dashboard': 'myDashboard',
  'ministries': 'ministries',
  'devotional-library': 'devotionalLibrary',
  'prayer-library': 'prayerLibrary',
  'journal': 'prayerJournal',
  'revelations': 'revelations',
  'community-feed': 'communityActivity',
  'reading-plan': 'readingPlan',
  'books': 'books',
  'live-channels': 'liveChannels',
  'analytics': 'analytics',
  'reminders': 'reminders',
  'notifications': 'notifications',
  'messages': 'messages',
  'challenges': 'challenges',
  'wall': 'prayerWall',
  'scripture': 'scriptureMemory',
  'counsellors': 'counsellors',
  'bookings': 'myBookings',
  'ai': 'aiCompanion',
  'music': 'musicLibrary',
  'billing': 'billing',
  'subscription': 'subscription',
  'sponsor': 'donate',
  'referral': 'referral',
  'profile': 'profile',
  'rewards': 'rewards',
  'admin': 'admin',
  'admin-health': 'systemHealth',
};

// Tab to icon mapping for the sidebar nav
const TAB_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'home': Home,
  'my-dashboard': LayoutDashboard,
  'ministries': Building2,
  'messages': MessagesSquare,
  'devotional-library': BookOpen,
  'prayer-library': Library,
  'journal': FileText,
  'revelations': Sparkles,
  'community-feed': Users,
  'reading-plan': CalendarDays,
  'books': Book,
  'live-channels': Radio,
  'analytics': BarChart3,
  'reminders': Bell,
  'challenges': Trophy,
  'wall': LayoutGrid,
  'scripture': Quote,
  'counsellors': UserCheck,
  'bookings': Calendar,
  'ai': Bot,
  'music': Music,
  'billing': Receipt,
  'subscription': CreditCard,
  'sponsor': Heart,
  'referral': Share2,
  'profile': User,
  'rewards': Award,
  'admin': Shield,
  'admin-health': Activity,
};

// Per-page hero title + description shown in the top banner
const PAGE_HERO: Record<string, { title: string; subtitle: string }> = {
  'my-dashboard':       { title: 'My Dashboard',      subtitle: 'Your counselling activity at a glance' },
  'ministries':         { title: 'Ministries',         subtitle: 'Connect, belong, and grow with your church community' },
  'devotional-library': { title: 'Devotional Series',  subtitle: 'Grow deeper in your faith journey' },
  'prayer-library':     { title: 'Prayer Library',     subtitle: 'Deepen your prayer life with guided sessions and series' },
  'journal':            { title: 'Prayer Journal',     subtitle: 'Record your prayers and reflect on answered ones' },
  'revelations':        { title: 'Revelations',        subtitle: 'Capture and share insights from the Word' },
  'community-feed':     { title: 'Activity',            subtitle: 'See what believers around you are sharing' },
  'reading-plan':       { title: 'Reading Plan',        subtitle: 'Stay consistent in the Word, one day at a time' },
  'books':              { title: 'Books',               subtitle: 'Faith-building reads and resources' },
  'live-channels':      { title: 'Live Broadcast',       subtitle: 'Join live ministry broadcasts and meetings' },
  'analytics':          { title: 'Analytics',           subtitle: 'Track your spiritual growth and activity' },
  'reminders':          { title: 'Reminders',           subtitle: 'Set daily nudges to stay faithful' },
  'challenges':         { title: 'Challenges',          subtitle: 'Grow through faith challenges and streaks' },
  'wall':               { title: 'Community Prayer Wall', subtitle: 'Share requests and stand in prayer together' },
  'scripture':          { title: 'Scripture Memory',    subtitle: 'Hide the Word in your heart' },
  'counsellors':        { title: 'Counsellors',         subtitle: 'Find support and book a session' },
  'bookings':           { title: 'My Bookings',         subtitle: 'Manage your counselling appointments' },
  'ai':                 { title: 'Pastoral Assistant',  subtitle: 'A thoughtful guide for your faith questions' },
  'music':              { title: 'Music Library',       subtitle: 'Worship and instrumental soundtracks' },
  'billing':            { title: 'Billing',             subtitle: 'Your payments and receipts' },
  'sponsor':            { title: 'Give',                subtitle: 'Support the mission and partner with us' },
  'referral':           { title: 'Refer a Friend',      subtitle: 'Invite others into the journey' },
  'profile':            { title: 'Settings',            subtitle: 'Manage your account and preferences' },
  'rewards':            { title: 'Rewards',             subtitle: 'Redeem what you have earned on your walk' },
  'admin':              { title: 'Admin Dashboard',     subtitle: 'Manage the platform' },
  'admin-health':       { title: 'System Health',       subtitle: 'Monitor platform status' },
};

// Fallback tab labels (English)
const TAB_LABELS: Record<string, string> = {
  'home': 'Home',
  'my-dashboard': 'My Dashboard',
  'ministries': 'Ministries',
  'devotional-library': 'Devotional Library',
  'prayer-library': 'Prayer Library',
  'journal': 'Prayer Journal',
  'revelations': 'Revelations',
  'community-feed': 'Activity',
  'reading-plan': 'Reading Plan',
  'books': 'Books',
  'live-channels': 'Live Broadcast',
  'analytics': 'Analytics',
  'reminders': 'Reminders',
  'notifications': 'Notifications',
  'messages': 'Messages',
  'challenges': 'Challenges',
  'wall': 'Prayer Wall',
  'scripture': 'Scripture Memory',
  'counsellors': 'Counsellors',
  'bookings': 'My Bookings',
  'ai': 'Pastoral Assistant',
  'music': 'Music Library',
  'billing': 'Billing',
  'subscription': 'Plans',
  'sponsor': 'Give',
  'referral': 'Referral',
  'profile': 'Profile',
  'rewards': 'Rewards',
  'admin': 'Admin',
  'admin-health': 'System Health',
};

// Primary modules. The secondary rail owns the real navigation inside a module.
// Each group renders its icon in a rounded chip using the single brand accent
// (purple when active, neutral tint otherwise). `emoji` overrides the lucide icon
// where a richer, more literal symbol is wanted (e.g. praying hands for Prayer).
// `labelKey` points at a navigation-namespace key so the label renders through
// t(); `label` is the English fallback.
type NavGroup = { id: string; label: string; labelKey: string; icon: typeof Home; emoji?: string; children?: string[] };
const NAV_GROUPS: NavGroup[] = [
  { id: 'home',          label: 'Home',           labelKey: 'home',         icon: Home },
  { id: 'the-word',      label: 'The Word',       labelKey: 'theWord',      icon: BookOpen, children: ['devotional-library', 'reading-plan', 'scripture', 'books'] },
  { id: 'prayer',        label: 'Prayer',         labelKey: 'prayers',      icon: HandHeart, emoji: '🙏', children: ['prayer-library', 'journal', 'wall'] },
  { id: 'ministries',    label: 'Ministries',     labelKey: 'ministries',   icon: Church },
  { id: 'live-channels', label: 'Live Broadcast', labelKey: 'liveChannels', icon: Radio },
  { id: 'community',     label: 'Community',      labelKey: 'community',     icon: UsersRound, children: ['community-feed', 'revelations', 'challenges', 'music'] },
];

type MinistryHubView = 'discover' | 'my-ministries' | 'manage' | 'ministry-space' | 'ministry-management';
type LiveChannelsTab = 'discover' | 'events' | 'following' | 'my-channels' | 'meetings' | 'analytics';
type SecondaryNavItem = {
  id: string;
  label: string;
  labelKey?: string; // navigation-namespace key; falls back to `label`
  icon: React.ComponentType<{ className?: string }>;
  tab?: string;
  ministryView?: MinistryHubView;
  liveTab?: LiveChannelsTab;
  hostOnly?: boolean; // only shown to people who can host (own a channel or run meetings)
};

const SECONDARY_NAV: Record<string, SecondaryNavItem[]> = {
  'the-word': [
    { id: 'devotional-library', label: 'Devotionals', labelKey: 'devotionals', icon: BookOpen, tab: 'devotional-library' },
    { id: 'reading-plan', label: 'Reading Plan', labelKey: 'readingPlan', icon: CalendarDays, tab: 'reading-plan' },
    { id: 'scripture', label: 'Scripture Memory', labelKey: 'scriptureMemory', icon: Quote, tab: 'scripture' },
    { id: 'books', label: 'Books', labelKey: 'books', icon: Book, tab: 'books' },
  ],
  prayer: [
    { id: 'prayer-library', label: 'Prayer Library', labelKey: 'prayerLibrary', icon: Library, tab: 'prayer-library' },
    { id: 'journal', label: 'Prayer Journal', labelKey: 'prayerJournal', icon: FileText, tab: 'journal' },
    { id: 'wall', label: 'Prayer Wall', labelKey: 'prayerWall', icon: LayoutGrid, tab: 'wall' },
  ],
  // Ministries has a single view (the hub opens My Ministries, where leaders
  // also create and enter the ministries they run), so it needs no sub-menu.
  'live-channels': [
    { id: 'discover', label: 'Discover', labelKey: 'discover', icon: Tv, liveTab: 'discover' },
    { id: 'events', label: 'Events', labelKey: 'events', icon: Calendar, liveTab: 'events' },
    { id: 'following', label: 'Following', labelKey: 'following', icon: Heart, liveTab: 'following' },
    { id: 'my-channels', label: 'My Channels', labelKey: 'myChannels', icon: Mic, liveTab: 'my-channels', hostOnly: true },
    { id: 'meetings', label: 'Meetings', labelKey: 'meetings', icon: Video, liveTab: 'meetings', hostOnly: true },
    { id: 'analytics', label: 'Analytics', labelKey: 'analytics', icon: BarChart3, liveTab: 'analytics', hostOnly: true },
  ],
  community: [
    { id: 'community-feed', label: 'Activity', labelKey: 'activity', icon: Users, tab: 'community-feed' },
    { id: 'revelations', label: 'Revelations', labelKey: 'revelations', icon: Sparkles, tab: 'revelations' },
    { id: 'challenges', label: 'Challenges', labelKey: 'challenges', icon: Trophy, tab: 'challenges' },
    { id: 'music', label: 'Music', labelKey: 'music', icon: Music, tab: 'music' },
  ],
};

// Personal / account items live in the avatar menu (and the phone "More" sheet),
// grouped so people can scan them. `my-dashboard` is filtered to counsellors.
const ACCOUNT_GROUPS: { id: string; label: string; labelKey: string; items: string[] }[] = [
  { id: 'you',  label: 'You',            labelKey: 'accountYou',  items: ['profile', 'analytics', 'reminders', 'my-dashboard'] },
  { id: 'care', label: 'Care',           labelKey: 'accountCare', items: ['counsellors', 'bookings'] },
  { id: 'give', label: 'Giving & plans', labelKey: 'accountGive', items: ['sponsor', 'subscription', 'billing', 'referral'] },
];

// Giving, plans and billing are hidden in the iOS app (Apple 3.1.1 / 3.2.2);
// see canShowPurchaseUI().
const PURCHASE_TABS = ['sponsor', 'subscription', 'billing'];

// Phone bottom bar. Live and Community sit in "More" (Home also shows a
// "Live now" strip while a channel is broadcasting).
const BOTTOM_TABS: { id: string; label: string; labelKey: string; icon: typeof Home; tab: string }[] = [
  { id: 'home',       label: 'Home',   labelKey: 'home',        icon: Home,      tab: 'home' },
  { id: 'the-word',   label: 'Word',   labelKey: 'bottomWord',  icon: BookOpen,  tab: 'devotional-library' },
  { id: 'prayer',     label: 'Prayer', labelKey: 'prayers',     icon: HandHeart, tab: 'prayer-library' },
  { id: 'ministries', label: 'Church', labelKey: 'bottomChurch', icon: Church,   tab: 'ministries' },
];
// Live and Community can also take a bottom-bar slot when someone picked
// them in "What would you like help with?" (navFocus).
const FOCUS_BOTTOM_TABS: typeof BOTTOM_TABS = [
  ...BOTTOM_TABS,
  { id: 'live-channels', label: 'Live',      labelKey: 'bottomLive', icon: Radio,      tab: 'live-channels' },
  { id: 'community',     label: 'Community', labelKey: 'community',  icon: UsersRound, tab: 'community-feed' },
];
const HOST_ONLY_LIVE_TABS: LiveChannelsTab[] = ['my-channels', 'meetings', 'analytics'];

// Which sidebar group owns the current tab (the leaf itself, or its parent).
const parentForTab = (tab: string): NavGroup | undefined =>
  NAV_GROUPS.find(g => g.id === tab || g.children?.includes(tab));

const AppLayout: React.FC<AppLayoutProps> = ({ pendingRoomJoin, onRoomJoinHandled, initialTab }) => {

  const navigate = useNavigate();
  const location = useLocation();

  // Safe auth hook with fallback values
  let user: any = null;
  let profile: UserProfile | null = null;
  let authSignOut = async () => {};
  let initialized = false;
  let authIsAdmin = false;
  let authIsPartner = false;
  try {
    const auth = useAuth();
    user = auth.user;
    profile = auth.profile;
    authSignOut = auth.signOut;
    initialized = auth.initialized;
    authIsAdmin = auth.isAdmin;
    authIsPartner = (auth as any).isPartner ?? false;
  } catch (e) {
    console.warn('[AppLayout] Auth context not available');
  }

  useEffect(() => {
    if (user?.id) {
      registerPush('user', 'com.rekindle.app').catch(console.error);
    }
  }, [user?.id]);

  // Language hook for translations
  const { t, language, isTranslating } = useLanguage();

  // New-user feature tips are now delivered server-side by the scheduled
  // `onboarding-tips` edge function (in-app + push + WhatsApp), so the
  // client-side hook is intentionally disabled to avoid double-sending.
  // useOnboardingTips(language);

  // Initialize activeTab from URL hash, initialTab prop, or default to 'home'
  // Clean-URL tabs (Phase: hash→path). Tabs live at /<tab> (e.g. /home,
  // /devotional-library). 'admin' is intentionally EXCLUDED — the path /admin is a
  // separate top-level route (AdminPage), so writing it here would hijack that route;
  // the admin tab still works, it just doesn't own a URL.
  const PATHLESS_TABS = React.useMemo(() => new Set(['admin']), []);
  // The tab encoded by a URL path, if the path is a bare single-segment tab. Content
  // deep links (/books/:id, /devotional-series/:id …) are multi-segment and return
  // null here, so they never force a tab or get clobbered by the tab→path sync.
  const tabFromPath = (pathname: string): string | null => {
    const segs = pathname.split('/').filter(Boolean);
    if (segs.length === 1 && TAB_TO_NAV_KEY[segs[0]]) return segs[0];
    return null;
  };

  const [activeTab, setActiveTab] = useState(() => {
    const fromPath = tabFromPath(window.location.pathname);
    if (fromPath) return fromPath;
    if (initialTab && TAB_TO_NAV_KEY[initialTab]) return initialTab;
    // Landing page CTAs (e.g. "Become a Partner") set this before triggering
    // signup, so a brand-new account lands directly on the intended tab.
    const postAuthTab = sessionStorage.getItem('rk_post_auth_tab');
    if (postAuthTab && TAB_TO_NAV_KEY[postAuthTab]) {
      sessionStorage.removeItem('rk_post_auth_tab');
      return postAuthTab;
    }
    return 'home';
  });

  const [ministryWorkspaceActive, setMinistryWorkspaceActive] = useState(false);

  const navigateTab = useCallback((tab: string) => {
    setActiveTab(tab);
    const targetPath = PATHLESS_TABS.has(tab) ? location.pathname : '/' + tab;
    window.history.pushState({ appTab: true, tab }, '', targetPath);
  }, [location.pathname, PATHLESS_TABS]);

  useEffect(() => {
    const targetPath = PATHLESS_TABS.has(activeTab) ? location.pathname : '/' + activeTab;
    window.history.replaceState({ appTab: true, tab: activeTab }, '', targetPath);
  }, []);

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      if (ministryWorkspaceActive) return; // MinistrySpace owns popstate while active
      if (e.state?.appTab && e.state.tab) {
        setActiveTab(e.state.tab);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [ministryWorkspaceActive]);

  // Update activeTab when initialTab changes (for deep linking)
  useEffect(() => {
    if (initialTab && initialTab !== activeTab && TAB_TO_NAV_KEY[initialTab]) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // URL path → activeTab (browser back/forward, direct navigation).
  useEffect(() => {
    const fromPath = tabFromPath(location.pathname);
    if (fromPath && fromPath !== activeTab) setActiveTab(fromPath);
  }, [location.pathname]);

  // activeTab → URL path. Skip PATHLESS_TABS, and never overwrite a content deep-link
  // path (2+ segments) — only bare tab paths or the root get rewritten.
  const tabUrlSyncedRef = useRef(false);
  useEffect(() => {
    if (PATHLESS_TABS.has(activeTab)) return;
    const segs = location.pathname.split('/').filter(Boolean);
    const onDeepLink = segs.length >= 2; // e.g. /books/:id — leave it alone
    if (!onDeepLink && segs[0] !== activeTab) {
      // First run just normalizes the URL (replace — no history entry). Every later
      // tab change PUSHES, so browser Back steps through tabs instead of exiting the
      // app. The `segs[0] !== activeTab` guard above stops a re-push when a Back has
      // already moved the URL here (the URL→activeTab effect then updates the tab).
      navigate('/' + activeTab, { replace: !tabUrlSyncedRef.current });
    }
    tabUrlSyncedRef.current = true;
  }, [activeTab]);
  
  const [selectedPrayer, setSelectedPrayer] = useState<PrayerPoint | null>(null);
  const [selectedDevotional, setSelectedDevotional] = useState<Devotional | null>(null);
  const [selectedCounsellor, setSelectedCounsellor] = useState<Counsellor | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const notif = useNotifications();
  // Small group chats: unread count for the header, and the group a
  // /messages/:id link (e.g. a push notification) should open.
  const groupChats = useGroupChatInbox(user?.id);
  const messagesGroupId = location.pathname.startsWith('/messages/') ? location.pathname.split('/')[2] || null : null;
  const onChatScreen = activeTab === 'messages';
  const [searchOpen, setSearchOpen] = useState(false);
  // Platform-admin feature switches by nav group (platform_settings, migrations
  // 0266/0394). Everything reads as shown while the switches load, so this
  // never causes a flash-of-missing-tab for the common case.
  const { isNavGroupOn: isFeatureNavGroupOn, loaded: featureTogglesLoaded } = useFeatureToggles();
  // What the person said they want help with (navFocus.ts): those groups lead
  // the menu and the rest sit under More. null (not chosen) shows everything.
  const navFocus = navFocusFromProfile(profile);
  const inNavFocus = (groupId: string) => !navFocus || groupId === 'home' || navFocus.includes(groupId);
  const [showMoreGroups, setShowMoreGroups] = useState(false);
  const [navFocusOpen, setNavFocusOpen] = useState(false);

  useEffect(() => {
    setSearchOpen(false);
  }, [activeTab]);
  // True while a full-screen content viewer is playing (devotional / prayer
  // session / prayer series). Used to hide the app shell's chrome.
  const [isViewerActive, setIsViewerActive] = useState(false);
  const [devotionalSource, setDevotionalSource] = useState<'platform' | 'ministry' | 'both'>('platform');
  const [devotionalMinistryId, setDevotionalMinistryId] = useState<string | null>(null);
  const [devotionalStreamId, setDevotionalStreamId] = useState<string | null>(null);

  // Load saved devotional source preference on mount
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('user_profiles')
      .select('devotional_source, devotional_ministry_id, devotional_stream_id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.devotional_source) {
          setDevotionalSource(data.devotional_source as 'platform' | 'ministry' | 'both');
          setDevotionalMinistryId(data.devotional_ministry_id || null);
        }
        if (data && 'devotional_stream_id' in data) {
          setDevotionalStreamId((data as any).devotional_stream_id || null);
        }
      });
  }, [user?.id]);

  // Every upgrade button lands on one Plans screen (SubscriptionManager).
  // "Become a Partner" (openDonate) opens it on the individual plans.
  useEffect(() => {
    const donateHandler = () => {
      if (!canShowPurchaseUI()) return;
      sessionStorage.setItem('subscriptionCategory', 'individual');
      navigateTab('subscription');
    };
    window.addEventListener('openDonate', donateHandler);
    return () => window.removeEventListener('openDonate', donateHandler);
  }, [navigateTab]);

  useEffect(() => {
    const handler = (e: Event) => {
      if (!canShowPurchaseUI()) return;
      const category = (e as CustomEvent).detail?.category ?? 'individual';
      sessionStorage.setItem('subscriptionCategory', category);
      navigateTab('subscription');
    };
    window.addEventListener('openSubscription', handler);
    return () => window.removeEventListener('openSubscription', handler);
  }, [navigateTab]);
  const [devotionalProgress, setDevotionalProgress] = useState<Record<string, any>>({});
  const [signingOut, setSigningOut] = useState(false);
  const [counsellors, setCounsellors] = useState<Counsellor[]>([]);
  const [loadingCounsellors, setLoadingCounsellors] = useState(false);
  const [isCounsellor, setIsCounsellor] = useState(false);
  const [counsellorAvailability, setCounsellorAvailability] = useState(false);
  // Set once the counsellor lookup has finished, so My Dashboard can tell
  // "not a counsellor" apart from "still checking".
  const [counsellorChecked, setCounsellorChecked] = useState(false);

  // Refs
  const loadingProgressRef = useRef(false);
  const isMounted = useRef(true);
  const progressTimeoutRef = useRef<number | null>(null);
  const serviceWorkerRegistered = useRef(false);
  const previousTab = useRef<string>('home');

  const isAdmin = authIsAdmin || profile?.role === 'admin' || profile?.role === 'super_admin';
  // Hosting (own channel or interactive meetings) uses the existing entitlement
  // check; members don't see host-only Live tools or the "Start a meeting" card.
  const entitlements = useUserEntitlements();
  const canHost = isAdmin || entitlements.canCreateLiveChannel || entitlements.canHostInteractiveMeetings;
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [liveNowCount, setLiveNowCount] = useState(0);
  const isPremium = authIsPartner || profile?.subscription_tier === 'ministry';
  const is_ministry = profile?.subscription_tier === 'ministry';

  // Analytics hook
  const { analytics, loading: analyticsLoading } = useUserAnalytics();

  // Helper function to get translated tab label
  const getTabLabel = useCallback((tab: string): string => {
    const navKey = TAB_TO_NAV_KEY[tab];
    if (navKey) {
      const translated = t('navigation', navKey, TAB_LABELS[tab]);
      return translated;
    }
    return TAB_LABELS[tab] || tab.charAt(0).toUpperCase() + tab.slice(1).replace(/-/g, ' ');
  }, [t]);

  // Translated labels for the sidebar module groups + secondary rail items.
  const groupLabel = useCallback((g: NavGroup): string => t('navigation', g.labelKey, g.label), [t]);
  const itemLabel = useCallback((i: SecondaryNavItem): string =>
    i.labelKey ? t('navigation', i.labelKey, i.label) : i.label, [t]);

  const tabs = useMemo(
    () => [
      'home',
      ...(isCounsellor ? ['my-dashboard'] : []),
      'ministries',
      'devotional-library',
      'prayer-library',
      'journal',
      'revelations',
      'community-feed',
      'reading-plan',
      'books',
      'live-channels',
      'analytics',
      'reminders',
      'challenges',
      'wall',
      'scripture',
      'counsellors',
      'bookings',
      'ai',
      'music',
      'billing',
      'sponsor',
      'referral',
      'profile',
      ...(isAdmin ? ['admin','admin-health'] : [])
    ],
    [isAdmin, isCounsellor]
  );

  // The sidebar group that owns the current tab (for highlight + secondary tab row).
  const activeGroup = parentForTab(activeTab);

  // A group switched off by a platform admin also closes its screens, so a
  // bookmark, deep link or "Find a feature" result can't open it. The
  // Ministries tab is the exception: its switch has always hidden only the
  // nav entry, and existing members keep reaching it through direct links.
  const activeGroupId = activeGroup?.id;
  useEffect(() => {
    if (!featureTogglesLoaded || !activeGroupId || activeGroupId === 'ministries') return;
    if (isFeatureNavGroupOn('consumer', activeGroupId)) return;
    setActiveTab('home');
    navigate('/home', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureTogglesLoaded, activeGroupId, isFeatureNavGroupOn]);
  const secondaryItems = (activeGroup ? SECONDARY_NAV[activeGroup.id] ?? [] : [])
    .filter((item) => !item.hostOnly || canHost);
  const [ministryView, setMinistryView] = useState<MinistryHubView>('my-ministries');
  const [liveChannelsTab, setLiveChannelsTab] = useState<LiveChannelsTab>('discover');

  // A member who lands on a host-only Live tab (old link, Find a feature) sees Discover.
  useEffect(() => {
    if (entitlements.isLoading || canHost) return;
    if (HOST_ONLY_LIVE_TABS.includes(liveChannelsTab)) setLiveChannelsTab('discover');
  }, [entitlements.isLoading, canHost, liveChannelsTab]);

  // Hide the floating assistant while a call is open (ActiveCallContext broadcasts this).
  useEffect(() => {
    const handler = (e: Event) => setInCall(Boolean((e as CustomEvent).detail));
    window.addEventListener('call:active', handler as EventListener);
    return () => window.removeEventListener('call:active', handler as EventListener);
  }, []);

  // "Live now" strip on Home: a read-only count of channels broadcasting right now.
  useEffect(() => {
    if (activeTab !== 'home') return;
    let cancelled = false;
    supabase
      .from('live_channels')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('is_live', true)
      .then(({ count, error }) => { if (!cancelled && !error) setLiveNowCount(count || 0); });
    return () => { cancelled = true; };
  }, [activeTab]);

  // --- Draggable Pastoral Assistant button ---
  const ASSISTANT_SIZE = 56; // h-14 w-14
  const [assistantPos, setAssistantPos] = useState<{ x: number; y: number } | null>(null);
  const assistantDrag = useRef({ dragging: false, moved: false, offsetX: 0, offsetY: 0, startX: 0, startY: 0 });

  // Start in the default bottom-right spot once the viewport size is known.
  useEffect(() => {
    if (assistantPos === null && typeof window !== 'undefined') {
      setAssistantPos({
        x: window.innerWidth - ASSISTANT_SIZE - 16,
        // Phones: sit above the bottom bar.
        y: window.innerHeight - ASSISTANT_SIZE - (window.innerWidth < 768 ? 96 : 80),
      });
    }
  }, [assistantPos]);

  const clampAssistant = (x: number, y: number) => ({
    x: Math.min(Math.max(8, x), window.innerWidth - ASSISTANT_SIZE - 8),
    y: Math.min(Math.max(8, y), window.innerHeight - ASSISTANT_SIZE - 8),
  });

  const onAssistantPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    assistantDrag.current = {
      dragging: true,
      moved: false,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      startX: e.clientX,
      startY: e.clientY,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const onAssistantPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = assistantDrag.current;
    if (!d.dragging) return;
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 5) d.moved = true;
    setAssistantPos(clampAssistant(e.clientX - d.offsetX, e.clientY - d.offsetY));
  };

  const onAssistantPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    assistantDrag.current.dragging = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  // Hide the shell's floating controls while a content viewer is playing. Viewers
  // broadcast their state via the 'viewer:active' window event.
  useEffect(() => {
    const handler = (e: Event) => setIsViewerActive(Boolean((e as CustomEvent).detail));
    window.addEventListener('viewer:active', handler as EventListener);
    return () => window.removeEventListener('viewer:active', handler as EventListener);
  }, []);

  // Back-to-top is now provided app-wide by <BackToTop /> mounted at the router
  // root, so no per-layout scroll state or button is needed here.


  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (progressTimeoutRef.current) clearTimeout(progressTimeoutRef.current);
    };
  }, []);

  // Handle sign out
  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await authSignOut();
      window.location.href = '/';
    } catch (error) {
      console.error('[AppLayout] Sign out error:', error);
      window.location.href = '/';
    }
  }, [authSignOut, signingOut]);

  // Register service worker in production only. During Vite development, a stale
  // worker can keep serving old assets and cause blank screens after edits.
  useEffect(() => {
    if (serviceWorkerRegistered.current) return;
    serviceWorkerRegistered.current = true;
    if ('serviceWorker' in navigator) {
      if (import.meta.env.DEV) {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => registrations.forEach((registration) => registration.unregister()))
          .catch((error) => console.error('[AppLayout] SW unregister failed:', error?.message));
        return;
      }

      navigator.serviceWorker
        .register('/sw.js')
        .then(() => console.log('[AppLayout] Service Worker registered'))
        .catch((error) => console.error('[AppLayout] SW registration failed:', error?.message));
    }
  }, []);

  // Load counsellors from database
  const loadCounsellors = useCallback(async () => {
    setLoadingCounsellors(true);
    try {
      const { data, error } = await supabase
        .from('counsellors')
        .select('*')
        .eq('is_active', true)
        .order('rating', { ascending: false });

      if (error) throw error;

      // Map database fields to Counsellor interface
      const mappedCounsellors: Counsellor[] = (data || []).map(c => ({
        id: c.id,
        name: c.full_name,
        title: c.title,
        specialty: c.specialization?.[0],
        specializations: c.specialization || [],
        bio: c.bio,
        avatar_url: c.profile_image_url,
        email: c.email,
        phone: c.phone,
        is_available: c.is_active,
        hourly_rate: c.hourly_rate,
        rating: c.rating || 4.5,
        total_sessions: c.total_sessions || 0,
        is_verified: c.is_verified,
        languages: c.languages || ['English'],
        sessions: c.total_sessions || 0
      }));

      setCounsellors(mappedCounsellors);
    } catch (err) {
      console.error('[AppLayout] Failed to load counsellors:', err);
      setCounsellors([]);
    } finally {
      setLoadingCounsellors(false);
    }
  }, []);

  // Check if current user is a counsellor
  const checkCounsellorStatus = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('counsellors')
        .select('is_active, is_verified')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) {
        console.error('[AppLayout] Error checking counsellor status:', error);
        setIsCounsellor(false);
        setCounsellorAvailability(false);
        return;
      }
      
      // User is a counsellor if they have a record AND are verified
      // They appear in the dashboard if both verified and active
      if (data) {
        const isCounsellorVerified = data.is_verified === true;
        const isCounsellorActive = data.is_active === true;
        
        console.log('[AppLayout] Counsellor status:', { 
          user_id: user.id, 
          is_verified: data.is_verified, 
          is_active: data.is_active,
          will_show_dashboard: isCounsellorVerified && isCounsellorActive
        });
        
        // Show dashboard only if BOTH verified AND active
        setIsCounsellor(isCounsellorVerified && isCounsellorActive);
        setCounsellorAvailability(isCounsellorActive);
      } else {
        console.log('[AppLayout] No counsellor record found for user:', user.id);
        setIsCounsellor(false);
        setCounsellorAvailability(false);
      }
    } catch (err) {
      console.error('[AppLayout] Failed to check counsellor status:', err);
      setIsCounsellor(false);
      setCounsellorAvailability(false);
    } finally {
      setCounsellorChecked(true);
    }
  }, [user?.id]);

  // Load devotional progress
  const loadDevotionalProgress = useCallback(async () => {
    if (!user?.id) return;
    if (loadingProgressRef.current) return;
    loadingProgressRef.current = true;

    try {
      const { data } = await supabase
        .from('devotional_progress')
        .select('*')
        .eq('user_id', user.id);

      const map: Record<string, any> = {};
      (data || []).forEach((p: any) => {
        map[p.devotional_id] = {
          completed: p.completed_modules?.length || 0,
          total: p.total_modules
        };
      });
      setDevotionalProgress(map);
    } catch (err) {
      console.error('[AppLayout] Failed to load progress:', err);
    } finally {
      loadingProgressRef.current = false;
    }
  }, [user?.id]);

  // Load data when tab changes
  useEffect(() => {
    if (previousTab.current === activeTab) return;
    previousTab.current = activeTab;

    if (activeTab === 'devotional-library') loadDevotionalProgress();
    if (activeTab === 'counsellors') loadCounsellors();
    if (activeTab === 'my-dashboard') checkCounsellorStatus();
  }, [activeTab, loadDevotionalProgress, loadCounsellors, checkCounsellorStatus]);

  // Some tab names are valid URLs but have no screen of their own (old links,
  // search results, bookmarks). Send them somewhere real instead of an empty
  // page: Rewards lives in My Activity, Notifications is the bell panel, and
  // My Dashboard only exists for verified counsellors.
  // Replace (not push) the history entry so Back doesn't land on the
  // redirecting URL again.
  useEffect(() => {
    const redirect = (tab: string) => {
      setActiveTab(tab);
      navigate('/' + tab, { replace: true });
    };
    if (activeTab === 'rewards') {
      redirect('analytics');
    } else if (activeTab === 'notifications') {
      redirect('home');
      setShowNotifications(true);
    } else if (activeTab === 'my-dashboard' && counsellorChecked && !isCounsellor) {
      redirect('home');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, counsellorChecked, isCounsellor]);

  // Initial data loading. Only the counsellor check is needed up front (it
  // decides whether the My Dashboard tab exists), and it runs in the background
  // rather than holding the whole shell behind a spinner. The counsellor list
  // and devotional progress used to be fetched here too, blocking first paint
  // on a full `counsellors` table read; they now load only when their tab
  // opens (the tab-change effect above also covers starting on that tab).
  useEffect(() => {
    checkCounsellorStatus();
  }, [checkCounsellorStatus]);

  // Handle pending room join - redirect to live channels
  useEffect(() => {
    if (pendingRoomJoin) {
      // Legacy room joins are redirected to Live Channels
      navigateTab('live-channels');
      toast({
        title: t('common', 'info', 'Info'),
        description: t('livechannels', 'title', 'Voice/Video rooms have been replaced with Live Channels')
      });
      onRoomJoinHandled?.();
    }
  }, [pendingRoomJoin, onRoomJoinHandled, t, navigateTab]);

  const handleBookCounsellor = useCallback((counsellor: Counsellor) => {
    setSelectedCounsellor(counsellor);
    setShowBookingModal(true);
  }, []);

  const handleStartDevotional = useCallback((devotional: Devotional) => {
    setSelectedDevotional(devotional);
    navigateTab('devotional-library');
  }, [navigateTab]);

  const handleCloseDevotional = useCallback(() => {
    setSelectedDevotional(null);
    const timer = setTimeout(() => {
      if (isMounted.current) loadDevotionalProgress();
    }, 300);
    
    return () => clearTimeout(timer);
  }, [loadDevotionalProgress]);

  // Translated strings - FIXED: Using proper fallback values
  const welcomeText = t('auth', 'welcomeBack', 'Welcome');
  const heroTitle = t('hero', 'home.title', 'Transform Your Spiritual Journey');
  const heroSubtitle = t('hero', 'home.subtitle', 'Igniting Spiritual Growth. Empowering Believers. Transforming Lives');
  const booksCompletedLabel = t('hero', 'stats.booksCompleted', 'Books Completed');
  const prayersCompletedLabel = t('prayers', 'prayerPoints', 'Prayers Completed');
  const xpPointsLabel = t('hero', 'stats.devotionalsCompleted', 'Devotionals Completed');
  const disciplesLabel = t('community', 'followers', 'Disciples');
  const performanceStats = [
    {
      label: booksCompletedLabel,
      value: analyticsLoading ? '—' : analytics?.booksCompleted ?? 0,
      icon: BookOpen,
      color: 'from-orange-500 to-red-600',
    },
    {
      label: prayersCompletedLabel,
      value: analyticsLoading ? '—' : analytics?.prayersCompleted ?? 0,
      icon: Heart,
      color: 'from-purple-500 to-purple-700',
    },
    {
      label: xpPointsLabel,
      value: analyticsLoading ? '—' : analytics?.xpPoints ?? 0,
      icon: Star,
      color: 'from-amber-500 to-amber-600',
    },
    {
      label: disciplesLabel,
      value: analyticsLoading ? '—' : analytics?.disciples ?? 0,
      icon: Users,
      color: 'from-blue-500 to-blue-700',
    },
  ];

  // Hero shows the active page's title/description (home keeps the marketing hero).
  // Non-home heroes resolve through t('hero', ...) with the English PAGE_HERO as fallback.
  const heroBase = PAGE_HERO[activeTab] ?? { title: getTabLabel(activeTab), subtitle: '' };
  const pageHero = activeTab === 'home'
    ? { title: heroTitle, subtitle: heroSubtitle }
    : {
        title: t('hero', `${activeTab}.title`, heroBase.title),
        subtitle: t('hero', `${activeTab}.subtitle`, heroBase.subtitle),
      };

  // Stat tiles, rendered full-width on home and stacked in the sidebar elsewhere
  const renderStats = (gridClass: string) => (
    <div className={gridClass}>
      {performanceStats.map((stat) => {
        const Icon = stat.icon;
        return (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={<Icon className="h-6 w-6" />}
            color={`bg-gradient-to-br ${stat.color}`}
          />
        );
      })}
    </div>
  );
  // Compact capsule pills for mobile — mirrors the web "performance dock" styling
  // (rounded-full gradient chips) so the stats read the same on phones and desktop.
  const renderStatCapsules = (gridClass = 'grid grid-cols-2 gap-2') => (
    <div className={gridClass}>
      {performanceStats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className={`flex items-center gap-2 rounded-full bg-gradient-to-br ${stat.color} px-3 py-2 text-white shadow-sm`}
            title={`${stat.label}: ${stat.value}`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="text-sm font-bold leading-none">{stat.value}</span>
            <span className="min-w-0 truncate text-[11px] font-medium opacity-90">{stat.label}</span>
          </div>
        );
      })}
    </div>
  );
  const verifiedCounsellorsTitle = t('counselling', 'counsellors', 'Verified Counsellors');
  const refreshText = t('common', 'refresh', 'Refresh');
  const noCounsellorsTitle = t('appShell', 'noCounsellorsTitle', 'No counsellors available');
  const noCounsellorsDesc = t('appShell', 'noCounsellorsDesc', 'Check back later for available counsellors.');
  const nowPlayingTitle = t('appShell', 'nowPlaying', 'Now playing');

  const shownNavGroups = NAV_GROUPS.filter((group) => isFeatureNavGroupOn('consumer', group.id));
  const focusNavGroups = shownNavGroups.filter((group) => inNavFocus(group.id));
  const otherNavGroups = shownNavGroups.filter((group) => !inNavFocus(group.id));
  // Open "More" by itself when the current page lives there.
  const moreGroupsOpen = showMoreGroups || otherNavGroups.some((group) => group.id === activeGroup?.id);
  const railButtonClass = 'group flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-center text-[11px] font-semibold leading-tight transition-colors text-gray-500 hover:text-purple-700';
  const railIconClass = 'flex h-10 w-10 items-center justify-center rounded-2xl transition-colors bg-gray-50 text-gray-600 group-hover:bg-purple-100';
  const renderPrimaryNavigation = (className: string) => (
    <nav className={className} aria-label="Primary navigation" data-tour="primary-nav">
      {[...focusNavGroups, ...(moreGroupsOpen ? otherNavGroups : [])].map((group) => {
        const Icon = group.icon ?? List;
        const active = activeGroup?.id === group.id;
        return (
          <button
            key={group.id}
            data-tour={`nav-${group.id}`}
            onClick={() => navigateTab(group.children ? group.children[0] : group.id)}
            aria-current={active ? 'page' : undefined}
            className={`group flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-center text-[11px] font-semibold leading-tight transition-colors ${
              active ? 'text-purple-700' : 'text-gray-500 hover:text-purple-700'
            }`}
          >
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-colors ${
                active ? 'bg-purple-600 text-white shadow-sm' : 'bg-purple-50 text-purple-700 group-hover:bg-purple-100'
              }`}
            >
              {group.emoji ? (
                <span className="text-xl leading-none">{group.emoji}</span>
              ) : (
                <Icon className="h-5 w-5 shrink-0" />
              )}
            </span>
            <span>{groupLabel(group)}</span>
          </button>
        );
      })}
      {otherNavGroups.length > 0 && (
        <button
          type="button"
          onClick={() => setShowMoreGroups(!moreGroupsOpen)}
          aria-expanded={moreGroupsOpen}
          className={railButtonClass}
        >
          <span className={railIconClass}>
            {moreGroupsOpen ? <ChevronUp className="h-5 w-5" /> : <MoreHorizontal className="h-5 w-5" />}
          </span>
          <span>{moreGroupsOpen ? t('navigation', 'less', 'Less') : t('navigation', 'more', 'More')}</span>
        </button>
      )}
      {navFocus && (
        <button type="button" onClick={() => setNavFocusOpen(true)} className={railButtonClass}>
          <span className={railIconClass}><SlidersHorizontal className="h-5 w-5" /></span>
          <span>{t('navFocus', 'change', 'Change what I see')}</span>
        </button>
      )}
    </nav>
  );

  const handleSecondaryClick = (item: SecondaryNavItem) => {
    if (item.tab) {
      navigateTab(item.tab);
      return;
    }
    if (item.ministryView) {
      navigateTab('ministries');
      setMinistryView(item.ministryView);
      return;
    }
    if (item.liveTab) {
      navigateTab('live-channels');
      setLiveChannelsTab(item.liveTab);
    }
  };

  // "Find a feature" (FeatureFinder) asks for navigation through this event,
  // so it can be rendered anywhere, including over a ministry workspace.
  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent<FeatureAction>).detail;
      if (!action) return;
      switch (action.kind) {
        case 'tab':
          navigateTab(action.tab);
          break;
        case 'ministries':
          navigateTab('ministries');
          setMinistryView(action.view);
          break;
        case 'live':
          navigateTab('live-channels');
          setLiveChannelsTab(action.tab);
          break;
        case 'content-search':
          if (ministryWorkspaceActive) setMinistryView('my-ministries');
          setSearchOpen(true);
          break;
      }
    };
    window.addEventListener(FEATURE_NAVIGATE_EVENT, handler);
    return () => window.removeEventListener(FEATURE_NAVIGATE_EVENT, handler);
  }, [navigateTab, ministryWorkspaceActive]);

  // Guided tutorials open screens through this. It must be idempotent: the
  // engine calls it even when the screen is already showing.
  const settingsRetryTimers = useRef<number[]>([]);
  const tutorialNavigate = useCallback((nav: TutorialNav) => {
    const openTab = (tab: string) => { if (activeTab !== tab) navigateTab(tab); };
    switch (nav.kind) {
      case 'tab':
        openTab(nav.tab as string);
        break;
      case 'live':
        openTab('live-channels');
        setLiveChannelsTab(nav.tab as LiveChannelsTab);
        break;
      case 'ministries':
        openTab('ministries');
        setMinistryView(nav.view as MinistryHubView);
        break;
      case 'settings': {
        openTab('profile');
        // Settings may still be loading, so ask a few times; a newer request
        // cancels the older one's retries.
        const detail = { section: nav.section };
        settingsRetryTimers.current.forEach((id) => window.clearTimeout(id));
        settingsRetryTimers.current = [60, 400, 1200].map((ms) => window.setTimeout(
          () => window.dispatchEvent(new CustomEvent('openProfileSection', { detail })), ms));
        break;
      }
    }
  }, [activeTab, navigateTab]);
  const isConsumerNavGroupOn = useCallback(
    (navId: string) => isFeatureNavGroupOn('consumer', navId), [isFeatureNavGroupOn]);

  const isSecondaryActive = (item: SecondaryNavItem) => {
    if (item.tab) return activeTab === item.tab;
    if (item.ministryView) return activeTab === 'ministries' && ministryView === item.ministryView;
    if (item.liveTab) return activeTab === 'live-channels' && liveChannelsTab === item.liveTab;
    return false;
  };

  const renderSecondaryNavigation = () => {
    if (!activeGroup || secondaryItems.length === 0) return null;

    return (
      <aside
        className="hidden md:flex fixed inset-y-0 z-[55] flex-col border-r border-gray-200 bg-white/95 shadow-sm backdrop-blur"
        style={{ left: '6rem', width: '14rem' }}
      >
        <div className="flex h-20 flex-col justify-center border-b border-gray-100 px-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t('navigation', 'module', 'Module')}</p>
          <h2 className="text-base font-semibold text-gray-900">{groupLabel(activeGroup)}</h2>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label={`${groupLabel(activeGroup)} navigation`} data-tour="secondary-nav">
          {secondaryItems.map((item) => {
            const Icon = item.icon;
            const active = isSecondaryActive(item);
            return (
              <button
                key={item.id}
                data-tour={`subnav-${item.id}`}
                onClick={() => handleSecondaryClick(item)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  active
                    ? 'bg-purple-50 text-purple-700'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-purple-700'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{itemLabel(item)}</span>
              </button>
            );
          })}
        </nav>
      </aside>
    );
  };

  const accountGroups = ACCOUNT_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      (item !== 'my-dashboard' || isCounsellor) && (canShowPurchaseUI() || !PURCHASE_TABS.includes(item))),
  }));
  const openFeatureFinder = () => window.dispatchEvent(new CustomEvent(OPEN_FEATURE_FINDER_EVENT));
  const openHelp = () => navigate('/faq');

  // Phone bottom bar. With a chosen focus it shows Home plus the first three
  // chosen groups; otherwise Home, Word, Prayer and Church.
  const bottomTabs = navFocus
    ? [BOTTOM_TABS[0], ...FOCUS_BOTTOM_TABS.filter((b) => b.id !== 'home' && navFocus.includes(b.id) && isFeatureNavGroupOn('consumer', b.id))
        .sort((a, b) => NAV_GROUPS.findIndex((g) => g.id === a.id) - NAV_GROUPS.findIndex((g) => g.id === b.id))
        .slice(0, 3)]
    : BOTTOM_TABS.filter((b) => b.id === 'home' || isFeatureNavGroupOn('consumer', b.id));
  const inBottomBar = (groupId: string) => bottomTabs.some((b) => b.id === groupId);
  const bottomActiveId = activeTab === 'home' ? 'home' : bottomTabs.some((b) => b.id === activeGroup?.id) ? activeGroup?.id : 'more';

  // Phone "More" sheet: the main groups not in the bottom bar (usually Live
  // and Community), then the account groups.
  const moreGroupTiles = (['the-word', 'prayer', 'ministries'] as const)
    .filter((id) => !inBottomBar(id) && isFeatureNavGroupOn('consumer', id))
    .map((id) => {
      const group = NAV_GROUPS.find((g) => g.id === id)!;
      const tab = FOCUS_BOTTOM_TABS.find((b) => b.id === id)!.tab;
      return { tab, label: groupLabel(group), icon: group.icon };
    });
  const moreExploreItems: { tab: string; label: string; icon: React.ComponentType<{ className?: string }>; liveTab?: LiveChannelsTab }[] = [
    ...moreGroupTiles,
    ...(isFeatureNavGroupOn('consumer', 'live-channels') && !inBottomBar('live-channels') ? [{ tab: 'live-channels', label: t('navigation', 'bottomLive', 'Live'), icon: Radio }] : []),
    ...(isFeatureNavGroupOn('consumer', 'community') && !inBottomBar('community') ? (SECONDARY_NAV.community ?? []).map((item) => ({ tab: item.tab as string, label: itemLabel(item), icon: item.icon })) : []),
    { tab: 'ai', label: getTabLabel('ai'), icon: Bot },
    ...(groupChats.chats.length > 0 ? [{ tab: 'messages', label: getTabLabel('messages'), icon: MessagesSquare }] : []),
  ];
  const moreSheetTile = (key: string, label: string, Icon: React.ComponentType<{ className?: string }>, onSelect: () => void, active = false) => (
    <button
      key={key}
      type="button"
      onClick={() => { setShowMoreSheet(false); onSelect(); }}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center text-xs font-medium transition-colors ${
        active ? 'bg-purple-50 text-purple-700' : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      <Icon className="h-5 w-5" />
      <span className="leading-tight">{label}</span>
    </button>
  );
  const shellClassName = secondaryItems.length > 0
    ? 'min-h-screen bg-gray-50 pb-16 md:pb-0 md:pl-80'
    : 'min-h-screen bg-gray-50 pb-16 md:pb-0 md:pl-24';
  const appShellClassName = ministryWorkspaceActive ? 'min-h-screen bg-gray-50' : shellClassName;

  return (
    <RekindleTutorialProvider
      userId={user?.id}
      currentPage={activeTab}
      navigate={tutorialNavigate}
      suspended={ministryWorkspaceActive || isViewerActive}
      isNavGroupOn={isConsumerNavGroupOn}
      isCounsellor={isCounsellor}
    >
    <div className={appShellClassName}>
      {/* First-visit welcome + guided tours (replaces the old tips modal). */}
      <WelcomeDialog allowed={!ministryWorkspaceActive && !isViewerActive && activeTab === 'home' && location.pathname.split('/').filter(Boolean).length <= 1} />
      <TutorialLibrary />

      {!ministryWorkspaceActive && !isViewerActive && (
        <>
          <aside
            className="hidden md:flex fixed inset-y-0 left-0 z-[60] flex-col border-r border-gray-200 bg-white shadow-sm"
            style={{ width: '6rem' }}
          >
            <div className="flex h-20 items-center justify-center border-b border-gray-100">
              <button
                onClick={() => navigateTab('home')}
                aria-label="Go to Home"
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-600 font-serif text-xl font-bold text-white shadow-sm"
              >
                R
              </button>
            </div>
            {renderPrimaryNavigation('flex flex-1 flex-col gap-2 overflow-y-auto px-2 py-4')}
          </aside>
          {renderSecondaryNavigation()}
        </>
      )}

      {!ministryWorkspaceActive && !isViewerActive && <header
        style={Capacitor.isNativePlatform() ? { paddingTop: 'env(safe-area-inset-top)' } : undefined}
        className={`bg-white shadow-sm z-50 ${
          Capacitor.isNativePlatform() ? 'fixed top-0 left-0 right-0' : 'sticky top-0'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 py-2 md:py-3 flex items-center justify-between">
          <h1 className="text-xl md:text-2xl font-serif font-bold text-purple-700 flex-shrink-0 md:hidden">Rekindle</h1>
          <div className="hidden md:block" />
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { setSearchOpen(true); setShowNotifications(false); }}
              data-tour="search-button"
              title={t('common', 'search', 'Search')}
              aria-label={t('common', 'search', 'Search')}
              className="h-10 w-10 rounded-xl text-gray-700 hover:bg-gray-100 hover:text-gray-900 p-0"
            >
              <Search className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
            <HelpMenu className="h-10 w-10 rounded-xl text-gray-700 hover:bg-gray-100 hover:text-gray-900 p-0" />

            {isPremium && (
              <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white hidden md:flex">
                <Crown className="h-3 w-3 mr-1" />
                {profile?.subscription_tier}
              </Badge>
            )}

            {isCounsellor && (
              <Badge 
                className={`hidden md:flex ${
                  counsellorAvailability 
                    ? 'bg-green-500 text-white' 
                    : 'bg-gray-400 text-white'
                }`}
              >
                <User className="h-3 w-3 mr-1" />
                {counsellorAvailability ? t('counselling', 'availability', 'Available') : t('common', 'incomplete', 'Unavailable')}
              </Badge>
            )}

            <span className="text-sm text-gray-600 hidden md:block">
              {welcomeText}, {!initialized ? '' : (profile?.full_name || 'Friend')}
            </span>

            {isTranslating && (
              <Loader2 className="hidden md:block h-4 w-4 animate-spin text-purple-500" />
            )}

            {(groupChats.chats.length > 0 || activeTab === 'messages') && (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { navigateTab('messages'); setShowNotifications(false); setSearchOpen(false); }}
                  aria-label={t('navigation', 'messages', 'Messages')}
                  className="h-10 w-10 rounded-xl text-gray-700 hover:bg-gray-100 hover:text-gray-900 p-0"
                >
                  <MessagesSquare className="h-4 w-4 md:h-5 md:w-5" />
                </Button>
                {(groupChats.unreadTotal + groupChats.inviteCount) > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-[11px] font-bold leading-none shadow ring-2 ring-white pointer-events-none"
                    aria-label={`${groupChats.unreadTotal + groupChats.inviteCount} unread`}
                  >
                    {groupChats.unreadTotal + groupChats.inviteCount > 99 ? '99+' : groupChats.unreadTotal + groupChats.inviteCount}
                  </span>
                )}
              </div>
            )}

            <>
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setShowNotifications((v) => !v); setSearchOpen(false); }}
                  data-tour="notifications-button"
                  aria-label={t('profile', 'notifications', 'Notifications')}
                  className="h-10 w-10 rounded-xl text-gray-700 hover:bg-gray-100 hover:text-gray-900 p-0"
                >
                  <Bell className="h-4 w-4 md:h-5 md:w-5" />
                </Button>
                {notif.unreadCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-[11px] font-bold leading-none shadow ring-2 ring-white pointer-events-none"
                    aria-label={`${notif.unreadCount} unread`}
                  >
                    {notif.unreadCount > 99 ? '99+' : notif.unreadCount}
                  </span>
                )}
                <NotificationFeed
                  open={showNotifications}
                  onClose={() => setShowNotifications(false)}
                  notifications={notif.notifications}
                  unreadCount={notif.unreadCount}
                  loading={notif.loading}
                  markRead={notif.markRead}
                  markAllRead={notif.markAllRead}
                  dismiss={notif.dismiss}
                />
              </div>

              <DropdownMenu onOpenChange={(isOpen) => { if (isOpen) { setShowNotifications(false); setSearchOpen(false); } }}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Account menu"
                    data-tour="account-menu"
                    className="h-10 w-10 rounded-xl text-gray-700 hover:bg-gray-100 hover:text-gray-900 p-0"
                  >
                    <User className="h-4 w-4 md:h-5 md:w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 max-h-[80vh] overflow-y-auto">
                  {accountGroups.map((group, gi) => (
                    <React.Fragment key={group.id}>
                      {gi > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {t('navigation', group.labelKey, group.label)}
                      </DropdownMenuLabel>
                      {group.items.map((item) => {
                        const ItemIcon = TAB_ICONS[item] ?? List;
                        return (
                          <DropdownMenuItem key={item} onClick={() => navigateTab(item)} className="gap-2" data-tour={`account-${item}`}>
                            <ItemIcon className="h-4 w-4" />
                            {getTabLabel(item)}
                          </DropdownMenuItem>
                        );
                      })}
                    </React.Fragment>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={openFeatureFinder} className="gap-2">
                    <Compass className="h-4 w-4" />
                    {t('featureFinder', 'button', 'Find a feature')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openHelp} className="gap-2">
                    <HelpCircle className="h-4 w-4" />
                    {t('navigation', 'help', 'Help & FAQ')}
                  </DropdownMenuItem>
                  {isAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => navigateTab('admin')} className="gap-2">
                        <Shield className="h-4 w-4" /> {getTabLabel('admin')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigateTab('admin-health')} className="gap-2">
                        <Activity className="h-4 w-4" /> {getTabLabel('admin-health')}
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} disabled={signingOut} className="gap-2">
                    <LogOut className="h-4 w-4" />
                    {t('auth', 'logout', 'Sign Out')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

            </>
          </div>
        </div>
        {/* Phones navigate with the bottom bar; a module's sub-tabs sit above the page content. */}
      </header>}

      <main className={ministryWorkspaceActive ? 'w-full' : 
        `mx-auto w-full max-w-7xl px-4 pb-12 md:pb-16 md:pt-6 ${
          Capacitor.isNativePlatform() ? 'pt-16' : 'pt-4'
        }`
      }>
        {/* The photo banner is for Home only; other pages get a one-line title. */}
        {!ministryWorkspaceActive && activeTab === 'home' && <section
          className="relative mb-[14px] overflow-hidden rounded-2xl bg-cover bg-center shadow-sm"
          style={{
            backgroundImage:
              "url('https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231136643_d72d9fd3.webp')"
          }}
        >
          <div className="bg-gradient-to-r from-purple-900/90 to-purple-600/80 flex items-center justify-center px-4 py-8 md:py-10 min-h-[150px]">
            <div className="text-center text-white">
              <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold mb-1">
                {pageHero.title}
              </h1>
              {pageHero.subtitle && (
                <p className="text-sm sm:text-base md:text-lg opacity-90">
                  {pageHero.subtitle}
                </p>
              )}
            </div>
          </div>
        </section>}

        {/* Phone sub-tabs for the current module (Word, Prayer, Live, Community). */}
        {!ministryWorkspaceActive && !isViewerActive && activeGroup && secondaryItems.length > 0 && (
          <nav className="md:hidden -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1" aria-label={`${groupLabel(activeGroup)} navigation`} data-tour="secondary-nav">
            {secondaryItems.map((item) => {
              const Icon = item.icon;
              const active = isSecondaryActive(item);
              return (
                <button
                  key={item.id}
                  data-tour={`subnav-${item.id}`}
                  onClick={() => handleSecondaryClick(item)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ${
                    active
                      ? 'border-purple-200 bg-purple-50 text-purple-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:text-purple-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {itemLabel(item)}
                </button>
              );
            })}
          </nav>
        )}

        {!ministryWorkspaceActive && activeTab !== 'home' && (
          <div className="mb-3 flex min-w-0 items-baseline gap-3 md:mb-5">
            <h1 className="min-w-0 truncate font-serif text-xl font-bold text-gray-900 md:text-2xl">{pageHero.title}</h1>
            {pageHero.subtitle && (
              <p className="hidden min-w-0 truncate text-sm text-gray-500 md:block">{pageHero.subtitle}</p>
            )}
          </div>
        )}

        {/* Home stat capsules (the only place stats show in the shell; the full
            breakdown is in My activity). */}
        {!ministryWorkspaceActive && activeTab === 'home' && (
          <div className="relative z-10 mb-4 px-0">
            {renderStatCapsules('grid grid-cols-2 gap-2 md:grid-cols-4')}
          </div>
        )}
        <div className="min-w-0 max-w-full overflow-x-clip" data-tour={`page-${activeTab}`}>
            <ErrorBoundary>
            <Suspense fallback={<RouteFallback fullScreen={false} />}>
          {activeTab === 'home' && (
            <div className="space-y-6">
              {/* Home order: (greeting + stats above) → live strip → streak →
                  today's devotional, declaration, affirmation → tips/promos. */}
              {liveNowCount > 0 && isFeatureNavGroupOn('consumer', 'live-channels') && (
                <button
                  type="button"
                  onClick={() => { navigateTab('live-channels'); setLiveChannelsTab('discover'); }}
                  className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-red-500 to-rose-600 px-4 py-3 text-left text-white shadow-sm"
                >
                  <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-white" aria-hidden="true" />
                  <span className="flex-1 font-semibold">
                    {t('appShell', 'liveNow', '{count} live now').replace('{count}', String(liveNowCount))}
                  </span>
                  <span className="text-sm font-medium opacity-90">{t('appShell', 'watch', 'Watch')}</span>
                </button>
              )}
              <NavFocusHomeCard />
              <div data-tour="home-streak">
                <StreakWidget />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <div data-tour="devotional-source">
                  <DevotionalSourceSettings
                    onSaved={(src, minId, streamId) => {
                      setDevotionalSource(src);
                      setDevotionalMinistryId(minId);
                      setDevotionalStreamId(streamId ?? null);
                    }}
                  />
                  </div>
                  <div data-tour="home-devotional">
                  <DailyDevotionalWidget
                    onStartDevotional={handleStartDevotional}
                    source={devotionalSource}
                    ministryId={devotionalMinistryId}
                    streamId={devotionalStreamId}
                    onOpenLibrary={() => navigateTab('devotional-library')}
                  />
                  </div>
                </div>
                <div id="daily-declaration" data-tour="home-declaration">
                  <DeclarationCard showDaily />
                </div>
                <div data-tour="home-affirmation">
                  <AffirmationCard showDaily />
                </div>
              </div>
              <InstrumentalPlayer />
              {/* Tips and promos come after the core daily content. */}
              <ReminderSetupTip
                onSetup={() => {
                  setActiveTab('profile');
                  // Let ProfileSettings mount, then open the Daily Reminders section.
                  setTimeout(() => window.dispatchEvent(
                    new CustomEvent('openProfileSection', { detail: { section: 'reminders' } })), 100);
                }}
              />
              {canHost && (
                <FreeMeetingsPromoCard
                  onStartMeeting={() => { navigateTab('live-channels'); setLiveChannelsTab('meetings'); }}
                  onSeePlans={() => navigateTab('subscription')}
                  showApiLink={false}
                />
              )}
            </div>
          )}

          {activeTab === 'devotional-library' && <DevotionalLibrary />}

          {activeTab === 'ministries' && (
            <MinistriesHub
              activeView={ministryView}
              onActiveViewChange={setMinistryView}
              onWorkspaceChange={setMinistryWorkspaceActive}
            />
          )}

          {activeTab === 'messages' && (
            <GroupChatInbox
              initialGroupId={messagesGroupId}
              onFindGroups={() => navigateTab('ministries')}
            />
          )}

          {activeTab === 'prayer-library' && <PrayerLibrary />}

          {activeTab === 'journal' && <PrayerJournal />}

          {activeTab === 'revelations' && <CommunityRevelations />}
          {activeTab === 'community-feed' && (
            <CommunityActivityFeed onOpenPrayerWall={() => navigateTab('wall')} onOpenRevelations={() => navigateTab('revelations')} />
          )}
          {activeTab === 'reading-plan' && <BibleReadingPlan />}
          {activeTab === 'books' && <BookSummaries />}
          {activeTab === 'live-channels' && (
            <LiveChannels activeTab={liveChannelsTab} onActiveTabChange={setLiveChannelsTab} />
          )}

          {activeTab === 'analytics' && <UserActivityDashboard />}

          {activeTab === 'reminders' && <DailyReminders />}

          {activeTab === 'challenges' && <EnhancedPrayerChallenges />}
          {activeTab === 'wall' && <CommunityPrayerWall />}
          {activeTab === 'scripture' && <ScriptureMemory />}

          {activeTab === 'counsellors' && (
            <div>
              <div className="flex items-center justify-between gap-3 mb-6">
                <h2 className="text-2xl sm:text-3xl font-serif font-bold min-w-0 truncate">{verifiedCounsellorsTitle}</h2>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={loadCounsellors}
                  disabled={loadingCounsellors}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loadingCounsellors ? 'animate-spin' : ''}`} />
                  {refreshText}
                </Button>
              </div>
              {loadingCounsellors ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                </div>
              ) : counsellors.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl shadow">
                  <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">{noCounsellorsTitle}</h3>
                  <p className="text-gray-500">{noCounsellorsDesc}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-tour="counsellor-list">
                  {counsellors.map((c) => (
                    <CounsellorCard
                      key={c.id}
                      counsellor={c}
                      onBook={() => handleBookCounsellor(c)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'bookings' && (
            <>
              <MyBookings />
            </>
          )}

          {activeTab === 'my-dashboard' && isCounsellor && (
            <>
              <CounsellorDashboard />
            </>
          )}

          {activeTab === 'ai' && <GraceCounselChat />}

          {activeTab === 'music' && (
            <>
              <MusicLibrary 
                onSelectTrack={(track) => toast({ 
                  title: nowPlayingTitle, 
                  description: track.title 
                })} 
                currentTrack={null} 
                isPlaying={false} 
              />
            </>
          )}


          {activeTab === 'billing' && canShowPurchaseUI() && (
            <>
              <PaymentHistory onNavigateToSubscription={() => navigateTab('subscription')} />
            </>
          )}

          {activeTab === 'subscription' && canShowPurchaseUI() && <SubscriptionManager />}

          {activeTab === 'sponsor' && canShowPurchaseUI() && <SponsorshipSystem />}

          {activeTab === 'admin' && isAdmin && (
            <ErrorBoundary>
              <AdminDashboard isSuperAdmin={authIsAdmin || profile?.role === 'super_admin'} />
            </ErrorBoundary>
          )}

          {activeTab === 'admin-health' && isAdmin && (
            <ErrorBoundary>
              <AdminSystemHealthDashboard />
            </ErrorBoundary>
          )}

          {activeTab === 'referral' && (
            <>
              <ReferralGenerator />
            </>
          )}

          {activeTab === 'profile' && <ProfileSettings />}

            </Suspense>
        </ErrorBoundary>
        </div>
      </main>

      {!ministryWorkspaceActive && !Capacitor.isNativePlatform() && <AppFooter onNavigate={navigateTab} />}

      {/* Pastoral Assistant (floating, draggable) */}
      {!ministryWorkspaceActive && !isViewerActive && !onChatScreen && !inCall && activeTab !== 'ai' && <button
        onPointerDown={onAssistantPointerDown}
        onPointerMove={onAssistantPointerMove}
        onPointerUp={onAssistantPointerUp}
        onClick={() => { if (!assistantDrag.current.moved) navigateTab('ai'); }}
        aria-label="Pastoral Assistant"
        data-tour="assistant-button"
        title="Pastoral Assistant"
        style={assistantPos ? { left: assistantPos.x, top: assistantPos.y, touchAction: 'none' } : { touchAction: 'none' }}
        className={`fixed ${assistantPos ? '' : 'bottom-20 right-4'} z-50 h-14 w-14 rounded-full shadow-lg flex items-center justify-center transition-colors cursor-grab active:cursor-grabbing select-none ${
          activeTab === 'ai' ? 'bg-purple-700 text-white' : 'bg-purple-600 text-white hover:bg-purple-700'
        }`}
      >
        <Bot className="h-6 w-6" />
      </button>}

      {/* Find a feature: opened from the account menu, the More sheet or Ctrl+K.
          Inside a ministry workspace (no app header) it keeps its floating button. */}
      {!isViewerActive && !onChatScreen && (
        <FeatureFinder
          isAdmin={isAdmin}
          hideTrigger={!ministryWorkspaceActive}
          className="bottom-20 left-4 md:bottom-6 md:left-28 [body[data-fullscreen-chat]_&]:hidden"
        />
      )}

      {/* Back-to-top is rendered globally by <BackToTop /> in App.tsx */}

      {/* Offline Indicator */}
      {!ministryWorkspaceActive && !isViewerActive && !onChatScreen && <div className="fixed bottom-20 right-4 z-50">
        <OfflineIndicator />
      </div>}

      {/* Phone bottom bar: Home, Word, Prayer, Church, More. */}
      {!ministryWorkspaceActive && !isViewerActive && (
        <nav
          aria-label={t('navigation', 'mainNav', 'Main')}
          className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex">
            {bottomTabs.map((b) => {
              const Icon = b.icon;
              const active = bottomActiveId === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  data-tour={`nav-${b.id}`}
                  onClick={() => {
                    // Tapping the current module again returns to its top.
                    if (active) window.scrollTo({ top: 0, behavior: 'smooth' });
                    else navigateTab(b.tab);
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                    active ? 'text-purple-700' : 'text-gray-500'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {t('navigation', b.labelKey, b.label)}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => { setShowMoreSheet(true); setShowNotifications(false); setSearchOpen(false); }}
              aria-haspopup="dialog"
              aria-expanded={showMoreSheet}
              className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                bottomActiveId === 'more' ? 'text-purple-700' : 'text-gray-500'
              }`}
            >
              <MoreHorizontal className="h-5 w-5" />
              {t('navigation', 'more', 'More')}
            </button>
          </div>
        </nav>
      )}

      <Sheet open={showMoreSheet} onOpenChange={setShowMoreSheet}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle>{t('navigation', 'more', 'More')}</SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-4">
            <div className="grid grid-cols-3 gap-1">
              {moreExploreItems.map((item) => moreSheetTile(item.tab, item.label, item.icon, () => {
                navigateTab(item.tab);
                if (item.tab === 'live-channels') setLiveChannelsTab('discover');
              }, activeTab === item.tab))}
            </div>
            {accountGroups.map((group) => (
              <div key={group.id}>
                <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {t('navigation', group.labelKey, group.label)}
                </p>
                <div className="grid grid-cols-3 gap-1">
                  {group.items.map((item) => moreSheetTile(item, getTabLabel(item), TAB_ICONS[item] ?? List, () => navigateTab(item), activeTab === item))}
                </div>
              </div>
            ))}
            <div className="grid grid-cols-3 gap-1 border-t border-gray-100 pt-3">
              {moreSheetTile('find', t('featureFinder', 'button', 'Find a feature'), Compass, openFeatureFinder)}
              {moreSheetTile('help', t('navigation', 'help', 'Help & FAQ'), HelpCircle, openHelp)}
              {moreSheetTile('nav-focus', t('navFocus', 'change', 'Change what I see'), SlidersHorizontal, () => setNavFocusOpen(true))}
              {isAdmin && moreSheetTile('admin', getTabLabel('admin'), Shield, () => navigateTab('admin'), activeTab === 'admin')}
              {isAdmin && moreSheetTile('admin-health', getTabLabel('admin-health'), Activity, () => navigateTab('admin-health'), activeTab === 'admin-health')}
              {moreSheetTile('signout', t('auth', 'logout', 'Sign Out'), LogOut, handleSignOut)}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <NavFocusDialog open={navFocusOpen} onOpenChange={setNavFocusOpen} />

      {/* Global Search Modal */}
      {/* Mounted only while open (it renders nothing when closed) so its chunk
          is fetched on first use rather than with the app shell. */}
      {!ministryWorkspaceActive && searchOpen && (
        <Suspense fallback={null}>
          <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
        </Suspense>
      )}

      {/* Modals */}
      <PrayerPointModal
        prayerPoint={selectedPrayer}
        onClose={() => setSelectedPrayer(null)}
        onPray={() => {
          setSelectedPrayer(null);
        }}
      />

      {selectedCounsellor && (
        <Suspense fallback={null}>
          <CounsellorBookingModal
            counsellor={selectedCounsellor}
            open={showBookingModal}
            onClose={() => setShowBookingModal(false)}
            // The modal shows its own "Booking requested" message; the booking
            // stays pending until the counsellor confirms, so nothing more here.
            onBooked={() => {}}
          />
        </Suspense>
      )}
    </div>
    </RekindleTutorialProvider>
  );
};

export default AppLayout;
