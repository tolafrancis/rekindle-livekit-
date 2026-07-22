import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useOnboardingTips } from '@/hooks/useOnboardingTips';
import { useUserAnalytics } from '@/hooks/useUserAnalytics';
import { Flame, Heart, Star, Users, ChevronUp, ChevronDown } from 'lucide-react';
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
import { GraceCounselChat } from './GraceCounselChat';
import { ReferralGenerator } from './ReferralGenerator';
import { PrayerPointModal } from './PrayerPointModal';
import { AffirmationCard } from './AffirmationCard';
import { StreakWidget } from './StreakWidget';
import { ReminderSetupTip } from './ReminderSetupTip';
import { OnboardingTips } from './OnboardingTips';
import { DeclarationCard } from './DeclarationCard';
import { InstrumentalPlayer } from './InstrumentalPlayer';
import { ProfileSettings } from './ProfileSettings';
import { CounsellorBookingModal } from './CounsellorBookingModal';
import { MyBookings } from './MyBookings';
import { MusicLibrary } from './MusicLibrary';
import { CommunityPrayerWall } from './CommunityPrayerWall';
import { ScriptureMemory } from './ScriptureMemory';
import { NotificationFeed } from './NotificationFeed';
import { useNotifications } from '@/hooks/useNotifications';
import { AppFooter } from './AppFooter';
import { ScrollToTopButton } from '@rekindle/features/components/ScrollToTopButton';
import { UpgradePromptModal } from './UpgradePromptModal';
import { UserActivityDashboard } from './UserActivityDashboard';
import { BookSummaries } from './BookSummaries';
import { CommunityRevelations } from './CommunityRevelations';
import { CommunityActivityFeed } from './CommunityActivityFeed';
import { DevotionalLibrary } from './DevotionalLibrary';
import { PrayerLibrary } from './PrayerLibrary';
import GlobalSearch from './GlobalSearch';
import { DailyReminders } from './DailyReminders';
import { PrayerJournal } from './PrayerJournal';
import { BibleReadingPlan } from './BibleReadingPlan';
import { EnhancedPrayerChallenges } from './EnhancedPrayerChallenges';
import { LiveChannels } from './LiveChannels';
import { OfflineIndicator } from './OfflineIndicator';
import { DailyDevotionalWidget } from './DailyDevotionalWidget';
import { DevotionalSourceSettings } from './DevotionalSourceSettings';
import AdminDashboard from './AdminDashboard';
import { SubscriptionManager } from './SubscriptionManager';
import { SponsorshipSystem } from './SponsorshipSystem';
import AdminSystemHealthDashboard from './AdminSystemHealthDashboard';
import { PaymentHistory } from './PaymentHistory';
import { CounsellorDashboard } from './CounsellorDashboard';
import { ErrorBoundary } from './ErrorBoundary';
import MinistriesHub from './MinistriesHub';

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
  Building2
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';


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
  'community-feed': 'communityFeed',
  'reading-plan': 'readingPlan',
  'books': 'books',
  'live-channels': 'liveChannels',
  'analytics': 'analytics',
  'reminders': 'reminders',
  'notifications': 'notifications',
  'challenges': 'challenges',
  'wall': 'prayerWall',
  'scripture': 'scriptureMemory',
  'counsellors': 'counsellors',
  'bookings': 'myBookings',
  'ai': 'aiCompanion',
  'music': 'musicLibrary',
  'billing': 'billing',
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
  'community-feed':     { title: 'Community Feed',      subtitle: 'See what believers around you are sharing' },
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
  'billing':            { title: 'Billing',             subtitle: 'Manage your plan and payments' },
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
  'community-feed': 'Community Feed',
  'reading-plan': 'Reading Plan',
  'books': 'Books',
  'live-channels': 'Live Broadcast',
  'analytics': 'Analytics',
  'reminders': 'Reminders',
  'notifications': 'Notifications',
  'challenges': 'Challenges',
  'wall': 'Prayer Wall',
  'scripture': 'Scripture Memory',
  'counsellors': 'Counsellors',
  'bookings': 'My Bookings',
  'ai': 'Pastoral Assistant',
  'music': 'Music Library',
  'billing': 'Billing',
  'sponsor': 'Donate',
  'referral': 'Referral',
  'profile': 'Profile',
  'rewards': 'Rewards',
  'admin': 'Admin',
  'admin-health': 'System Health',
};

// Primary modules. The secondary rail owns the real navigation inside a module.
// Each group carries a colorful gradient so its icon renders as a filled, modern
// "app icon" chip (no flat outline-only glyphs). `emoji` overrides the lucide icon
// where a richer, more literal symbol is wanted (e.g. praying hands for Prayer).
// `labelKey` points at a navigation-namespace key so the label renders through
// t(); `label` is the English fallback.
type NavGroup = { id: string; label: string; labelKey: string; icon: typeof Home; gradient: string; emoji?: string; children?: string[] };
const NAV_GROUPS: NavGroup[] = [
  { id: 'home',          label: 'Home',           labelKey: 'home',         icon: Home,       gradient: 'from-violet-500 to-purple-600' },
  { id: 'the-word',      label: 'The Word',       labelKey: 'theWord',      icon: BookOpen,   gradient: 'from-amber-400 to-orange-500', children: ['devotional-library', 'reading-plan', 'scripture', 'books'] },
  { id: 'prayer',        label: 'Prayer',         labelKey: 'prayers',      icon: HandHeart,  gradient: 'from-rose-400 to-pink-600', emoji: '🙏', children: ['prayer-library', 'journal', 'wall'] },
  { id: 'ministries',    label: 'Ministries',     labelKey: 'ministries',   icon: Church,     gradient: 'from-sky-500 to-blue-600' },
  { id: 'live-channels', label: 'Live Broadcast', labelKey: 'liveChannels', icon: Radio,      gradient: 'from-red-500 to-rose-600' },
  { id: 'community',     label: 'Community',      labelKey: 'community',     icon: UsersRound, gradient: 'from-emerald-400 to-teal-600', children: ['community-feed', 'revelations', 'challenges', 'music'] },
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
  ministries: [
    { id: 'discover', label: 'Discover', labelKey: 'discover', icon: Globe, ministryView: 'discover' },
    { id: 'my-ministries', label: 'My Ministries', labelKey: 'myMinistries', icon: Heart, ministryView: 'my-ministries' },
    { id: 'manage', label: 'Manage', labelKey: 'manage', icon: Settings, ministryView: 'manage' },
  ],
  'live-channels': [
    { id: 'discover', label: 'Discover', labelKey: 'discover', icon: Tv, liveTab: 'discover' },
    { id: 'events', label: 'Events', labelKey: 'events', icon: Calendar, liveTab: 'events' },
    { id: 'following', label: 'Following', labelKey: 'following', icon: Heart, liveTab: 'following' },
    { id: 'my-channels', label: 'My Channels', labelKey: 'myChannels', icon: Mic, liveTab: 'my-channels' },
    { id: 'meetings', label: 'Meetings', labelKey: 'meetings', icon: Video, liveTab: 'meetings' },
    { id: 'analytics', label: 'Analytics', labelKey: 'analytics', icon: BarChart3, liveTab: 'analytics' },
  ],
  community: [
    { id: 'community-feed', label: 'Feed', labelKey: 'feed', icon: Users, tab: 'community-feed' },
    { id: 'revelations', label: 'Revelations', labelKey: 'revelations', icon: Sparkles, tab: 'revelations' },
    { id: 'challenges', label: 'Challenges', labelKey: 'challenges', icon: Trophy, tab: 'challenges' },
    { id: 'music', label: 'Music', labelKey: 'music', icon: Music, tab: 'music' },
  ],
};

// Personal / account items live in the avatar menu, not the sidebar.
const ACCOUNT_ITEMS = ['my-dashboard', 'analytics', 'reminders', 'counsellors', 'bookings', 'referral', 'sponsor', 'billing', 'profile'];

// Which sidebar group owns the current tab (the leaf itself, or its parent).
const parentForTab = (tab: string): NavGroup | undefined =>
  NAV_GROUPS.find(g => g.id === tab || g.children?.includes(tab));

const AppLayout: React.FC<AppLayoutProps> = ({ pendingRoomJoin, onRoomJoinHandled, initialTab }) => {

  console.log('[AppLayout] Rendering with initialTab:', initialTab);

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
    return 'home';
  });

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
  
  console.log('[AppLayout] initialTab received:', initialTab);
  console.log('[AppLayout] activeTab state:', activeTab);
  
  const [selectedPrayer, setSelectedPrayer] = useState<PrayerPoint | null>(null);
  const [selectedDevotional, setSelectedDevotional] = useState<Devotional | null>(null);
  const [selectedCounsellor, setSelectedCounsellor] = useState<Counsellor | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const notif = useNotifications();
  const [searchOpen, setSearchOpen] = useState(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  // True while a full-screen content viewer is playing (devotional / prayer
  // session / prayer series). Used to hide the floating Stats button.
  const [isViewerActive, setIsViewerActive] = useState(false);
  const [performanceDockCollapsed, setPerformanceDockCollapsed] = useState(false);
  const [ministryWorkspaceActive, setMinistryWorkspaceActive] = useState(false);
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

  // Listen for 'openSubscription' events dispatched by UpgradePromptModal
  // Listen for openDonate events from UpgradePromptModal
  useEffect(() => {
    const donateHandler = () => {
      setActiveTab('profile');
      // Small delay to ensure profile tab renders, then scroll to partner section
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('openPartnerSection'));
      }, 100);
    };
    window.addEventListener('openDonate', donateHandler);
    return () => window.removeEventListener('openDonate', donateHandler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const category = (e as CustomEvent).detail?.category ?? 'individual';
      setActiveTab('sponsor');
      sessionStorage.setItem('subscriptionCategory', category);
    };
    window.addEventListener('openSubscription', handler);
    return () => window.removeEventListener('openSubscription', handler);
  }, []);
  const [devotionalProgress, setDevotionalProgress] = useState<Record<string, any>>({});
  const [signingOut, setSigningOut] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [counsellors, setCounsellors] = useState<Counsellor[]>([]);
  const [loadingCounsellors, setLoadingCounsellors] = useState(false);
  const [isCounsellor, setIsCounsellor] = useState(false);
  const [counsellorAvailability, setCounsellorAvailability] = useState(false);

  // Refs
  const loadingProgressRef = useRef(false);
  const isMounted = useRef(true);
  const progressTimeoutRef = useRef<number | null>(null);
  const serviceWorkerRegistered = useRef(false);
  const previousTab = useRef<string>('home');

  const isAdmin = authIsAdmin || profile?.role === 'admin' || profile?.role === 'super_admin';
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
  const secondaryItems = activeGroup ? SECONDARY_NAV[activeGroup.id] ?? [] : [];
  const [ministryView, setMinistryView] = useState<MinistryHubView>('discover');
  const [liveChannelsTab, setLiveChannelsTab] = useState<LiveChannelsTab>('discover');

  // --- Draggable Pastoral Assistant button ---
  const ASSISTANT_SIZE = 56; // h-14 w-14
  const [assistantPos, setAssistantPos] = useState<{ x: number; y: number } | null>(null);
  const assistantDrag = useRef({ dragging: false, moved: false, offsetX: 0, offsetY: 0, startX: 0, startY: 0 });

  // Start in the default bottom-right spot once the viewport size is known.
  useEffect(() => {
    if (assistantPos === null && typeof window !== 'undefined') {
      setAssistantPos({
        x: window.innerWidth - ASSISTANT_SIZE - 16,
        y: window.innerHeight - ASSISTANT_SIZE - 80,
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

  // --- Draggable floating "Stats" button (mobile, inner pages) ---
  const [statsPos, setStatsPos] = useState<{ x: number; y: number } | null>(null);
  const statsContainerRef = useRef<HTMLDivElement>(null);
  const statsDrag = useRef({ dragging: false, moved: false, offsetX: 0, offsetY: 0, startX: 0, startY: 0 });

  const onStatsPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const container = statsContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    statsDrag.current = {
      dragging: true,
      moved: false,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      startX: e.clientX,
      startY: e.clientY,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const onStatsPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = statsDrag.current;
    if (!d.dragging) return;
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 5) d.moved = true;
    const container = statsContainerRef.current;
    const w = container?.offsetWidth ?? 120;
    const h = container?.offsetHeight ?? 48;
    const x = Math.min(Math.max(8, e.clientX - d.offsetX), window.innerWidth - w - 8);
    const y = Math.min(Math.max(8, e.clientY - d.offsetY), window.innerHeight - h - 8);
    setStatsPos({ x, y });
  };

  const onStatsPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    statsDrag.current.dragging = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  // Hide the floating Stats button while a content viewer is playing. Viewers
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

  // Initial data loading
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          loadDevotionalProgress(), 
          loadCounsellors(),
          checkCounsellorStatus()
        ]);
      } catch (error) {
        console.error('[AppLayout] Failed to load initial data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, [loadDevotionalProgress, loadCounsellors, checkCounsellorStatus]);

  // Handle pending room join - redirect to live channels
  useEffect(() => {
    if (pendingRoomJoin && !isLoading) {
      // Legacy room joins are redirected to Live Channels
      setActiveTab('live-channels');
      toast({
        title: t('common', 'info', 'Info'),
        description: t('livechannels', 'title', 'Voice/Video rooms have been replaced with Live Channels')
      });
      onRoomJoinHandled?.();
    }
  }, [pendingRoomJoin, onRoomJoinHandled, isLoading, t]);

  const handleBookCounsellor = useCallback((counsellor: Counsellor) => {
    setSelectedCounsellor(counsellor);
    setShowBookingModal(true);
  }, []);

  const handleStartDevotional = useCallback((devotional: Devotional) => {
    setSelectedDevotional(devotional);
    setActiveTab('devotional-library');
  }, []);

  const handleCloseDevotional = useCallback(() => {
    setSelectedDevotional(null);
    const timer = setTimeout(() => {
      if (isMounted.current) loadDevotionalProgress();
    }, 300);
    
    return () => clearTimeout(timer);
  }, [loadDevotionalProgress]);

  // Translated strings - FIXED: Using proper fallback values
  const welcomeText = t('auth', 'welcomeBack', 'Welcome');
  const loadingText = t('common', 'loading', 'Loading your spiritual journey...');
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
  const noCounsellorsTitle = t('counselling', 'counsellors', 'No Counsellors Available');
  const noCounsellorsDesc = t('common', 'later', 'Check back later for available counsellors.');
  const messageSentTitle = t('common', 'sent', 'Message Sent');
  const bookingConfirmedTitle = t('common', 'success', 'Booking Confirmed');
  const bookingConfirmedDesc = t('counselling', 'bookSession', 'Your counselling session has been scheduled');
  const nowPlayingTitle = t('common', 'start', 'Now Playing');

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">{loadingText}</p>
        </div>
      </div>
    );
  }

  const renderPrimaryNavigation = (className: string) => (
    <nav className={className} aria-label="Primary navigation">
      {NAV_GROUPS.map((group) => {
        const Icon = group.icon ?? List;
        const active = activeGroup?.id === group.id;
        return (
          <button
            key={group.id}
            onClick={() => setActiveTab(group.children ? group.children[0] : group.id)}
            aria-current={active ? 'page' : undefined}
            className={`group flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-center text-[11px] font-semibold leading-tight transition-colors ${
              active ? 'text-purple-700' : 'text-gray-500 hover:text-purple-700'
            }`}
          >
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${group.gradient} text-white shadow-md transition-transform ${
                active ? 'scale-110 ring-2 ring-purple-300 ring-offset-2' : 'group-hover:scale-105'
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
    </nav>
  );

  const handleSecondaryClick = (item: SecondaryNavItem) => {
    if (item.tab) {
      setActiveTab(item.tab);
      return;
    }
    if (item.ministryView) {
      setActiveTab('ministries');
      setMinistryView(item.ministryView);
      return;
    }
    if (item.liveTab) {
      setActiveTab('live-channels');
      setLiveChannelsTab(item.liveTab);
    }
  };

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
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label={`${groupLabel(activeGroup)} navigation`}>
          {secondaryItems.map((item) => {
            const Icon = item.icon;
            const active = isSecondaryActive(item);
            return (
              <button
                key={item.id}
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

  const renderPerformanceDock = () => {
    const dockLeft = secondaryItems.length > 0 ? '21rem' : '7rem';
    const primaryStat = performanceStats[0];
    const PrimaryIcon = primaryStat.icon;

    return (
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 hidden md:block"
        style={{ left: dockLeft }}
      >
        <div className="mx-auto flex max-w-3xl justify-center pointer-events-auto">
          <div className="flex max-w-full items-center gap-1.5 rounded-full border border-white/70 bg-white/85 p-1.5 shadow-xl shadow-purple-900/10 backdrop-blur-xl">
            {performanceDockCollapsed ? (
              <button
                type="button"
                onClick={() => setPerformanceDockCollapsed(false)}
                className={`flex items-center gap-2 rounded-full bg-gradient-to-br ${primaryStat.color} px-3 py-2 text-white shadow-sm transition-transform hover:scale-[1.02]`}
                aria-label="Expand performance dock"
                title="Expand performance dock"
              >
                <PrimaryIcon className="h-4 w-4" />
                <span className="text-sm font-bold">{primaryStat.value}</span>
                <span className="text-xs font-medium opacity-90">Performance</span>
                <ChevronUp className="h-3.5 w-3.5 opacity-90" />
              </button>
            ) : (
              <>
                <div className="flex min-w-0 items-center gap-1.5">
                  {performanceStats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                      <div
                        key={stat.label}
                        className={`flex min-w-[9rem] items-center gap-2 rounded-full bg-gradient-to-br ${stat.color} px-3 py-2 text-white shadow-sm`}
                        title={`${stat.label}: ${stat.value}`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="text-base font-bold leading-none">{stat.value}</span>
                        <span className="min-w-0 truncate text-xs font-medium opacity-90">{stat.label}</span>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setPerformanceDockCollapsed(true)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-purple-700"
                  aria-label="Collapse performance dock"
                  title="Collapse performance dock"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const shellClassName = secondaryItems.length > 0
    ? 'min-h-screen bg-gray-50 md:pl-80'
    : 'min-h-screen bg-gray-50 md:pl-24';
  const appShellClassName = ministryWorkspaceActive ? 'min-h-screen bg-gray-50' : shellClassName;

  return (
    <div className={appShellClassName}>
      {!ministryWorkspaceActive && <OnboardingTips onNavigate={setActiveTab} />}

      {!ministryWorkspaceActive && !isViewerActive && (
        <>
          <aside
            className="hidden md:flex fixed inset-y-0 left-0 z-[60] flex-col border-r border-gray-200 bg-white shadow-sm"
            style={{ width: '6rem' }}
          >
            <div className="flex h-20 items-center justify-center border-b border-gray-100">
              <button
                onClick={() => setActiveTab('home')}
                aria-label="Go to Home"
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-600 font-serif text-xl font-bold text-white shadow-sm"
              >
                R
              </button>
            </div>
            {renderPrimaryNavigation('flex flex-1 flex-col gap-2 overflow-y-auto px-2 py-4')}
          </aside>
          {renderSecondaryNavigation()}
          {renderPerformanceDock()}
        </>
      )}

      {!ministryWorkspaceActive && !isViewerActive && <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl md:text-2xl font-serif font-bold text-purple-700 flex-shrink-0 md:hidden">Rekindle</h1>
          <div className="hidden md:block" />
          <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchOpen(true)}
              title={t('common', 'search', 'Search')}
              aria-label={t('common', 'search', 'Search')}
              className="rounded-xl bg-gradient-to-br from-slate-500 to-gray-600 text-white shadow-sm transition-transform hover:scale-105 hover:text-white"
            >
              <Search className="h-4 w-4 md:h-5 md:w-5" />
            </Button>

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
              <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
            )}

            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setActiveTab('admin')}
                className="rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 text-white shadow-sm transition-transform hover:scale-105 hover:text-white"
                aria-label={t('navigation', 'admin', 'Admin Dashboard')}
              >
                <Shield className="h-4 w-4 md:h-5 md:w-5" />
              </Button>
            )}

            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setActiveTab('admin-health')}
                className="rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm transition-transform hover:scale-105 hover:text-white"
                aria-label={t('settings', 'general', 'System Health')}
              >
                <List className="h-4 w-4 md:h-5 md:w-5" />
              </Button>
            )}

            <>
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowNotifications((v) => !v)}
                  aria-label={t('profile', 'notifications', 'Notifications')}
                  className="rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm transition-transform hover:scale-105 hover:text-white"
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

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setActiveTab('music')}
                aria-label={t('navigation', 'library', 'Music Library')}
                className="rounded-xl bg-gradient-to-br from-fuchsia-500 to-pink-600 text-white shadow-sm transition-transform hover:scale-105 hover:text-white"
              >
                <Music className="h-4 w-4 md:h-5 md:w-5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setActiveTab('live-channels')}
                aria-label={t('navigation', 'liveChannels', 'Live Channels')}
                className="rounded-xl bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-sm transition-transform hover:scale-105 hover:text-white"
              >
                <Radio className="h-4 w-4 md:h-5 md:w-5" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Account menu"
                    className="rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm transition-transform hover:scale-105 hover:text-white"
                  >
                    <User className="h-4 w-4 md:h-5 md:w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Account</DropdownMenuLabel>
                  {ACCOUNT_ITEMS.map((item) => {
                    const ItemIcon = TAB_ICONS[item] ?? List;
                    return (
                      <DropdownMenuItem key={item} onClick={() => setActiveTab(item)} className="gap-2">
                        <ItemIcon className="h-4 w-4" />
                        {getTabLabel(item)}
                      </DropdownMenuItem>
                    );
                  })}
                  {isAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setActiveTab('admin')} className="gap-2">
                        <Shield className="h-4 w-4" /> Admin
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setActiveTab('admin-health')} className="gap-2">
                        <Activity className="h-4 w-4" /> System Health
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                disabled={signingOut}
                className="rounded-xl bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-sm transition-transform hover:scale-105 hover:text-white"
                aria-label={t('auth', 'logout', 'Sign Out')}
              >
                {signingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-5 w-5" />
                )}
              </Button>
            </>
          </div>
        </div>
        {/* Mobile primary/secondary nav is rendered inside <main> (above the
            page content) rather than fixed in this header — see renderMobileNav. */}
      </header>}

      <main className={ministryWorkspaceActive ? 'w-full' : 'mx-auto w-full max-w-7xl px-4 pb-12 pt-4 md:pb-24 md:pt-6'}>
        {!ministryWorkspaceActive && <section
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

        {/* Mobile navigation — scrolls with the page and sits above both the
            stats and the page content (e.g. the Devotional Source widget)
            instead of being fixed. */}
        {!ministryWorkspaceActive && !isViewerActive && (
          <div className="md:hidden mb-4 rounded-2xl border border-gray-100 bg-white px-3 py-2 shadow-sm">
            {renderPrimaryNavigation('flex gap-2 overflow-x-auto pb-1')}
            {activeGroup && secondaryItems.length > 0 && (
              <nav className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label={`${groupLabel(activeGroup)} navigation`}>
                {secondaryItems.map((item) => {
                  const Icon = item.icon;
                  const active = isSecondaryActive(item);
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSecondaryClick(item)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                        active
                          ? 'bg-purple-50 text-purple-700'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-purple-700'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {itemLabel(item)}
                    </button>
                  );
                })}
              </nav>
            )}
          </div>
        )}

        {/* Home stat capsules — on mobile these now sit just below the nav menu. */}
        {!ministryWorkspaceActive && activeTab === 'home' && (
          <div className="relative z-10 mb-4 px-0 md:hidden">
            {renderStatCapsules('grid grid-cols-2 gap-2')}
          </div>
        )}
        <div className="min-w-0 max-w-full overflow-x-hidden">
            <ErrorBoundary>
          {activeTab === 'home' && (
            <div className="space-y-6">
              <ReminderSetupTip
                onSetup={() => {
                  setActiveTab('profile');
                  // Let ProfileSettings mount, then open the Daily Reminders section.
                  setTimeout(() => window.dispatchEvent(
                    new CustomEvent('openProfileSection', { detail: { section: 'reminders' } })), 100);
                }}
              />
              <StreakWidget />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <DevotionalSourceSettings
                    onSaved={(src, minId, streamId) => {
                      setDevotionalSource(src);
                      setDevotionalMinistryId(minId);
                      setDevotionalStreamId(streamId ?? null);
                    }}
                  />
                  <DailyDevotionalWidget
                    onStartDevotional={handleStartDevotional}
                    source={devotionalSource}
                    ministryId={devotionalMinistryId}
                    streamId={devotionalStreamId}
                  />
                </div>
                <div id="daily-declaration">
                  <DeclarationCard showDaily />
                </div>
                <AffirmationCard showDaily />
              </div>
              <InstrumentalPlayer />
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

          {activeTab === 'prayer-library' && <PrayerLibrary />}

          {activeTab === 'journal' && <PrayerJournal />}

          {activeTab === 'revelations' && <CommunityRevelations />}
          {activeTab === 'community-feed' && <CommunityActivityFeed />}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {counsellors.map((c) => (
                    <CounsellorCard
                      key={c.id}
                      counsellor={c}
                      onConnect={() => toast({ 
                        title: messageSentTitle, 
                        description: `${t('common', 'sent', 'Connection request sent to')} ${c.name}` 
                      })}
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


          {activeTab === 'billing' && (
            <>
              <PaymentHistory onNavigateToSubscription={() => setActiveTab('sponsor')} />
            </>
          )}

          {activeTab === 'sponsor' && <SponsorshipSystem />}

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

        </ErrorBoundary>
        </div>
      </main>

      <ScrollToTopButton />

      {!ministryWorkspaceActive && <AppFooter onNavigate={setActiveTab} />}

      {/* Pastoral Assistant (floating, draggable) */}
      {!ministryWorkspaceActive && !isViewerActive && <button
        onPointerDown={onAssistantPointerDown}
        onPointerMove={onAssistantPointerMove}
        onPointerUp={onAssistantPointerUp}
        onClick={() => { if (!assistantDrag.current.moved) setActiveTab('ai'); }}
        aria-label="Pastoral Assistant"
        title="Pastoral Assistant"
        style={assistantPos ? { left: assistantPos.x, top: assistantPos.y, touchAction: 'none' } : { touchAction: 'none' }}
        className={`fixed ${assistantPos ? '' : 'bottom-20 right-4'} z-50 h-14 w-14 rounded-full shadow-lg flex items-center justify-center transition-colors cursor-grab active:cursor-grabbing select-none ${
          activeTab === 'ai' ? 'bg-purple-700 text-white' : 'bg-purple-600 text-white hover:bg-purple-700'
        }`}
      >
        <Bot className="h-6 w-6" />
      </button>}

      {/* Back-to-top is rendered globally by <BackToTop /> in App.tsx */}

      {/* Offline Indicator */}
      {!ministryWorkspaceActive && !isViewerActive && <div className="fixed bottom-4 right-4 z-50 md:bottom-20">
        <OfflineIndicator />
      </div>}

      {/* Floating performance stats (mobile, inner pages). On Home the stat
          tiles render inline, so this is only offered on the other tabs to
          keep the page content area clear. */}
      {!ministryWorkspaceActive && activeTab !== 'home' && !isViewerActive && (
        <div
          ref={statsContainerRef}
          className={`fixed z-50 flex flex-col items-center gap-2 md:hidden ${
            statsPos ? '' : 'bottom-4 left-1/2 -translate-x-1/2'
          }`}
          style={statsPos ? { left: statsPos.x, top: statsPos.y } : undefined}
        >
          {showStatsPanel && (
            <div className="w-[78vw] max-w-xs rounded-2xl border border-gray-100 bg-white p-3 shadow-xl">
              {renderStatCapsules('grid grid-cols-1 gap-2')}
            </div>
          )}
          <button
            type="button"
            onPointerDown={onStatsPointerDown}
            onPointerMove={onStatsPointerMove}
            onPointerUp={onStatsPointerUp}
            onClick={() => { if (!statsDrag.current.moved) setShowStatsPanel((v) => !v); }}
            aria-label="Your stats"
            aria-expanded={showStatsPanel}
            style={{ touchAction: 'none' }}
            className="flex cursor-grab items-center gap-2 rounded-full bg-purple-600 px-4 py-2.5 text-white shadow-lg transition-colors hover:bg-purple-700 active:cursor-grabbing select-none"
          >
            <BarChart3 className="h-5 w-5" />
            <span className="text-sm font-semibold">Stats</span>
          </button>
        </div>
      )}

      {/* Global Search Modal */}
      {!ministryWorkspaceActive && <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />}

      {/* Modals */}
      <PrayerPointModal
        prayerPoint={selectedPrayer}
        onClose={() => setSelectedPrayer(null)}
        onPray={() => {
          setSelectedPrayer(null);
        }}
      />

      <CounsellorBookingModal
        counsellor={selectedCounsellor}
        open={showBookingModal}
        onClose={() => setShowBookingModal(false)}
        onBooked={() => {
          toast({
            title: bookingConfirmedTitle,
            description: bookingConfirmedDesc
          });
        }}
      />
    </div>
  );
};

export default AppLayout;
