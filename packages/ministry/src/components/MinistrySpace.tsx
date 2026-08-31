import React, { useState, useEffect, useCallback } from 'react';
import { useViewHistory } from '@rekindle/features/hooks/useViewHistory';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Badge } from '@rekindle/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@rekindle/ui/dialog';
import { Label } from '@rekindle/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { supabase } from '@rekindle/supabase';
import { getLocalDateString, endOfLocalDayISO } from '@rekindle/ui/utils';
import { getMinistryStreamId } from '@rekindle/features/devotionalStreams';
import { consumeDeepLink } from '@rekindle/features/deepLink';
import { toast } from '@rekindle/ui/use-toast';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { useUserEntitlements } from '@rekindle/auth/useUserEntitlements';
import { getMinistryEntitlements, FREE_ENTITLEMENTS } from '@rekindle/auth/ministryEntitlements';
import { VideoMessagePlayer } from '@rekindle/live/components/VideoMessagePlayer';
import {
  ArrowLeft, Home, BookOpen, Heart, Calendar, MessageSquare,
  Megaphone, Gift, Video, Users, Settings, Crown, Shield,
  Plus, Loader2, Clock, Pin, Send, Building2, ChevronRight,
  Lock, Star, Edit, Trash2, Eye, LayoutDashboard, Play, Radio,
  HelpCircle, ThumbsUp, CheckCircle2, ChevronDown, ChevronUp, Book, Sparkles, Menu, Share2, ScrollText, Music, Trophy, Search
} from 'lucide-react';

// Member-facing ministry navigation. Shared by the icon tab row and the
// mobile hamburger menu so both stay in sync.
const MINISTRY_NAV = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'devotionals', label: 'Devotionals', icon: BookOpen },
  { id: 'prayer', label: 'Prayer Library', icon: Heart },
  { id: 'live', label: 'Live', icon: Radio },
  { id: 'requests', label: 'Prayer Requests', icon: MessageSquare },
  { id: 'testimonies', label: 'Testimonies', icon: Star },
  { id: 'community', label: 'Community', icon: Users },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
  { id: 'donations', label: 'Donations', icon: Gift },
  { id: 'meetings', label: 'Interactive Meetings', icon: Video },
] as const;
import { MinistryManagement } from './MinistryManagement';
import { MinistryAnnouncementsManager } from './MinistryAnnouncementsManager';
import { MinistryRulesManager } from './MinistryRulesManager';
import { AcceptRulesModal } from './AcceptRulesModal';
import MinistryBroadcast from './MinistryBroadcast';
import { DevotionalModule } from '@rekindle/features/components/DevotionalModule';
import { MinistryInteractiveMeetings } from './MinistryInteractiveMeetings';
import { MLiveChannel } from './MLiveChannel';
import { MinistryDonationForm } from './MinistryDonationForm';
import { MinistryWhatsAppOptIn } from '@rekindle/features/components/WhatsAppOptIn';
import MinistryContentManager from './MinistryContentManager';
import { DiscoverSmallGroups } from './DiscoverSmallGroups';
import { MySmallGroups } from './MySmallGroups';
import { getFeatureSource, fetchFeatureContent } from '@rekindle/features/contentSource';
import { canShowPurchaseUI } from '@rekindle/features/platform';
import { TakeDeclarationContext } from '@rekindle/features/takeDeclarationContext';
import { useNavigate } from 'react-router-dom';
import { StreakWidget } from '@rekindle/features/components/StreakWidget';
import { ReminderSetupTip } from '@rekindle/features/components/ReminderSetupTip';
import { recordDailyActivity } from '@rekindle/features/streak';
import { InstrumentalPlayer } from '@rekindle/features/components/InstrumentalPlayer';
import { BibleReadingPlan } from '@rekindle/features/components/BibleReadingPlan';
import { ScriptureMemory } from '@rekindle/features/components/ScriptureMemory';
import { BookSummaries } from '@rekindle/features/components/BookSummaries';
import { DevotionalLibrary } from '@rekindle/features/components/DevotionalLibrary';
import { MinistryDevotionalSourcePicker } from './MinistryDevotionalSourcePicker';
import { PrayerLibrary } from '@rekindle/features/components/PrayerLibrary';
import { PrayerJournal } from '@rekindle/features/components/PrayerJournal';
import { CommunityPrayerWall } from '@rekindle/features/components/CommunityPrayerWall';
import { CommunityActivityFeed } from '@rekindle/features/components/CommunityActivityFeed';
import { EnhancedPrayerChallenges } from '@rekindle/features/components/EnhancedPrayerChallenges';
import { DeclarationCard } from '@rekindle/features/components/DeclarationCard';
import { AffirmationCard } from '@rekindle/features/components/AffirmationCard';
import { useUserAnalytics } from '@rekindle/features/useUserAnalytics';

interface Ministry {
  id: string;
  name: string;
  description: string;
  category: string;
  location: string;
  banner_url: string;
  logo_url: string;
  welcome_message: string;
  member_count: number;
  invite_code: string;
  is_public: boolean;
  join_method: string;
  theme_color: string;
  owner_id: string;
  leader_id: string;
  is_active: boolean;
  settings: any;
  approval_status?: string;
}


interface MembershipInfo {
  ministry_id: string;
  role: string;
  subscription_level: number;
  is_leader: boolean;
  joined_at: string;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  author_id: string;
}

interface MinistryEvent {
  id: string;
  title: string;
  description: string;
  event_type: string;
  start_time: string;
  end_time: string;
  is_live: boolean;
  is_interactive: boolean;
  subscription_required: number;
}

interface PrayerRequest {
  id: string;
  title: string;
  content: string;
  is_anonymous: boolean;
  prayer_count: number;
  status: string;
  created_at: string;
  user_id: string;
}

interface Testimony {
  id: string;
  title: string;
  content: string;
  is_approved: boolean;
  created_at: string;
  user_id: string;
}

interface MinistryDevotional {
  id: string;
  title: string;
  content: string;
  scripture_reference: string;
  scripture_text?: string;
  reflection_questions?: any;
  prayer_focus?: string;
  featured_image?: string;
  audio_url?: string;
  scheduled_date?: string | null;
  is_published?: boolean;
  created_at: string;
}

interface MinistryPrayer {
  id: string;
  title: string;
  content: string;
  category: string;
  scripture_reference?: string;
  scripture_text?: string;
  audio_url?: string;
  language: string;
  tags: string[];
  is_seasonal: boolean;
  season?: string;
  campaign_id?: string;
  visibility: string;
  view_count: number;
  prayer_count: number;
  is_active: boolean;
  created_at: string;
}

interface PrayerCampaign {
  id: string;
  title: string;
  description?: string;
  theme?: string;
  start_date?: string;
  end_date?: string;
  banner_image?: string;
  prayer_count: number;
  is_active: boolean;
}

interface MinistryVideoMessage {
  id: string;
  title: string;
  description?: string | null;
  speaker_name?: string | null;
  category?: string | null;
  is_pinned: boolean;
  display_order?: number | null;
  published_at?: string | null;
  playback_url?: string | null;
  thumbnail_url?: string | null;
  captions_url?: string | null;
  duration_seconds?: number | null;
  created_at: string;
}

interface MinistrySpaceProps {
  ministry: Ministry;
  membership?: MembershipInfo;
  onExit: () => void;
}

const MinistrySpace: React.FC<MinistrySpaceProps> = ({ ministry, membership, onExit }) => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const entitlements = useUserEntitlements();
  
  // Main ministry tab. Back steps through tabs; the hook's state-merge composes
  // with nested children (MLiveChannel, GiftAid, etc.) and the parent hub.
  const [activeTab, setActiveTab] = useViewHistory<string>('ministry-space-tab', 'home');
  const [communitySubTab, setCommunitySubTab] = useState<'feed' | 'revelations' | 'qa' | 'challenges'>('feed');
  // Two-level nav: The Word / Prayers sub-views are driven by the secondary nav.
  const [wordSubTab, setWordSubTab] = useState<'devotionals' | 'reading' | 'scripture' | 'books'>('devotionals');
  const [prayerSubTab, setPrayerSubTab] = useState<'ministry' | 'library' | 'journal' | 'wall'>('ministry');
  const navigate = useNavigate();
  // Home stat capsules: per-user completions (shared analytics) + ministry kiosk entries.
  const { analytics } = useUserAnalytics();
  const [kioskThisMonth, setKioskThisMonth] = useState<number>(0);

  // ── Ministry Community: Revelations ──
  const [mRevLoading, setMRevLoading] = useState(true);
  const [mRevelations, setMRevelations] = useState<any[]>([]);
  const [showMRevForm, setShowMRevForm] = useState(false);
  const [mRevTitle, setMRevTitle] = useState('');
  const [mRevContent, setMRevContent] = useState('');
  const [mRevExpandedComments, setMRevExpandedComments] = useState<string | null>(null);

  // ── Ministry Community: Q&A ──
  const [mQaLoading, setMQaLoading] = useState(true);
  const [mQuestions, setMQuestions] = useState<any[]>([]);
  const [showMQForm, setShowMQForm] = useState(false);
  const [mQTitle, setMQTitle] = useState('');
  const [mQContent, setMQContent] = useState('');
  const [mQScripture, setMQScripture] = useState('');
  const [mQaFilter, setMQaFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [mExpandedQ, setMExpandedQ] = useState<string | null>(null);
  const [mAnswerDrafts, setMAnswerDrafts] = useState<Record<string, string>>({});
  const [showManagement, setShowManagement] = useState(false);
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<MinistryEvent[]>([]);
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>([]);
  const [testimonies, setTestimonies] = useState<Testimony[]>([]);
  const [devotionals, setDevotionals] = useState<MinistryDevotional[]>([]);
  const [videoMessages, setVideoMessages] = useState<MinistryVideoMessage[]>([]);
  // Ministry Rules & Guidelines — rulesItems is the currently-published
  // version's read-only content (Rules tab + the blocking modal both use
  // it). needsRulesAcceptance drives the blocking AcceptRulesModal mount
  // below: true when the ministry requires acceptance, has published at
  // least one version, and this member hasn't accepted that version yet.
  const [rulesItems, setRulesItems] = useState<{ id: string; title: string; body: string }[]>([]);
  const [needsRulesAcceptance, setNeedsRulesAcceptance] = useState(false);
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [activeVideoMessage, setActiveVideoMessage] = useState<MinistryVideoMessage | null>(null);
  const [declarations, setDeclarations] = useState<any[]>([]);
  const [affirmations, setAffirmations] = useState<any[]>([]);
  const [prayers, setPrayers] = useState<MinistryPrayer[]>([]);
  const [prayerCampaigns, setPrayerCampaigns] = useState<PrayerCampaign[]>([]);
  const [selectedPrayer, setSelectedPrayer] = useState<MinistryPrayer | null>(null);
  const [showPrayerReader, setShowPrayerReader] = useState(false);
  const [prayerSearchTerm, setPrayerSearchTerm] = useState('');
  const [prayerCategoryFilter, setPrayerCategoryFilter] = useState('all');
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [showPrayerModal, setShowPrayerModal] = useState(false);
  const [showTestimonyModal, setShowTestimonyModal] = useState(false);
  const [showDonationForm, setShowDonationForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // DevotionalModule states
  const [selectedDevotional, setSelectedDevotional] = useState<any>(null);
  const [showDevotionalModule, setShowDevotionalModule] = useState(false);

  const [announcementForm, setAnnouncementForm] = useState({ title: '', content: '', is_pinned: false });
  const [prayerForm, setPrayerForm] = useState({ title: '', content: '', is_anonymous: false });
  const [testimonyForm, setTestimonyForm] = useState({ title: '', content: '' });

  const isLeader = membership?.is_leader || ministry.owner_id === user?.id || ministry.leader_id === user?.id;
  const isAdmin = membership?.role === 'admin' || isLeader;
  const isPremiumMember = (membership?.subscription_level || 1) >= 2;
  const canManageMinistry = isLeader || isAdmin;
  
  // Subscription-based permissions — resolved from the MINISTRY's own
  // ministry_subscriptions row (real billing: Stripe/Paystack checkout ->
  // ministry-billing-webhook), not a leader's/owner's personal
  // user_profiles.subscription_tier. That column uses tier-slug literals
  // ('ministry', 'ministry_plus', ...) that no real live path writes
  // anymore (the matching subscription_tiers catalog rows were deactivated
  // in migration 0271) — this was silently dead for every real Ministry
  // Partner subscriber. getMinistryEntitlements is the same resolver
  // BillingSettings.tsx/CustomDomainSettings.tsx already use correctly.
  const [ministryEntitlements, setMinistryEntitlements] = useState(FREE_ENTITLEMENTS);
  useEffect(() => {
    let cancelled = false;
    getMinistryEntitlements(ministry.id).then((e) => { if (!cancelled) setMinistryEntitlements(e); });
    return () => { cancelled = true; };
  }, [ministry.id]);

  const canManageTeam = ministryEntitlements.caps.manageTeam;
  const canUseMinistryBranding = ministryEntitlements.caps.branding;
  const canUseWhiteLabel = ministryEntitlements.caps.whiteLabel;

  // Effective access used to gate the Manage Ministry button + management
  // features: requires an ACTIVE paid plan on the ministry itself — not
  // just any signed-in leader/admin (explicit product decision, replacing
  // the old owner-tier lookup this block used to do).
  const hasMinistryAccess = ministryEntitlements.status === 'active';

  // Hidden in native builds: no purchase/upgrade surfaces there (Phase 0 — Apple 3.1.1).
  const showMinistryFeatureUpgradePrompt = isLeader && !hasMinistryAccess && canShowPurchaseUI();

  const loadMinistryData = useCallback(async () => {
    setLoading(true);
    try {
      // Scheduled ministry devotionals soft-expire from the member feed 5 days past
      // their scheduled date (rows are NOT deleted — reversible). Null-dated
      // (always-on) devotionals are exempt.
      const expiryFloor = new Date();
      expiryFloor.setHours(0, 0, 0, 0);
      expiryFloor.setDate(expiryFloor.getDate() - 5);
      const expiryFloorISO = expiryFloor.toISOString();
      const [announcementsRes, eventsRes, prayersRes, testimoniesRes, devotionalsRes, prayerLibraryRes, campaignsRes, videoMessagesRes] = await Promise.all([
        supabase.from('ministry_announcements').select('*').eq('ministry_id', ministry.id)
          .not('status', 'in', '("draft","scheduled","expired")')
          .order('is_pinned', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('ministry_events').select('*').eq('ministry_id', ministry.id).order('start_time', { ascending: true }),
        supabase.from('ministry_prayer_requests').select('*').eq('ministry_id', ministry.id).eq('status', 'active').order('created_at', { ascending: false }),
        supabase.from('ministry_testimonies').select('*').eq('ministry_id', ministry.id).eq('is_approved', true).order('created_at', { ascending: false }),
        supabase.from('ministry_devotionals')
          .select('*')
          .eq('ministry_id', ministry.id)
          .eq('is_published', true)
          // Local end-of-day upper bound (today's daytime-stamped devotional is
          // included) + 5-day lower bound (soft-expiry). Null-dated devotionals show
          // regardless. Matches the home widget.
          .or(`scheduled_date.is.null,and(scheduled_date.gte.${expiryFloorISO},scheduled_date.lte.${endOfLocalDayISO()})`)
          .order('scheduled_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(10),
        supabase.from('ministry_prayer_library').select('*').eq('ministry_id', ministry.id).eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('prayer_campaigns').select('*').eq('ministry_id', ministry.id).eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('ministry_video_messages').select('*').eq('ministry_id', ministry.id)
          .in('status', ['published', 'archived'])
          .order('is_pinned', { ascending: false })
          .order('display_order', { ascending: true, nullsFirst: false })
          .order('published_at', { ascending: false })
      ]);

      setAnnouncements(announcementsRes.data || []);
      setEvents(eventsRes.data || []);
      setPrayerRequests(prayersRes.data || []);
      setTestimonies(testimoniesRes.data || []);
      setVideoMessages(videoMessagesRes.data || []);

      // Daily-devotional source (0149): if this ministry pointed its homepage at an
      // admin stream, show that stream's devotionals INSTEAD of its own. The ministry's
      // own rows (devotionalsRes) are untouched in the DB — switching back restores them.
      const chosenStreamId = await getMinistryStreamId(ministry.id);
      if (chosenStreamId) {
        const { data: streamDevs } = await supabase
          .from('devotionals')
          .select('*')
          .eq('stream_id', chosenStreamId)
          .eq('is_published', true)
          .or(`schedule_date.is.null,schedule_date.lte.${endOfLocalDayISO()}`)
          .order('schedule_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(10);
        // Map the platform devotional shape onto the ministry devotional shape the
        // homepage renderer expects.
        setDevotionals((streamDevs || []).map((d: any) => ({
          id: d.id,
          title: d.title,
          content: d.message || d.content || '',
          scripture_reference: d.scripture_reference || d.scripture || '',
          scripture_text: d.scripture_text || '',
          reflection_questions: d.reflection_questions,
          prayer_focus: d.prayer || d.prayer_focus || '',
          featured_image: d.image_url || d.cover_image_url || '',
          audio_url: d.audio_url || '',
          scheduled_date: d.schedule_date ?? null,
          is_published: d.is_published,
          created_at: d.created_at,
        })));
      } else {
        setDevotionals(devotionalsRes.data || []);
      }
      setPrayers(prayerLibraryRes.data || []);
      setPrayerCampaigns(campaignsRes.data || []);

      // Declarations & affirmations resolve by their PER-FEATURE source (ReKindle /
      // our own / both), read from ministry_groups.settings.content_sources.
      try {
        const select = 'id, text, title, scripture_reference, is_daily, is_published, ministry_id, created_at';
        const [decs, affs] = await Promise.all([
          fetchFeatureContent('declarations', { ministryId: ministry.id, source: getFeatureSource(ministry.settings, 'declarations'), select }),
          fetchFeatureContent('affirmations', { ministryId: ministry.id, source: getFeatureSource(ministry.settings, 'affirmations'), select }),
        ]);
        setDeclarations(decs.filter((d: any) => d.is_published !== false));
        setAffirmations(affs.filter((a: any) => a.is_published !== false));
      } catch (e) {
        console.error('Error loading declarations/affirmations:', e);
      }

      // This member's OWN kiosk check-ins this month (ministry_attendance via their
      // ministry_member_profile). Shown to every member.
      try {
        const monthStart = new Date();
        monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
        const { data: myProfiles } = await supabase
          .from('ministry_member_profiles')
          .select('id')
          .eq('ministry_id', ministry.id)
          .eq('user_id', user?.id ?? '');
        const ids = (myProfiles ?? []).map((p: any) => p.id);
        if (ids.length) {
          const { count } = await supabase
            .from('ministry_attendance')
            .select('id', { count: 'exact', head: true })
            .in('profile_id', ids)
            .eq('source', 'kiosk')
            .gte('attended_on', monthStart.toISOString().slice(0, 10));
          setKioskThisMonth(count ?? 0);
        } else {
          setKioskThisMonth(0);
        }
      } catch { setKioskThisMonth(0); }
    } catch (err) {
      console.error('Error loading ministry data:', err);
    } finally {
      setLoading(false);
    }
  }, [ministry.id]);

  useEffect(() => {
    loadMinistryData();
  }, [loadMinistryData]);

  // Ministry Rules & Guidelines — independent of the big loadMinistryData
  // batch above since it also drives the blocking gate (needs to resolve
  // before the member does anything, not just when they open the Rules
  // tab). Applies to everyone, admins included — an admin is still a
  // member who should acknowledge the rules they (or another admin)
  // published; they just also get the full editor via the Rules tab/
  // Manage Ministry shell. Re-runs whenever the published version changes
  // via MinistryRulesManager's Publish (ministry.settings isn't touched by
  // that, so this deliberately keys off ministry.id/user.id and does its
  // own fresh fetch on mount rather than trying to invalidate reactively).
  useEffect(() => {
    if (!ministry?.id || !user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: cfg } = await supabase
          .from('ministry_rules')
          .select('require_acceptance, current_version')
          .eq('ministry_id', ministry.id)
          .maybeSingle();
        if (cancelled) return;
        if (!cfg || cfg.current_version < 1) { setRulesItems([]); return; }

        const { data: items } = await supabase
          .from('ministry_rule_items')
          .select('id, title, body')
          .eq('ministry_id', ministry.id)
          .eq('version', cfg.current_version)
          .order('sort_order');
        if (cancelled) return;
        setRulesItems(items || []);

        if (!cfg.require_acceptance) { setNeedsRulesAcceptance(false); return; }
        const { data: acceptance } = await supabase
          .from('ministry_rule_acceptances')
          .select('accepted_version')
          .eq('ministry_id', ministry.id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (cancelled) return;
        setNeedsRulesAcceptance(!acceptance || acceptance.accepted_version < cfg.current_version);
      } catch (err) {
        console.error('[MinistrySpace] rules load failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [ministry?.id, user?.id]);

  // Open a Pastor's Video Message arriving from a shared/notification link
  // (/ministry-videos/:id). MinistriesHub already resolved which ministry this
  // is before mounting us, so here we just need the specific video — fetched
  // directly rather than waiting on the homepage list, since it may be an
  // older/archived one not among the "previous messages" shown there.
  useEffect(() => {
    const dlVideo = consumeDeepLink('ministry-videos');
    if (dlVideo?.id) {
      (async () => {
        try {
          const { data } = await supabase
            .from('ministry_video_messages')
            .select('*')
            .eq('id', dlVideo.id)
            .eq('ministry_id', ministry.id)
            .maybeSingle();
          if (data?.playback_url) {
            setActiveVideoMessage(data);
            setShowVideoPlayer(true);
          }
        } catch (err) {
          console.error('Error opening shared video message:', err);
        }
      })();
    }

    const dlDev = consumeDeepLink('ministry-devotional');
    if (dlDev?.id) {
      setActiveTab('devotionals');
    }

    const dlPrayer = consumeDeepLink('ministry-prayer');
    if (dlPrayer?.id) {
      setActiveTab('requests');
    }
  }, [ministry.id]);

  // Load community data when community tab is first activated
  useEffect(() => {
    if (activeTab === 'community' && ministry?.id) {
      loadMinistryCommunity();
    }
  }, [activeTab, ministry?.id]);

  // Refetch video messages whenever Home becomes active — publishing happens in
  // a separate admin view (MinistryManagement) with no shared live state, so
  // without this the homepage widget would keep showing whatever was loaded on
  // mount until a full page refresh.
  useEffect(() => {
    if (activeTab !== 'home' || !ministry?.id) return;
    (async () => {
      const { data, error } = await supabase
        .from('ministry_video_messages')
        .select('*')
        .eq('ministry_id', ministry.id)
        .in('status', ['published', 'archived'])
        .order('is_pinned', { ascending: false })
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('published_at', { ascending: false });
      if (error) { console.error('Error refreshing video messages:', error); return; }
      setVideoMessages(data || []);
    })();
  }, [activeTab, ministry?.id]);

  const handleCreateAnnouncement = async () => {
    if (!announcementForm.title.trim()) {
      toast({ title: t('ministrySpace', 'error', 'Error'), description: t('ministrySpace', 'titleRequired', 'Title is required'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await supabase.from('ministry_announcements').insert({
        ministry_id: ministry.id,
        title: announcementForm.title.trim(),
        content: announcementForm.content.trim(),
        is_pinned: announcementForm.is_pinned,
        author_id: user?.id,
        // Set full schema fields so this quick-compose path writes records
        // that are visible and counted in MinistryAnnouncementsManager.
        status: 'published',
        category: 'General',
        priority: 'normal',
        target_audience: 'all',
      });

      toast({ title: t('ministrySpace', 'success', 'Success'), description: t('ministrySpace', 'announcementPosted', 'Announcement posted!') });
      setShowAnnouncementModal(false);
      setAnnouncementForm({ title: '', content: '', is_pinned: false });
      loadMinistryData();
    } catch (err: any) {
      toast({ title: t('ministrySpace', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePrayerRequest = async () => {
    if (!prayerForm.title.trim()) {
      toast({ title: t('ministrySpace', 'error', 'Error'), description: t('ministrySpace', 'titleRequired', 'Title is required'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await supabase.from('ministry_prayer_requests').insert({
        ministry_id: ministry.id,
        title: prayerForm.title.trim(),
        content: prayerForm.content.trim(),
        is_anonymous: prayerForm.is_anonymous,
        user_id: user?.id
      });

      toast({ title: t('ministrySpace', 'success', 'Success'), description: t('ministrySpace', 'prayerRequestSubmitted', 'Prayer request submitted!') });
      setShowPrayerModal(false);
      setPrayerForm({ title: '', content: '', is_anonymous: false });
      loadMinistryData();
    } catch (err: any) {
      toast({ title: t('ministrySpace', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handlePrayForRequest = async (requestId: string, currentCount: number) => {
    try {
      await supabase
        .from('ministry_prayer_requests')
        .update({ prayer_count: currentCount + 1 })
        .eq('id', requestId);

      setPrayerRequests(prev => prev.map(p => 
        p.id === requestId ? { ...p, prayer_count: currentCount + 1 } : p
      ));

      toast({ title: t('ministrySpace', 'amen', 'Amen!'), description: t('ministrySpace', 'prayerRecorded', 'Your prayer has been recorded') });
    } catch (err) {
      console.error('Error updating prayer count:', err);
    }
  };

  const handleCreateTestimony = async () => {
    if (!testimonyForm.title.trim() || !testimonyForm.content.trim()) {
      toast({ title: t('ministrySpace', 'error', 'Error'), description: t('ministrySpace', 'titleContentRequired', 'Title and content are required'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await supabase.from('ministry_testimonies').insert({
        ministry_id: ministry.id,
        title: testimonyForm.title.trim(),
        content: testimonyForm.content.trim(),
        user_id: user?.id,
        is_approved: isAdmin // Auto-approve if admin
      });

      toast({
        title: t('ministrySpace', 'success', 'Success'),
        description: isAdmin ? t('ministrySpace', 'testimonyPosted', 'Testimony posted!') : t('ministrySpace', 'testimonySubmittedApproval', 'Testimony submitted for approval')
      });
      setShowTestimonyModal(false);
      setTestimonyForm({ title: '', content: '' });
      loadMinistryData();
    } catch (err: any) {
      toast({ title: t('ministrySpace', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Handle starting a devotional
  // Share a ministry prayer via its public free-taste preview link.
  const shareMinistryPrayer = async (prayer: MinistryPrayer) => {
    const url = `${window.location.origin}/ministry-prayer/${prayer.id}`;
    const title = prayer.title || t('ministrySpace', 'prayer', 'Prayer');
    const text = `🙏 ${title} — ${t('ministrySpace', 'prayAlongOnRekindle', 'pray along on Rekindle')}`;
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try { await (navigator as any).share({ title, text, url }); return; } catch { return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t('ministrySpace', 'linkCopied', 'Link copied!'), description: t('ministrySpace', 'shareInvitePray', 'Share it to invite someone to pray this prayer.') });
    } catch {
      toast({ title: t('ministrySpace', 'share', 'Share'), description: url });
    }
  };

  const handleStartDevotional = (devotional: MinistryDevotional) => {
    // Count opening a devotional toward the member's faithfulness streak.
    void recordDailyActivity(user?.id, 'daily_devotional');
    const parseQuestions = (q: any): string[] => {
      if (!q) return [];
      if (Array.isArray(q)) return q;
      if (typeof q === 'string') { try { return JSON.parse(q); } catch { return []; } }
      return [];
    };

    const formattedEntry = {
      id:                  devotional.id,
      series_id:           'ministry',
      day_number:          1,
      title:               devotional.title,
      scripture_reference: devotional.scripture_reference || '',
      scripture_text:      devotional.scripture_text || '',
      content:             devotional.content || '',
      reflection_questions: parseQuestions((devotional as any).reflection_questions),
      prayer:              (devotional as any).prayer || (devotional as any).prayer_focus || '',
      cover_image_url:     (devotional as any).image_url || (devotional as any).featured_image || '',
      audio_url:           devotional.audio_url || '',
    };

    setSelectedDevotional(formattedEntry);
    setShowDevotionalModule(true);
  };

  // Mark devotional as complete
  const markDevotionalComplete = async (devotionalId: string) => {
    try {
      await supabase.from('ministry_devotional_progress').insert({
        user_id: user?.id,
        ministry_id: ministry.id,
        devotional_id: devotionalId,
        completed_at: new Date().toISOString()
      });
      // Refresh the home "Complete" tile
      window.dispatchEvent(new CustomEvent('streak:updated'));

      toast({
        title: t('ministrySpace', 'devotionalComplete', 'Devotional Complete!'),
        description: t('ministrySpace', 'progressSaved', 'Your progress has been saved')
      });
    } catch (err) {
      console.error('Error marking devotional complete:', err);
    }
  };

  // Debug permissions logging
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // Compute derived values inside useEffect to prevent infinite re-render loop
      // These values were causing React Error #310 when included in dependency array
      const currentIsLeader = membership?.is_leader || ministry.owner_id === user?.id || ministry.leader_id === user?.id;
      const currentIsAdmin = membership?.role === 'admin' || currentIsLeader;
      const currentCanManageMinistry = currentIsLeader || currentIsAdmin;
      
      console.log('=== MINISTRY SPACE PERMISSIONS ===');
      console.log('User ID:', user?.id);
      console.log('Ministry Owner ID:', ministry.owner_id);
      console.log('Ministry Leader ID:', ministry.leader_id);
      console.log('Membership:', membership);
      console.log('isLeader:', currentIsLeader);
      console.log('isAdmin:', currentIsAdmin);
      console.log('canManageMinistry:', currentCanManageMinistry);
      console.log('===================================');
    }
  }, [user?.id, ministry.owner_id, ministry.leader_id, membership?.is_leader, membership?.role]);

  const themeColor = ministry.theme_color || '#7c3aed';

  // Translate a nav tab's display label by its stable id (label used as EN fallback).
  const navLabel = (tab: { id: string; label: string }) =>
    t('ministrySpace', `nav_${tab.id}`, tab.label);

  // Per-ministry module toggle (ministry_groups.settings.modules); unknown keys default on.
  // (Moved above GROUPS, which references it, from its previous spot further down.)
  const moduleOn = (key: string): boolean => {
    const m = (ministry.settings as any)?.modules;
    return m && typeof m === 'object' && key in m ? !!m[key] : true;
  };

  // ── Two-level grouped navigation (mirrors the consumer app) ──
  type NavChild = { id: string; label: string; icon: any };
  type NavGroup = { id: string; label: string; icon: any; gradient: string; children?: NavChild[] };
  const GROUPS: NavGroup[] = [
    { id: 'home', label: 'Home', icon: Home, gradient: 'from-violet-500 to-purple-600' },
    { id: 'word', label: 'The Word', icon: BookOpen, gradient: 'from-amber-500 to-orange-500', children: [
      { id: 'devotionals', label: 'Devotionals', icon: BookOpen },
      { id: 'reading', label: 'Reading Plan', icon: Calendar },
      { id: 'scripture', label: 'Scripture Memory', icon: Sparkles },
      { id: 'books', label: 'Books', icon: Book },
    ] },
    { id: 'prayer', label: 'Prayers', icon: Heart, gradient: 'from-rose-500 to-pink-600', children: [
      { id: 'ministry', label: 'Our Prayers', icon: Heart },
      { id: 'library', label: 'Prayer Library', icon: BookOpen },
      { id: 'journal', label: 'Journal', icon: Edit },
      { id: 'wall', label: 'Prayer Wall', icon: Users },
    ] },
    { id: 'community', label: 'Community', icon: Users, gradient: 'from-emerald-500 to-teal-600', children: [
      { id: 'feed', label: 'Feed', icon: Users },
      { id: 'revelations', label: 'Revelations', icon: Book },
      { id: 'qa', label: 'Q&A', icon: HelpCircle },
      { id: 'challenges', label: 'Challenges', icon: Trophy },
    ] },
    ...(moduleOn('smallGroups') ? [{ id: 'groups', label: 'Small Groups', icon: Users, gradient: 'from-cyan-500 to-blue-600', children: [
      { id: 'discover-groups', label: 'Discover', icon: Search },
      { id: 'my-groups', label: 'My Groups', icon: Users },
    ] }] : []),
    // Gated by the ministry's plan (ministryEntitlements.caps, fix 2) — not
    // just role, unlike most of the 'admin' group's children below. Hidden
    // rather than shown-disabled, matching how canManageMinistry-gated
    // entries in this same array already work.
    ...(ministryEntitlements.caps.liveChannels
      ? [{ id: 'live', label: 'Live', icon: Radio, gradient: 'from-red-500 to-rose-600' }]
      : []),
    { id: 'admin', label: 'Ministry', icon: Building2, gradient: 'from-sky-500 to-blue-600', children: [
      { id: 'announcements', label: 'Announcements', icon: Megaphone },
      ...(canManageMinistry && ministryEntitlements.caps.broadcastMessaging ? [{ id: 'broadcast', label: 'Broadcast', icon: Send }] : []),
      { id: 'rules', label: 'Rules & Guidelines', icon: ScrollText },
      { id: 'requests', label: 'Prayer Requests', icon: MessageSquare },
      { id: 'testimonies', label: 'Testimonies', icon: Star },
      { id: 'donations', label: 'Donations', icon: Gift },
      { id: 'meetings', label: 'Meetings', icon: Video },
      ...(canManageMinistry ? [{ id: 'content', label: 'Content', icon: Sparkles }] : []),
    ] },
  ];

  // word/prayer/community children switch a sub-view; 'admin' children are their own activeTab.
  const SUBTAB: Record<string, { value: string; set: (v: any) => void }> = {
    word: { value: wordSubTab, set: setWordSubTab },
    prayer: { value: prayerSubTab, set: setPrayerSubTab },
    community: { value: communitySubTab, set: setCommunitySubTab },
  };
  const ownsSubtab = (gid: string) => gid in SUBTAB;
  const activeGroup = GROUPS.find(g => g.id === activeTab || g.children?.some(c => c.id === activeTab)) ?? GROUPS[0];
  const goToGroup = (g: NavGroup) => {
    if (!g.children || ownsSubtab(g.id)) { setActiveTab(g.id); return; }
    setActiveTab(g.children[0].id); // admin group → first child
  };
  const goToChild = (g: NavGroup, childId: string) => {
    if (ownsSubtab(g.id)) { setActiveTab(g.id); SUBTAB[g.id].set(childId); return; }
    setActiveTab(childId); // admin group child
  };
  const isChildActive = (g: NavGroup, childId: string) =>
    ownsSubtab(g.id) ? activeTab === g.id && SUBTAB[g.id].value === childId : activeTab === childId;
  const isGroupActive = (g: NavGroup) => activeGroup.id === g.id;

  // Deterministic daily pick: prefer is_daily rows, rotate by day so it varies.
  const pickDaily = (list: any[]): any | null => {
    if (!list.length) return null;
    const daily = list.filter((x) => x.is_daily);
    const pool = daily.length ? daily : list;
    const dayIndex = Math.floor(Date.now() / 86_400_000);
    return pool[dayIndex % pool.length];
  };

  // ========== CONDITIONAL RETURNS (AFTER ALL HOOKS TO COMPLY WITH RULES OF HOOKS) ==========
  
  // Show loading state while checking entitlements (moved here to prevent hook order violations)
  if (entitlements.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }
  if (showManagement && canManageMinistry) {
    return (
      <MinistryManagement
        ministryId={ministry.id}
        onBack={() => setShowManagement(false)}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: themeColor }} />
      </div>
    );
  }

  // ── Load community data when tab becomes active ──
  const loadMinistryCommunity = async () => {
    if (!ministry?.id) return;

    setMRevLoading(true);
    setMQaLoading(true);

    // Load ministry-scoped revelations
    const { data: revData } = await supabase
      .from('community_revelations')
      .select('*')
      .eq('ministry_id', ministry.id)
      .eq('is_published', true)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false });
    setMRevelations((revData || []).map(r => ({ ...r, liked: false })));
    setMRevLoading(false);

    // Load ministry-scoped questions
    const { data: qData } = await supabase
      .from('community_questions')
      .select('*, community_answers(*)')
      .eq('ministry_id', ministry.id)
      .order('created_at', { ascending: false });
    setMQuestions((qData || []).map(q => ({
      ...q,
      upvoted: false,
      answers: (q.community_answers || []).map((a: any) => ({ ...a, upvoted: false })),
    })));
    setMQaLoading(false);
  };

  const handlePostMRevelation = async () => {
    if (!user || !profile || !ministry?.id) return;
    if (!mRevTitle.trim() || !mRevContent.trim()) {
      toast({ title: t('ministrySpace', 'missingFields', 'Missing fields'), description: t('ministrySpace', 'addTitleContent', 'Please add a title and content.'), variant: 'destructive' }); return;
    }
    const { data, error } = await supabase.from('community_revelations').insert([{
      user_id: user.id,
      ministry_id: ministry.id,
      author: profile.full_name || profile.username || 'Anonymous',
      avatar: profile.avatar_url || '',
      title: mRevTitle.trim(),
      content: mRevContent.trim(),
      scriptures: [],
      likes: 0,
      is_published: true,
      is_hidden: false,
    }]).select().single();
    if (error) { toast({ title: t('ministrySpace', 'error', 'Error'), description: t('ministrySpace', 'couldNotPostRevelation', 'Could not post revelation.'), variant: 'destructive' }); return; }
    setMRevelations(prev => [{ ...data, liked: false }, ...prev]);
    setMRevTitle(''); setMRevContent('');
    setShowMRevForm(false);
    toast({ title: t('ministrySpace', 'revelationShared', 'Revelation shared!') });

    // Notify ministry members — opt-out filtered server-side
    supabase.functions.invoke('send-push-notification', {
      body: {
        title: '✨ New Revelation in ' + ministry.name,
        body: `${profile?.full_name || 'A member'} shared: "${mRevTitle.trim().slice(0, 60)}${mRevTitle.trim().length > 60 ? '…' : ''}"`,
        targetAudience: 'ministry_members',
        ministryId: ministry.id,
        notificationType: 'community_revelation',
      }
    }).catch(() => {});
  };

  const handlePostMQuestion = async () => {
    if (!user || !profile || !ministry?.id) return;
    if (!mQTitle.trim() || !mQContent.trim()) {
      toast({ title: t('ministrySpace', 'missingFields', 'Missing fields'), description: t('ministrySpace', 'addTitleQuestion', 'Please add a title and question.'), variant: 'destructive' }); return;
    }
    const { data, error } = await supabase.from('community_questions').insert([{
      user_id: user.id,
      ministry_id: ministry.id,
      author: profile.full_name || profile.username || 'Anonymous',
      avatar: profile.avatar_url || '',
      title: mQTitle.trim(),
      content: mQContent.trim(),
      scripture_context: mQScripture.trim(),
      upvotes: 0,
      is_resolved: false,
    }]).select().single();
    if (error) { toast({ title: t('ministrySpace', 'error', 'Error'), description: t('ministrySpace', 'couldNotPostQuestion', 'Could not post question.'), variant: 'destructive' }); return; }
    setMQuestions(prev => [{ ...data, upvoted: false, answers: [] }, ...prev]);
    setMQTitle(''); setMQContent(''); setMQScripture('');
    setShowMQForm(false);
    toast({ title: t('ministrySpace', 'questionPosted', 'Question posted!') });

    // Notify ministry members — opt-out filtered server-side
    supabase.functions.invoke('send-push-notification', {
      body: {
        title: '❓ New Question in ' + ministry.name,
        body: `${profile?.full_name || 'A member'} asks: "${mQTitle.trim().slice(0, 60)}${mQTitle.trim().length > 60 ? '…' : ''}"`,
        targetAudience: 'ministry_members',
        ministryId: ministry.id,
        notificationType: 'community_question',
      }
    }).catch(() => {});
  };

  const handleMUpvoteQuestion = async (id: string) => {
    const q = mQuestions.find(q => q.id === id);
    if (!q) return;
    const newUpvoted = !q.upvoted;
    const newCount = q.upvotes + (newUpvoted ? 1 : -1);
    setMQuestions(prev => prev.map(q => q.id === id ? { ...q, upvotes: newCount, upvoted: newUpvoted } : q));
    await supabase.from('community_questions').update({ upvotes: newCount }).eq('id', id);
  };

  const handleMUpvoteAnswer = async (qId: string, aId: string) => {
    setMQuestions(prev => prev.map(q => {
      if (q.id !== qId) return q;
      return {
        ...q,
        answers: q.answers.map((a: any) => {
          if (a.id !== aId) return a;
          const upvoted = !a.upvoted;
          const count = a.upvotes + (upvoted ? 1 : -1);
          supabase.from('community_answers').update({ upvotes: count }).eq('id', aId);
          return { ...a, upvotes: count, upvoted };
        }),
      };
    }));
  };

  const handleMAcceptAnswer = async (qId: string, aId: string) => {
    if (!user) return;
    const q = mQuestions.find(q => q.id === qId);
    if (!q || q.user_id !== user.id) return;
    await supabase.from('community_answers').update({ is_accepted: false }).eq('question_id', qId);
    await supabase.from('community_answers').update({ is_accepted: true }).eq('id', aId);
    await supabase.from('community_questions').update({ is_resolved: true }).eq('id', qId);
    setMQuestions(prev => prev.map(q => q.id !== qId ? q : {
      ...q, is_resolved: true,
      answers: q.answers.map((a: any) => ({ ...a, is_accepted: a.id === aId })),
    }));
    toast({ title: t('ministrySpace', 'answerAccepted', 'Answer accepted'), description: t('ministrySpace', 'questionMarkedResolved', 'Question marked as resolved.') });
  };

  const handleMPostAnswer = async (qId: string) => {
    if (!user || !profile || !ministry?.id) return;
    const content = mAnswerDrafts[qId]?.trim();
    if (!content) return;
    const { data, error } = await supabase.from('community_answers').insert([{
      question_id: qId,
      user_id: user.id,
      author: profile.full_name || profile.username || 'Anonymous',
      avatar: profile.avatar_url || '',
      content,
      upvotes: 0,
      is_accepted: false,
    }]).select().single();
    if (error) { toast({ title: t('ministrySpace', 'error', 'Error'), variant: 'destructive' }); return; }
    setMAnswerDrafts(prev => ({ ...prev, [qId]: '' }));
    setMQuestions(prev => prev.map(q =>
      q.id === qId ? { ...q, answers: [...q.answers, { ...data, upvoted: false }] } : q
    ));
    toast({ title: t('ministrySpace', 'answerPosted', 'Answer posted!') });
  };

  // Any devotional player rendered inside the ministry (home overlay OR The Word
  // library) routes "Take today's Declaration" to the home tab's declaration card.
  const goToDeclaration = () => {
    setActiveTab('home');
    setTimeout(() => {
      document.getElementById('daily-declaration')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350);
  };

  return (
    <TakeDeclarationContext.Provider value={goToDeclaration}>
    <div className="min-h-screen bg-gray-50">
      {/* Pastor's Video Message player overlay */}
      {showVideoPlayer && activeVideoMessage && (
        <VideoMessagePlayer
          videoId={activeVideoMessage.id}
          ministryId={ministry.id}
          title={activeVideoMessage.title}
          speakerName={activeVideoMessage.speaker_name}
          playbackUrl={activeVideoMessage.playback_url!}
          captionsUrl={activeVideoMessage.captions_url}
          shareUrl={`${window.location.origin}/ministry-videos/${activeVideoMessage.id}`}
          onClose={() => setShowVideoPlayer(false)}
        />
      )}

      {/* Blocking Rules & Guidelines gate — see the rules-loading effect
          above for when this is set. Mounted at the top of the page (same
          overlay idiom as the video player above it) so it blocks the
          whole ministry space, not just one tab. */}
      {needsRulesAcceptance && rulesItems.length > 0 && (
        <AcceptRulesModal
          ministryId={ministry.id}
          ministryName={ministry.name}
          items={rulesItems}
          onAccepted={() => setNeedsRulesAcceptance(false)}
        />
      )}

      {/* Sticky header + navigation (kept together so the nav never overlaps
          the variable-height header on mobile). */}
      <div className="sticky top-0 z-40">
        {/* Ministry Header */}
        <div className="shadow-md" style={{ backgroundColor: themeColor }}>
          <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3">
            {/* Back to the ministries list — always visible, not buried in a menu. */}
            <button
              onClick={onExit}
              className="mb-2 flex items-center gap-1.5 text-sm font-medium text-white/80 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('ministrySpace', 'allMinistries', 'All Ministries')}
            </button>
            <div className="flex items-start justify-between gap-2">
              {/* Identity */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                  {ministry.logo_url ? (
                    <img src={ministry.logo_url} alt={ministry.name} className="w-8 h-8 rounded object-cover" />
                  ) : (
                    <Building2 className="h-5 w-5 text-white" />
                  )}
                </div>
                <div className="min-w-0">
                  <h1 className="font-bold text-white truncate">{ministry.name}</h1>
                  <p className="text-xs text-white/80">{t('ministrySpace', 'membersCount', '{count} members').replace('{count}', String(ministry.member_count))}</p>
                </div>
              </div>

              {/* Member section: role badge + (optional) manage, with the
                  "Back to Rekindle" action placed directly below it so it is
                  always visible on both web and mobile. */}
              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  {/* Role Badge */}
                  <Badge className="bg-white/20 text-white border-0">
                    {isLeader ? (
                      <><Crown className="h-3 w-3 mr-1" />{t('ministrySpace', 'roleLeader', 'Leader')}</>
                    ) : isAdmin ? (
                      <><Shield className="h-3 w-3 mr-1" />{t('ministrySpace', 'roleAdmin', 'Admin')}</>
                    ) : isPremiumMember ? (
                      <><Star className="h-3 w-3 mr-1" />{t('ministrySpace', 'rolePremium', 'Premium')}</>
                    ) : (
                      t('ministrySpace', 'roleMember', 'Member')
                    )}
                  </Badge>

                  {/* Manage Ministry Button */}
                  {canManageMinistry && (
                    <Button
                      onClick={() => {
                        if (!hasMinistryAccess) {
                          toast({
                            title: t('ministrySpace', 'ministryTierRequired', 'Ministry Tier Required'),
                            description: t('ministrySpace', 'upgradeManagementFeatures', 'Upgrade to Ministry tier to access management features'),
                            variant: 'destructive'
                          });
                          return;
                        }
                        setShowManagement(true);
                      }}
                      className="bg-white text-purple-600 hover:bg-white/90"
                      size="sm"
                      disabled={!hasMinistryAccess}
                    >
                      {!hasMinistryAccess && <Lock className="h-4 w-4 mr-2" />}
                      <LayoutDashboard className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">{t('ministrySpace', 'manageMinistry', 'Manage Ministry')}</span>
                    </Button>
                  )}
                </div>

                {/* "Back to Rekindle" now lives inside the mobile menu button (below). */}
              </div>
            </div>
          </div>
        </div>

        {/* Ministry Navigation — mobile only (single full-width dropdown control). */}
        <div className="bg-white border-b md:hidden">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2">
            <div className="relative w-full">
              {/* Full-width mobile navigation trigger */}
              <button
                onClick={() => setNavMenuOpen((o) => !o)}
                aria-label={t('ministrySpace', 'openNavMenu', 'Open navigation menu')}
                aria-expanded={navMenuOpen}
                className="flex w-full items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-gray-800 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {(() => {
                    const activeChild = activeGroup.children?.find((c) => c.id === activeTab);
                    const ActiveIcon = activeChild ? activeChild.icon : activeGroup.icon;
                    return (
                      <>
                        <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${activeGroup.gradient} text-white shadow-sm shrink-0`}>
                          <ActiveIcon className="h-4 w-4" />
                        </span>
                        <span className="font-semibold text-gray-900 truncate">
                          {activeChild ? `${navLabel(activeGroup)} › ${navLabel(activeChild)}` : navLabel(activeGroup)}
                        </span>
                      </>
                    );
                  })()}
                </div>
                <ChevronDown className={`h-4 w-4 text-gray-500 shrink-0 transition-transform ${navMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Full-width mobile dropdown list */}
              {navMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNavMenuOpen(false)} />
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 w-full max-h-[75vh] overflow-y-auto rounded-xl border bg-white shadow-xl py-1.5">
                    {GROUPS.map((g) => {
                      const GIcon = g.icon;
                      const gActive = isGroupActive(g);
                      return (
                        <div key={g.id}>
                          <button
                            onClick={() => { goToGroup(g); if (!g.children) setNavMenuOpen(false); }}
                            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${gActive ? 'font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                            style={gActive ? { color: themeColor, backgroundColor: `${themeColor}14` } : {}}
                          >
                            <GIcon className="h-4 w-4 shrink-0" />
                            {navLabel(g)}
                          </button>
                          {g.children && gActive && g.children.map((c) => {
                            const CIcon = c.icon;
                            const cActive = isChildActive(g, c.id);
                            return (
                              <button
                                key={c.id}
                                onClick={() => { goToChild(g, c.id); setNavMenuOpen(false); }}
                                className={`flex w-full items-center gap-3 pl-11 pr-4 py-2 text-left text-sm ${cActive ? 'font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}
                                style={cActive ? { color: themeColor } : {}}
                              >
                                <CIcon className="h-3.5 w-3.5 shrink-0" />
                                {navLabel(c)}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                    {/* Back to Rekindle — exit the ministry space (return to the hub) */}
                    <div className="my-1 border-t border-gray-100" />
                    <button
                      onClick={() => { setNavMenuOpen(false); onExit(); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <ArrowLeft className="h-4 w-4 shrink-0" />
                      {t('ministrySpace', 'backToRekindle', 'Back to Rekindle')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Ministry Tier Upgrade Banner */}
      {showMinistryFeatureUpgradePrompt && (
        <Alert className="max-w-7xl mx-auto mt-4 mx-4 bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
          <Crown className="h-5 w-5 text-purple-600" />
          <AlertDescription className="ml-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-purple-900">{t('ministrySpace', 'unlockFullFeatures', 'Unlock Full Ministry Features')}</p>
                <p className="text-sm text-purple-700 mt-1">
                  {t('ministrySpace', 'upgradeFeaturesDesc', 'Upgrade to Ministry tier to access team management, broadcast messaging, custom branding, and more.')}
                </p>
              </div>
              <Button
                className="bg-purple-600 hover:bg-purple-700 text-white ml-4"
                onClick={() => navigate('/settings/billing')}
              >
                <Crown className="h-4 w-4 mr-2" />
                {t('ministrySpace', 'upgradeNow', 'Upgrade Now')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Content Area */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="flex items-start gap-6">
          {/* Web sidebar (desktop only) — restores the original ministry menu */}
          {/* Desktop navigation — consumer-style: a narrow icon RAIL of primary
              groups + a MODULE panel listing the active group's sub-tabs. */}
          <div className="hidden md:flex items-start gap-3 shrink-0 sticky top-24 self-start">
            {/* Primary icon rail */}
            <aside className="flex w-[4.75rem] flex-col items-center rounded-2xl border border-gray-200 bg-white shadow-sm py-3">
              <div
                className="mb-2 h-10 w-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
                style={{ backgroundColor: `${themeColor}1a` }}
                title={ministry.name}
              >
                {ministry.logo_url
                  ? <img src={ministry.logo_url} alt={ministry.name} className="h-10 w-10 rounded-xl object-cover" />
                  : <Building2 className="h-5 w-5" style={{ color: themeColor }} />}
              </div>
              <nav className="flex flex-col items-center gap-1" aria-label={t('ministrySpace', 'ministryNavigation', '{name} navigation').replace('{name}', ministry.name)}>
                {GROUPS.map((g) => {
                  const GIcon = g.icon;
                  const gActive = isGroupActive(g);
                  return (
                    <button
                      key={g.id}
                      onClick={() => goToGroup(g)}
                      aria-current={gActive ? 'page' : undefined}
                      className={`group flex w-16 flex-col items-center gap-1 rounded-xl px-1 py-2 text-center text-[10px] font-semibold leading-tight transition-colors ${gActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
                    >
                      <span className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${g.gradient} text-white shadow-md transition-transform ${gActive ? 'scale-105 ring-2 ring-offset-2 ring-gray-300' : 'group-hover:scale-105'}`}>
                        <GIcon className="h-5 w-5" />
                      </span>
                      <span className="w-full truncate">{navLabel(g)}</span>
                    </button>
                  );
                })}
              </nav>
              <button
                onClick={onExit}
                title={t('ministrySpace', 'backToRekindle', 'Back to Rekindle')}
                className="mt-3 flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            </aside>

            {/* Secondary MODULE panel — only for groups that have sub-tabs */}
            {activeGroup.children && (
              <aside className="flex w-52 flex-col rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-gray-100 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t('ministrySpace', 'module', 'Module')}</p>
                  <h2 className="text-base font-semibold text-gray-900 truncate">{navLabel(activeGroup)}</h2>
                </div>
                <nav className="flex flex-col gap-1 p-3" aria-label={`${navLabel(activeGroup)} navigation`}>
                  {activeGroup.children.map((c) => {
                    const CIcon = c.icon;
                    const cActive = isChildActive(activeGroup, c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => goToChild(activeGroup, c.id)}
                        aria-current={cActive ? 'page' : undefined}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${cActive ? '' : 'text-gray-700 hover:bg-gray-50'}`}
                        style={cActive ? { color: themeColor, backgroundColor: `${themeColor}14` } : {}}
                      >
                        <CIcon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{navLabel(c)}</span>
                      </button>
                    );
                  })}
                </nav>
              </aside>
            )}
          </div>

          {/* Main content */}
          <div className="min-w-0 flex-1">
        {/* Live Tab - MLiveChannel */}
        {activeTab === 'live' && (
          <MLiveChannel
            ministryId={ministry.id}
            ministryName={ministry.name}
            isLeader={isLeader}
            themeColor={themeColor}
          />
        )}

        {/* Content Tab (leaders/admins) — declaration & affirmation source + authoring */}
        {activeTab === 'content' && canManageMinistry && (
          <MinistryContentManager
            ministryId={ministry.id}
            settings={ministry.settings}
            themeColor={themeColor}
            onSourceChange={loadMinistryData}
          />
        )}

        {/* The Word — reading plan, scripture memory, and books (shared ReKindle library) */}
        {activeTab === 'word' && (
          <div className="space-y-4">
            {/* Leader-only: choose the daily-devotional source (own vs a ReKindle
                stream), like the consumer app's devotional-source picker. */}
            {wordSubTab === 'devotionals' && isLeader && (
              <MinistryDevotionalSourcePicker ministryId={ministry.id} />
            )}
            {wordSubTab === 'devotionals' && <DevotionalLibrary hidePlanBanner />}
            {wordSubTab === 'reading' && <BibleReadingPlan />}
            {wordSubTab === 'scripture' && <ScriptureMemory />}
            {wordSubTab === 'books' && <BookSummaries />}
          </div>
        )}

        {/* Home Tab */}
        {activeTab === 'home' && (
          <div className="space-y-6">

            {/* Welcome Banner */}
            {(() => {
              const hour = new Date().getHours();
              const greeting = hour < 12
                ? t('ministrySpace', 'goodMorning', 'Good morning')
                : hour < 18
                  ? t('ministrySpace', 'goodAfternoon', 'Good afternoon')
                  : t('ministrySpace', 'goodEvening', 'Good evening');
              const firstName = (profile?.full_name || '').trim().split(' ')[0];
              return (
                <div
                  className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-lg"
                  style={{ background: `linear-gradient(135deg, ${themeColor} 0%, ${themeColor}cc 100%)`, boxShadow: `0 12px 40px ${themeColor}40` }}
                >
                  <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
                  <div className="pointer-events-none absolute -bottom-28 -left-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
                  <div className="relative">
                    <p className="text-sm font-medium text-white/80">{greeting}{firstName ? `, ${firstName}` : ''} 👋</p>
                    <h2 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight truncate">
                      {t('ministrySpace', 'welcomeTo', 'Welcome to {name}').replace('{name}', ministry.name)}
                    </h2>
                    {(ministry.welcome_message || ministry.description) && (
                      <p className="mt-2 text-white/85 max-w-2xl line-clamp-2">
                        {ministry.welcome_message || ministry.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Quick Links — jump straight to any section, not just via the side rail/hamburger */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {GROUPS.filter(g => g.id !== 'home').map(g => {
                const GIcon = g.icon;
                return (
                  <button
                    key={g.id}
                    onClick={() => goToGroup(g)}
                    className={`flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-br ${g.gradient} p-4 text-white shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md`}
                  >
                    <GIcon className="h-6 w-6" />
                    <span className="text-xs font-semibold text-center leading-tight">{navLabel(g)}</span>
                  </button>
                );
              })}
            </div>

            {/* ReKindle Tip — nudge to set up daily reminders (self-hides once set) */}
            <ReminderSetupTip onSetup={() => navigate('/settings/account')} />

            {/* Faithfulness streak */}
            <StreakWidget />

            {/* Stat capsules — inline on mobile, floating bar (like the consumer) on desktop */}
            <div className="flex flex-wrap gap-2 md:fixed md:bottom-5 md:left-1/2 md:z-40 md:-translate-x-1/2 md:flex-nowrap md:rounded-full md:border md:bg-white/85 md:px-2.5 md:py-2 md:shadow-xl md:backdrop-blur">
              {[
                { icon: BookOpen, value: analytics?.booksCompleted ?? 0, label: t('ministrySpace', 'booksCompleted', 'Books completed'), grad: 'from-orange-500 to-amber-600' },
                { icon: Heart, value: analytics?.prayersCompleted ?? 0, label: t('ministrySpace', 'prayersCompleted', 'Prayers completed'), grad: 'from-rose-500 to-pink-600' },
                { icon: Star, value: analytics?.xpPoints ?? 0, label: t('ministrySpace', 'devotionalsCompleted', 'Devotionals completed'), grad: 'from-amber-500 to-yellow-600' },
                // This member's own physical kiosk check-ins this month.
                { icon: Building2, value: kioskThisMonth, label: t('ministrySpace', 'myCheckInsThisMonth', 'Church check-ins this month'), grad: 'from-sky-500 to-blue-600' },
              ].map((s, i) => {
                const SIcon = s.icon;
                return (
                  <div key={i} className={`flex items-center gap-2 rounded-full bg-gradient-to-r ${s.grad} px-4 py-2 text-white shadow-sm`}>
                    <SIcon className="h-4 w-4 shrink-0" />
                    <span className="text-sm font-bold">{s.value}</span>
                    <span className="text-xs opacity-90 whitespace-nowrap">{s.label}</span>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Today's Devotional */}
              <div className="lg:col-span-2">
                {(() => {
                  const today = getLocalDateString();
                  const available = devotionals.filter(dev =>
                    !dev.scheduled_date || dev.scheduled_date.split('T')[0] <= today
                  );
                  // Same 3-step priority as DailyDevotionalWidget
                  const todaysDev =
                    available.find(dev => dev.scheduled_date?.split('T')[0] === today) ||
                    available.filter(dev => dev.scheduled_date).sort((a, b) =>
                      new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()
                    )[0] ||
                    [...available].sort((a, b) =>
                      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                    )[0] || null;
                  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
                  const devQuestions = (() => {
                    const q = (todaysDev as any)?.reflection_questions;
                    if (!q) return [];
                    if (typeof q === 'string') { try { return JSON.parse(q); } catch { return []; } }
                    return Array.isArray(q) ? q : [];
                  })();
                  return todaysDev ? (
                    <div
                      className="rounded-2xl text-white p-4 sm:p-6 space-y-3 sm:space-y-4 shadow-lg h-full overflow-hidden"
                      style={{ background: `linear-gradient(135deg, ${themeColor} 0%, ${themeColor}cc 100%)` }}
                    >
                      {/* Header row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 opacity-80">
                          <BookOpen className="h-4 w-4" />
                          <span className="text-sm">{todayLabel}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest opacity-70 mb-1">{t('ministrySpace', 'todaysDevotional', "Today's Devotional")}</p>
                        <h3 className="text-xl font-bold font-serif leading-snug">{todaysDev.title}</h3>
                        <p className="text-sm opacity-70 mt-0.5">{t('ministrySpace', 'dailyScriptureReflection', 'Daily Scripture Reflection')}</p>
                      </div>
                      {/* Scripture box */}
                      {(todaysDev.scripture_reference || todaysDev.scripture_text) && (
                        <div className="bg-white/10 rounded-lg p-3 space-y-1.5">
                          {todaysDev.scripture_reference && (
                            <p className="text-amber-200 font-medium text-sm">{todaysDev.scripture_reference}</p>
                          )}
                          {todaysDev.scripture_text && (
                            <p className="text-sm italic opacity-90 line-clamp-2">"{todaysDev.scripture_text}"</p>
                          )}
                        </div>
                      )}
                      {/* Content */}
                      <p className="text-sm opacity-90 line-clamp-3 leading-relaxed">{todaysDev.content}</p>
                      {/* Reflection questions */}
                      {devQuestions.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium opacity-70">{t('ministrySpace', 'reflectionQuestions', 'Reflection Questions:')}</p>
                          <ul className="text-sm opacity-90 space-y-0.5">
                            {devQuestions.slice(0, 2).map((q: string, i: number) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <span className="text-amber-300">•</span><span>{q}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {/* Progress */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs opacity-70">
                          <span>{t('ministrySpace', 'progress', 'Progress')}</span><span>0/1</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/20">
                          <div className="h-1.5 rounded-full bg-white/60 w-0" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm opacity-70">
                        <Clock className="h-4 w-4" /><span>{t('ministrySpace', 'about8Minutes', '~8 minutes')}</span>
                      </div>
                      <Button
                        className="w-full bg-white font-semibold"
                        style={{ color: themeColor }}
                        onClick={() => handleStartDevotional(todaysDev)}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        {t('ministrySpace', 'startTodaysDevotional', "Start Today's Devotional")}
                        <ChevronRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  ) : (
                    <Card className="h-full flex items-center justify-center p-8 text-center">
                      <div>
                        <BookOpen className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                        <p className="font-medium text-gray-600">{t('ministrySpace', 'noDevotionalToday', 'No devotional today')}</p>
                        <p className="text-sm text-gray-400 mt-1">{t('ministrySpace', 'checkBackTomorrow', 'Check back tomorrow')}</p>
                      </div>
                    </Card>
                  );
                })()}
              </div>

              {/* Latest Announcements — now beside the devotional (swapped with Prayer Requests) */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Megaphone className="h-5 w-5" style={{ color: themeColor }} />
                    {t('ministrySpace', 'latestAnnouncements', 'Latest Announcements')}
                  </CardTitle>
                  {isAdmin && (
                    <Button size="sm" onClick={() => setShowAnnouncementModal(true)}>
                      <Plus className="h-4 w-4 mr-1" />
                      {t('ministrySpace', 'new', 'New')}
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {announcements.length > 0 ? (
                    <div className="space-y-3">
                      {announcements.slice(0, 3).map(ann => (
                        <div key={ann.id} className="p-3 border rounded-lg">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {ann.is_pinned && <Pin className="h-4 w-4 text-amber-500 shrink-0" />}
                                <h4 className="font-semibold text-sm truncate">{ann.title}</h4>
                              </div>
                              <p className="text-gray-600 mt-1 text-xs line-clamp-2">{ann.content}</p>
                            </div>
                            <span className="text-[10px] text-gray-400 shrink-0">{new Date(ann.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-4 text-sm">{t('ministrySpace', 'noAnnouncementsYet', 'No announcements yet')}</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Pastor's Video Message — latest published (pinned first), plus a
                browsable strip of previous messages. */}
            {videoMessages.length > 0 && (() => {
              const published = videoMessages.filter(v => v.playback_url);
              const latest = published[0] || null;
              const previous = published.slice(1, 7);
              if (!latest) return null;
              return (
                <Card className="overflow-hidden">
                  <div className="grid grid-cols-1 md:grid-cols-5">
                    <button
                      onClick={() => { setActiveVideoMessage(latest); setShowVideoPlayer(true); }}
                      className="relative md:col-span-2 aspect-video bg-black group"
                    >
                      {latest.thumbnail_url ? (
                        <img src={latest.thumbnail_url} alt={latest.title} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-900">
                          <Video className="h-10 w-10 text-gray-600" />
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-14 w-14 rounded-full bg-white/90 flex items-center justify-center group-hover:scale-105 transition-transform">
                          <Play className="h-6 w-6 ml-0.5" style={{ color: themeColor }} />
                        </div>
                      </div>
                      {latest.duration_seconds ? (
                        <span className="absolute bottom-2 right-2 text-[11px] bg-black/70 text-white px-1.5 py-0.5 rounded">
                          {Math.floor(latest.duration_seconds / 60)}:{String(Math.round(latest.duration_seconds % 60)).padStart(2, '0')}
                        </span>
                      ) : null}
                    </button>
                    <div className="md:col-span-3 p-4 sm:p-6 flex flex-col justify-center">
                      <div className="flex items-center gap-2 mb-1">
                        {ministry.logo_url && <img src={ministry.logo_url} alt={ministry.name} className="h-5 w-5 rounded-full object-cover" />}
                        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: themeColor }}>
                          {t('ministrySpace', 'pastorsMessage', "Pastor's Video Message")}
                        </p>
                      </div>
                      <h3 className="text-xl font-bold leading-snug">{latest.title}</h3>
                      <div className="flex items-center gap-2 text-sm text-gray-500 mt-1 flex-wrap">
                        {latest.speaker_name && <span>{latest.speaker_name}</span>}
                        {latest.published_at && <span>· {new Date(latest.published_at).toLocaleDateString()}</span>}
                      </div>
                      {latest.description && (
                        <p className="text-sm text-gray-600 mt-2 line-clamp-2">{latest.description}</p>
                      )}
                      <Button
                        className="mt-4 w-fit"
                        style={{ backgroundColor: themeColor }}
                        onClick={() => { setActiveVideoMessage(latest); setShowVideoPlayer(true); }}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        {t('ministrySpace', 'watchMessage', 'Watch Message')}
                      </Button>
                    </div>
                  </div>

                  {previous.length > 0 && (
                    <div className="border-t p-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        {t('ministrySpace', 'previousMessages', 'Previous Messages')}
                      </p>
                      <div className="flex gap-3 overflow-x-auto pb-1">
                        {previous.map(video => (
                          <button
                            key={video.id}
                            onClick={() => { setActiveVideoMessage(video); setShowVideoPlayer(true); }}
                            className="flex-shrink-0 w-40 text-left group"
                          >
                            <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100">
                              {video.thumbnail_url ? (
                                <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Video className="h-6 w-6 text-gray-300" />
                                </div>
                              )}
                              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                                <Play className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </div>
                            <p className="text-xs font-medium mt-1 line-clamp-2">{video.title}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })()}

            {/* Today's Declaration & Affirmation — consumer card design (Save/Share/Audio),
                ministry-scoped via the per-feature content source, module-gated. */}
            {(moduleOn('declarations') || moduleOn('affirmations')) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {moduleOn('declarations') && (
                  <div id="daily-declaration">
                    <DeclarationCard ministryId={ministry.id} source={getFeatureSource(ministry.settings, 'declarations')} brandName={ministry.name} />
                  </div>
                )}
                {moduleOn('affirmations') && (
                  <AffirmationCard ministryId={ministry.id} source={getFeatureSource(ministry.settings, 'affirmations')} brandName={ministry.name} />
                )}
              </div>
            )}

            {/* WhatsApp opt-in — only rendered if ministry has an active WhatsApp connection */}
            <MinistryWhatsAppOptIn
              ministryId={ministry.id}
              ministryName={ministry.name}
            />

            {/* Worship music — shared library + up to 10 personal uploads per member */}
            {moduleOn('music') && (
              <div>
                <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <Music className="h-5 w-5" style={{ color: themeColor }} />
                  {t('ministrySpace', 'worshipMusic', 'Worship Music')}
                </h2>
                <InstrumentalPlayer uploadLimit={10} />
              </div>
            )}

            {/* Prayer Requests — moved to full-width (swapped with Latest Announcements) */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Heart className="h-5 w-5" style={{ color: themeColor }} />
                  {t('ministrySpace', 'prayerRequests', 'Prayer Requests')}
                </CardTitle>
                <Button variant="outline" size="sm" onClick={() => setActiveTab('requests')}>
                  {t('ministrySpace', 'viewAll', 'View All')}
                </Button>
              </CardHeader>
              <CardContent>
                {prayerRequests.length > 0 ? (
                  <div className="space-y-3">
                    {prayerRequests.slice(0, 3).map(prayer => (
                      <div key={prayer.id} className="p-4 bg-gray-50 rounded-lg">
                        <p className="font-medium">{prayer.title}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-500">
                            {t('ministrySpace', 'prayersCount', '{count} prayers').replace('{count}', String(prayer.prayer_count))}
                          </span>
                          <Button size="sm" variant="ghost" onClick={() => handlePrayForRequest(prayer.id, prayer.prayer_count)}>
                            <Heart className="h-3 w-3 mr-1" />
                            {t('ministrySpace', 'pray', 'Pray')}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">{t('ministrySpace', 'noPrayerRequestsShort', 'No prayer requests')}</p>
                )}
              </CardContent>
            </Card>

            {/* Upcoming Events */}
            {events.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" style={{ color: themeColor }} />
                    {t('ministrySpace', 'upcomingEvents', 'Upcoming Events')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {events.slice(0, 3).map(event => (
                      <div key={event.id} className="flex items-center gap-4 p-3 border rounded-lg">
                        <div 
                          className="w-12 h-12 rounded-lg flex items-center justify-center text-white"
                          style={{ backgroundColor: themeColor }}
                        >
                          <Calendar className="h-6 w-6" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold">{event.title}</h4>
                          <p className="text-sm text-gray-500">
                            {new Date(event.start_time).toLocaleDateString()} at{' '}
                            {new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        {event.is_interactive && !isPremiumMember && (
                          <Badge variant="secondary">
                            <Lock className="h-3 w-3 mr-1" />
                            {t('ministrySpace', 'rolePremium', 'Premium')}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Devotionals Tab */}
        {activeTab === 'devotionals' && (() => {
          const today = new Date().toISOString().split('T')[0];
          const availableDevotionals = devotionals.filter(dev =>
            !dev.scheduled_date || dev.scheduled_date.split('T')[0] <= today
          );
          // Same 3-step priority as DailyDevotionalWidget
          const todaysDev =
            availableDevotionals.find(dev => dev.scheduled_date?.split('T')[0] === today) ||
            availableDevotionals.filter(dev => dev.scheduled_date).sort((a, b) =>
              new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()
            )[0] ||
            [...availableDevotionals].sort((a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )[0] || null;
          const pastDevotionals = availableDevotionals.filter(dev =>
            dev.id !== todaysDev?.id
          );

          return (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">{t('ministrySpace', 'ministryDevotionals', 'Ministry Devotionals')}</h2>

              {/* Today's Devotional — matches home screen card style */}
              {todaysDev ? (() => {
                  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
                  const devQs = (() => {
                    const q = (todaysDev as any)?.reflection_questions;
                    if (!q) return [];
                    if (typeof q === 'string') { try { return JSON.parse(q); } catch { return []; } }
                    return Array.isArray(q) ? q : [];
                  })();
                  return (
                <div
                  className="rounded-2xl text-white p-4 sm:p-6 space-y-3 sm:space-y-4 shadow-lg overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${themeColor} 0%, ${themeColor}cc 100%)` }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 opacity-80">
                      <BookOpen className="h-5 w-5" />
                      <span className="text-sm">{todayLabel}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest opacity-70 mb-1">{t('ministrySpace', 'todaysDevotional', "Today's Devotional")}</p>
                    <h3 className="text-2xl font-bold font-serif leading-snug">{todaysDev.title}</h3>
                    <p className="text-sm opacity-70 mt-0.5">{t('ministrySpace', 'dailyScriptureReflection', 'Daily Scripture Reflection')}</p>
                  </div>
                  {/* Scripture box */}
                  {(todaysDev.scripture_reference || todaysDev.scripture_text) && (
                    <div className="bg-white/10 rounded-lg p-4 space-y-2">
                      {todaysDev.scripture_reference && (
                        <p className="text-amber-200 font-medium">{todaysDev.scripture_reference}</p>
                      )}
                      {todaysDev.scripture_text && (
                        <p className="text-sm italic opacity-90 line-clamp-3">"{todaysDev.scripture_text}"</p>
                      )}
                    </div>
                  )}
                  {/* Content */}
                  <p className="text-sm opacity-90 line-clamp-4 leading-relaxed">{todaysDev.content}</p>
                  {/* Reflection questions */}
                  {devQs.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium opacity-70">{t('ministrySpace', 'reflectionQuestions', 'Reflection Questions:')}</p>
                      <ul className="text-sm opacity-90 space-y-1">
                        {devQs.slice(0, 2).map((q: string, i: number) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-amber-300">•</span><span>{q}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {/* Progress */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm opacity-70">
                      <span>{t('ministrySpace', 'progress', 'Progress')}</span><span>0/1</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/20">
                      <div className="h-2 rounded-full bg-white/60 w-0" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm opacity-70">
                    <Clock className="h-4 w-4" /><span>{t('ministrySpace', 'about8Minutes', '~8 minutes')}</span>
                  </div>
                  <Button
                    className="w-full bg-white font-semibold"
                    style={{ color: themeColor }}
                    onClick={() => handleStartDevotional(todaysDev)}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    {t('ministrySpace', 'startTodaysDevotional', "Start Today's Devotional")}
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
                  );
              })() : (
                <Card className="p-12 text-center">
                  <BookOpen className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-700">{t('ministrySpace', 'noDevotionalTodayTitle', 'No Devotional Today')}</h3>
                  <p className="text-gray-500 mt-1">{t('ministrySpace', 'leaderNotPublishedDevotional', "Your ministry leader hasn't published today's devotional yet.")}</p>
                </Card>
              )}

              {/* Past Devotionals Archive */}
              {pastDevotionals.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{t('ministrySpace', 'previousDevotionals', 'Previous Devotionals')}</h3>
                  <div className="space-y-3">
                    {pastDevotionals.map(dev => (
                      <Card key={dev.id} className="overflow-hidden hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: themeColor }} />
                                {dev.scripture_reference && (
                                  <p className="text-xs font-medium truncate" style={{ color: themeColor }}>
                                    {dev.scripture_reference}
                                  </p>
                                )}
                                {dev.scheduled_date && (
                                  <span className="text-xs text-gray-400 ml-auto shrink-0">
                                    {new Date(dev.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </span>
                                )}
                              </div>
                              <h4 className="font-semibold text-gray-900 truncate">{dev.title}</h4>
                              <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{dev.content}</p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="shrink-0 text-xs"
                              style={{ color: themeColor }}
                              onClick={() => handleStartDevotional(dev)}
                            >
                              <Play className="h-3.5 w-3.5 mr-1" />
                              {t('ministrySpace', 'read', 'Read')}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Prayer Requests Tab */}
        {activeTab === 'requests' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">{t('ministrySpace', 'prayerRequests', 'Prayer Requests')}</h2>
              <Button onClick={() => setShowPrayerModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t('ministrySpace', 'submitRequest', 'Submit Request')}
              </Button>
            </div>
            {prayerRequests.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {prayerRequests.map(prayer => (
                  <Card key={prayer.id}>
                    <CardContent className="p-4">
                      <h3 className="font-semibold">{prayer.title}</h3>
                      {prayer.content && (
                        <p className="text-gray-600 mt-2 text-sm">{prayer.content}</p>
                      )}
                      <div className="flex items-center justify-between mt-4">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Heart className="h-4 w-4" style={{ color: themeColor }} />
                          {t('ministrySpace', 'prayersCount', '{count} prayers').replace('{count}', String(prayer.prayer_count))}
                        </div>
                        <Button 
                          size="sm"
                          onClick={() => handlePrayForRequest(prayer.id, prayer.prayer_count)}
                          style={{ backgroundColor: themeColor }}
                        >
                          <Heart className="h-4 w-4 mr-1" />
                          {t('ministrySpace', 'pray', 'Pray')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <Heart className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-700">{t('ministrySpace', 'noPrayerRequestsTitle', 'No Prayer Requests')}</h3>
                <p className="text-gray-500 mb-4">{t('ministrySpace', 'beFirstPrayerRequest', 'Be the first to submit a prayer request')}</p>
                <Button onClick={() => setShowPrayerModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('ministrySpace', 'submitRequest', 'Submit Request')}
                </Button>
              </Card>
            )}
          </div>
        )}

        {/* Testimonies Tab */}
        {activeTab === 'testimonies' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">{t('ministrySpace', 'testimonies', 'Testimonies')}</h2>
              <Button onClick={() => setShowTestimonyModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t('ministrySpace', 'shareTestimony', 'Share Testimony')}
              </Button>
            </div>
            {testimonies.length > 0 ? (
              <div className="space-y-4">
                {testimonies.map(testimony => (
                  <Card key={testimony.id}>
                    <CardContent className="p-6">
                      <h3 className="font-bold text-lg">{testimony.title}</h3>
                      <p className="text-gray-600 mt-3">{testimony.content}</p>
                      <p className="text-xs text-gray-400 mt-4">
                        {new Date(testimony.created_at).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <Star className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-700">{t('ministrySpace', 'noTestimoniesYet', 'No Testimonies Yet')}</h3>
                <p className="text-gray-500 mb-4">{t('ministrySpace', 'shareWhatGodHasDone', 'Share what God has done in your life')}</p>
                <Button onClick={() => setShowTestimonyModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('ministrySpace', 'shareTestimony', 'Share Testimony')}
                </Button>
              </Card>
            )}
          </div>
        )}

        {/* Broadcast Tab — admin/leader only, no member-facing view. */}
        {activeTab === 'broadcast' && isAdmin && <MinistryBroadcast />}

        {/* Announcements Tab
             Admins see the full MinistryAnnouncementsManager (search, filter, analytics,
             templates, pin/edit/delete, push+email dispatch, CSV export).
             Members see a read-only list of published announcements. */}
        {activeTab === 'announcements' && (
          isAdmin
            ? (
              <MinistryAnnouncementsManager ministryId={ministry.id} />
            )
            : (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">{t('ministrySpace', 'announcements', 'Announcements')}</h2>
                {announcements.length > 0 ? (
                  announcements.map(ann => (
                    <Card key={ann.id}>
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              {ann.is_pinned && (
                                <Badge className="bg-amber-100 text-amber-700">
                                  <Pin className="h-3 w-3 mr-1" />
                                  {t('ministrySpace', 'pinned', 'Pinned')}
                                </Badge>
                              )}
                              <h3 className="font-bold text-lg">{ann.title}</h3>
                            </div>
                            <p className="text-gray-600 mt-3">{ann.content}</p>
                          </div>
                          <span className="text-sm text-gray-400 shrink-0 ml-4">
                            {new Date(ann.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card className="p-12 text-center">
                    <Megaphone className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-semibold text-gray-700">{t('ministrySpace', 'noAnnouncementsTitle', 'No Announcements')}</h3>
                    <p className="text-gray-500">{t('ministrySpace', 'checkBackLaterUpdates', 'Check back later for ministry updates')}</p>
                  </Card>
                )}
              </div>
            )
        )}

        {/* Rules & Guidelines Tab
             Admins see the full MinistryRulesManager (draft CRUD, reorder,
             require-acceptance toggle, publish, version history). Members
             see a read-only list of the currently published version —
             same admin/member split as Announcements above. This tab is
             always in the nav (unconditional child, not canManageMinistry-
             gated) since members need to read the rules any time, not just
             when the blocking AcceptRulesModal forces it on them. */}
        {activeTab === 'rules' && (
          isAdmin
            ? (
              <MinistryRulesManager ministryId={ministry.id} />
            )
            : (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">{t('ministrySpace', 'rulesGuidelines', 'Rules & Guidelines')}</h2>
                {rulesItems.length > 0 ? (
                  rulesItems.map((item, idx) => (
                    <Card key={item.id}>
                      <CardContent className="p-6">
                        <h3 className="font-bold text-lg">{idx + 1}. {item.title}</h3>
                        <p className="text-gray-600 mt-2 whitespace-pre-wrap">{item.body}</p>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card className="p-12 text-center">
                    <ScrollText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-semibold text-gray-700">{t('ministrySpace', 'noRulesTitle', 'No rules published yet')}</h3>
                    <p className="text-gray-500">{t('ministrySpace', 'noRulesBody', 'This ministry hasn\'t published any rules or guidelines.')}</p>
                  </Card>
                )}
              </div>
            )
        )}

        {/* Donations Tab - NOW WITH THE FORM! */}
        {activeTab === 'donations' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">{t('ministrySpace', 'donationsOfferings', 'Donations & Offerings')}</h2>
            {showDonationForm ? (
              <MinistryDonationForm
                ministryId={ministry.id}
                ministryName={ministry.name}
                themeColor={themeColor}
                onComplete={() => {
                  setShowDonationForm(false);
                  toast({
                    title: t('ministrySpace', 'thankYou', 'Thank You!'),
                    description: t('ministrySpace', 'donationReceived', 'Your generous donation has been received')
                  });
                }}
              />
            ) : (
              <Card className="p-8 text-center">
                <Gift className="h-12 w-12 mx-auto mb-4" style={{ color: themeColor }} />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">{t('ministrySpace', 'supportThisMinistry', 'Support This Ministry')}</h3>
                <p className="text-gray-500 mb-6">{t('ministrySpace', 'generousGivingHelps', 'Your generous giving helps us continue our mission')}</p>
                <Button 
                  style={{ backgroundColor: themeColor }}
                  onClick={() => setShowDonationForm(true)}
                  size="lg"
                >
                  <Gift className="h-4 w-4 mr-2" />
                  {t('ministrySpace', 'giveNow', 'Give Now')}
                </Button>
              </Card>
            )}
          </div>
        )}

        {/* Community Tab */}
        {activeTab === 'community' && (
          <div className="space-y-5">

            {/* Community header */}
            <div>
              <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <Users className="h-6 w-6" style={{ color: themeColor }} />
                {t('ministrySpace', 'community', 'Community')}
              </h2>
              <p className="text-sm text-gray-500 mt-1">{t('ministrySpace', 'communityIntro', 'Share insights and seek clarity together within {name}.').replace('{name}', ministry.name)}</p>
            </div>


            {/* ── FEED / CHALLENGES / REWARDS sub-tabs (ported from consumer community) ── */}
            {communitySubTab === 'feed' && <CommunityActivityFeed />}
            {communitySubTab === 'challenges' && <EnhancedPrayerChallenges />}

            {/* ── REVELATIONS sub-tab ── */}
            {communitySubTab === 'revelations' && (
              <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <p className="text-sm text-gray-500">{t('ministrySpace', 'shareGodRevealed', 'Share what God has revealed to you through Scripture or prayer.')}</p>
                  {user && (
                    <Button
                      size="sm"
                      onClick={() => setShowMRevForm(v => !v)}
                      style={{ backgroundColor: themeColor }}
                      className="text-white shrink-0"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {t('ministrySpace', 'shareRevelation', 'Share Revelation')}
                    </Button>
                  )}
                </div>

                {/* Post form */}
                {showMRevForm && (
                  <Card className="border-purple-200 bg-purple-50/30">
                    <CardContent className="p-4 space-y-3">
                      <h4 className="font-semibold text-purple-800">{t('ministrySpace', 'newRevelation', 'New Revelation')}</h4>
                      <Input
                        value={mRevTitle}
                        onChange={e => setMRevTitle(e.target.value)}
                        placeholder={t('ministrySpace', 'revelationTitlePlaceholder', 'Title of your revelation…')}
                        className="bg-white"
                      />
                      <Textarea
                        value={mRevContent}
                        onChange={e => setMRevContent(e.target.value)}
                        placeholder={t('ministrySpace', 'revelationContentPlaceholder', 'Share what God revealed to you…')}
                        rows={4}
                        className="bg-white"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setShowMRevForm(false)}>{t('ministrySpace', 'cancel', 'Cancel')}</Button>
                        <Button size="sm" style={{ backgroundColor: themeColor }} className="text-white" onClick={handlePostMRevelation}>
                          <Send className="h-4 w-4 mr-1" />
                          {t('ministrySpace', 'post', 'Post')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Revelations list */}
                {mRevLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-7 w-7 animate-spin" style={{ color: themeColor }} />
                  </div>
                ) : mRevelations.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <Book className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">{t('ministrySpace', 'noRevelationsYet', 'No revelations yet.')}</p>
                    <p className="text-sm mt-1">{t('ministrySpace', 'beFirstShareRevealed', 'Be the first to share what God has revealed.')}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {mRevelations.map(rev => (
                      <Card key={rev.id} className="border border-gray-200">
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-gray-900 break-words">{rev.title}</h4>
                              <p className="text-xs text-gray-400 mt-0.5">{rev.author} · {new Date(rev.created_at).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <p className="text-sm text-gray-700 break-words whitespace-pre-wrap">{rev.content}</p>
                          {rev.scriptures?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {rev.scriptures.map((s: any, i: number) => (
                                <span key={i} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                                  📖 {s.reference}
                                </span>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Q&A sub-tab ── */}
            {communitySubTab === 'qa' && (
              <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div>
                    <h3 className="text-base font-bold text-blue-700 flex items-center gap-2">
                      <HelpCircle className="h-5 w-5" />
                      {t('ministrySpace', 'gotQuestionsSeekClarity', 'Got Questions? Seek Clarity')}
                    </h3>
                    <p className="text-sm text-gray-500 mt-0.5">{t('ministrySpace', 'askBiblicalQuestions', 'Ask biblical questions within {name} and receive community insight.').replace('{name}', ministry.name)}</p>
                  </div>
                  {user && (
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white shrink-0" onClick={() => setShowMQForm(v => !v)}>
                      <Plus className="h-4 w-4 mr-1" />
                      {t('ministrySpace', 'askQuestion', 'Ask a Question')}
                    </Button>
                  )}
                </div>

                {/* Ask form */}
                {showMQForm && (
                  <Card className="border-blue-200 bg-blue-50/40">
                    <CardContent className="p-4 space-y-3">
                      <h4 className="font-semibold text-blue-800">{t('ministrySpace', 'yourQuestion', 'Your Question')}</h4>
                      <Input value={mQTitle} onChange={e => setMQTitle(e.target.value)} placeholder={t('ministrySpace', 'questionTitlePlaceholder', 'Short title for your question…')} className="bg-white" />
                      <Textarea value={mQContent} onChange={e => setMQContent(e.target.value)} placeholder={t('ministrySpace', 'questionDetailPlaceholder', 'Describe your question in detail…')} rows={4} className="bg-white" />
                      <Input value={mQScripture} onChange={e => setMQScripture(e.target.value)} placeholder={t('ministrySpace', 'relatedScripturePlaceholder', 'Related scripture (optional) e.g. Romans 8:28')} className="bg-white" />
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setShowMQForm(false)}>{t('ministrySpace', 'cancel', 'Cancel')}</Button>
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handlePostMQuestion}>
                          <Send className="h-4 w-4 mr-1" />
                          {t('ministrySpace', 'postQuestion', 'Post Question')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Filter */}
                <div className="flex gap-2 flex-wrap">
                  {(['all', 'open', 'resolved'] as const).map(f => (
                    <Button key={f} variant={mQaFilter === f ? 'default' : 'outline'} size="sm"
                      onClick={() => setMQaFilter(f)}
                      className={mQaFilter === f ? 'bg-blue-600 hover:bg-blue-700' : ''}
                    >
                      {f === 'all' ? t('ministrySpace', 'filterAll', 'All') : f === 'open' ? t('ministrySpace', 'filterOpen', 'Open') : t('ministrySpace', 'filterResolved', '✓ Resolved')}
                    </Button>
                  ))}
                </div>

                {/* Questions */}
                {mQaLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {mQuestions
                      .filter(q => mQaFilter === 'all' ? true : mQaFilter === 'open' ? !q.is_resolved : q.is_resolved)
                      .map(q => (
                        <Card key={q.id} className={`border ${q.is_resolved ? 'border-green-200 bg-green-50/30' : 'border-gray-200'}`}>
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  {q.is_resolved && (
                                    <Badge className="bg-green-100 text-green-700 border-green-300 text-xs">
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      {t('ministrySpace', 'resolved', 'Resolved')}
                                    </Badge>
                                  )}
                                  <span className="text-xs text-gray-400">{q.author} · {new Date(q.created_at).toLocaleDateString()}</span>
                                </div>
                                <h4 className="font-semibold text-gray-900 break-words">{q.title}</h4>
                                <p className="text-sm text-gray-600 mt-1 break-words">{q.content}</p>
                                {q.scripture_context && (
                                  <p className="text-xs text-blue-600 mt-1 italic">📖 {q.scripture_context}</p>
                                )}
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-3 text-sm">
                              <button
                                onClick={() => handleMUpvoteQuestion(q.id)}
                                className={`flex items-center gap-1 transition-colors ${q.upvoted ? 'text-blue-600 font-semibold' : 'text-gray-500 hover:text-blue-500'}`}
                              >
                                <ThumbsUp className={`h-4 w-4 ${q.upvoted ? 'fill-current' : ''}`} />
                                {q.upvotes}
                              </button>
                              <button
                                onClick={() => setMExpandedQ(mExpandedQ === q.id ? null : q.id)}
                                className="flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors"
                              >
                                <MessageSquare className="h-4 w-4" />
                                {q.answers.length} {q.answers.length === 1 ? t('ministrySpace', 'answerSingular', 'answer') : t('ministrySpace', 'answerPlural', 'answers')}
                                {mExpandedQ === q.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </button>
                            </div>

                            {/* Answers panel */}
                            {mExpandedQ === q.id && (
                              <div className="space-y-3 pt-2 border-t border-gray-100">
                                {q.answers.length === 0 && (
                                  <p className="text-sm text-gray-400 italic text-center py-2">{t('ministrySpace', 'noAnswersYet', 'No answers yet — be the first to share insight.')}</p>
                                )}
                                {q.answers
                                  .slice()
                                  .sort((a: any, b: any) => (b.is_accepted ? 1 : 0) - (a.is_accepted ? 1 : 0) || b.upvotes - a.upvotes)
                                  .map((ans: any) => (
                                    <div key={ans.id} className={`rounded-lg p-3 space-y-2 ${ans.is_accepted ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-100'}`}>
                                      {ans.is_accepted && (
                                        <div className="flex items-center gap-1 text-green-600 text-xs font-semibold">
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                          {t('ministrySpace', 'acceptedAnswer', 'Accepted Answer')}
                                        </div>
                                      )}
                                      <p className="text-sm text-gray-800 break-words">{ans.content}</p>
                                      <p className="text-xs text-gray-400">{ans.author} · {new Date(ans.created_at).toLocaleDateString()}</p>
                                      <div className="flex items-center gap-3">
                                        <button
                                          onClick={() => handleMUpvoteAnswer(q.id, ans.id)}
                                          className={`flex items-center gap-1 text-xs transition-colors ${ans.upvoted ? 'text-blue-600 font-semibold' : 'text-gray-400 hover:text-blue-500'}`}
                                        >
                                          <ThumbsUp className={`h-3 w-3 ${ans.upvoted ? 'fill-current' : ''}`} />
                                          {ans.upvotes} {t('ministrySpace', 'helpful', 'helpful')}
                                        </button>
                                        {user && q.user_id === user.id && !ans.is_accepted && (
                                          <button
                                            onClick={() => handleMAcceptAnswer(q.id, ans.id)}
                                            className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700"
                                          >
                                            <CheckCircle2 className="h-3 w-3" />
                                            {t('ministrySpace', 'acceptAnswer', 'Accept answer')}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))
                                }
                                {user && (
                                  <div className="flex gap-2 pt-1">
                                    <Textarea
                                      value={mAnswerDrafts[q.id] || ''}
                                      onChange={e => setMAnswerDrafts(prev => ({ ...prev, [q.id]: e.target.value }))}
                                      placeholder={t('ministrySpace', 'answerInsightPlaceholder', 'Share your insight or understanding…')}
                                      rows={2}
                                      className="flex-1 text-sm"
                                    />
                                    <Button
                                      size="sm"
                                      className="bg-blue-600 hover:bg-blue-700 text-white self-end"
                                      onClick={() => handleMPostAnswer(q.id)}
                                      disabled={!mAnswerDrafts[q.id]?.trim()}
                                    >
                                      <Send className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                                {!user && (
                                  <p className="text-xs text-gray-400 text-center py-1">{t('ministrySpace', 'signInToAnswer', 'Sign in to post an answer.')}</p>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))
                    }
                    {mQuestions.filter(q => mQaFilter === 'all' ? true : mQaFilter === 'open' ? !q.is_resolved : q.is_resolved).length === 0 && (
                      <div className="text-center py-12 text-gray-400">
                        <HelpCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
                        <p className="font-medium">{t('ministrySpace', 'noQuestionsYet', 'No questions yet.')}</p>
                        <p className="text-sm mt-1">{t('ministrySpace', 'beFirstSeekClarity', 'Be the first to seek clarity from this community.')}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Interactive Meetings Tab */}
        {activeTab === 'meetings' && (
          <MinistryInteractiveMeetings
            ministryId={ministry.id}
            isLeader={membership?.is_leader || false}
            themeColor={themeColor}
          />
        )}

        {/* Small Groups — Discover Tab */}
        {activeTab === 'discover-groups' && (
          <DiscoverSmallGroups ministryId={ministry.id} />
        )}

        {/* Small Groups — My Groups Tab */}
        {activeTab === 'my-groups' && (
          <MySmallGroups ministryId={ministry.id} />
        )}

        {/* Prayer Library Tab */}
        {activeTab === 'prayer' && (
          <div className="space-y-4">
            {prayerSubTab === 'ministry' && (
            <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">{t('ministrySpace', 'ministryPrayerLibrary', 'Ministry Prayer Library')}</h2>
              <div className="flex items-center gap-2">
                <Input
                  placeholder={t('ministrySpace', 'searchPrayersPlaceholder', 'Search prayers...')}
                  value={prayerSearchTerm}
                  onChange={(e) => setPrayerSearchTerm(e.target.value)}
                  className="w-64"
                />
              </div>
            </div>

            {/* Prayer Categories Filter */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              <Button
                variant={prayerCategoryFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPrayerCategoryFilter('all')}
                style={prayerCategoryFilter === 'all' ? { backgroundColor: themeColor } : {}}
              >
                {t('ministrySpace', 'allPrayers', 'All Prayers')}
              </Button>
              {['Morning', 'Evening', 'Healing', 'Protection', 'Thanksgiving', 'Intercession', 'Guidance'].map(cat => (
                <Button
                  key={cat}
                  variant={prayerCategoryFilter === cat ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPrayerCategoryFilter(cat)}
                  style={prayerCategoryFilter === cat ? { backgroundColor: themeColor } : {}}
                >
                  {cat}
                </Button>
              ))}
            </div>

            {/* Prayer Campaigns */}
            {prayerCampaigns.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">{t('ministrySpace', 'activePrayerCampaigns', 'Active Prayer Campaigns')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {prayerCampaigns.map(campaign => (
                    <Card key={campaign.id} className="overflow-hidden">
                      {campaign.banner_image && (
                        <div className="h-32 bg-gradient-to-r from-purple-500 to-pink-500 relative">
                          <img 
                            src={campaign.banner_image} 
                            alt={campaign.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <CardContent className="p-4">
                        <h4 className="font-semibold mb-2">{campaign.title}</h4>
                        {campaign.description && (
                          <p className="text-sm text-gray-600 mb-3">{campaign.description}</p>
                        )}
                        <div className="flex items-center justify-between text-sm">
                          <Badge>{campaign.theme || t('ministrySpace', 'prayerCampaign', 'Prayer Campaign')}</Badge>
                          <span className="text-gray-500">{t('ministrySpace', 'prayersCount', '{count} prayers').replace('{count}', String(campaign.prayer_count))}</span>
                        </div>
                        {campaign.start_date && campaign.end_date && (
                          <p className="text-xs text-gray-500 mt-2">
                            {new Date(campaign.start_date).toLocaleDateString()} - {new Date(campaign.end_date).toLocaleDateString()}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Prayer Library Grid */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: themeColor }} />
              </div>
            ) : prayers.filter(p => 
              (prayerCategoryFilter === 'all' || p.category === prayerCategoryFilter) &&
              (prayerSearchTerm === '' || 
                p.title.toLowerCase().includes(prayerSearchTerm.toLowerCase()) ||
                p.content.toLowerCase().includes(prayerSearchTerm.toLowerCase()) ||
                p.tags.some(tag => tag.toLowerCase().includes(prayerSearchTerm.toLowerCase()))
              )
            ).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {prayers.filter(p => 
                  (prayerCategoryFilter === 'all' || p.category === prayerCategoryFilter) &&
                  (prayerSearchTerm === '' || 
                    p.title.toLowerCase().includes(prayerSearchTerm.toLowerCase()) ||
                    p.content.toLowerCase().includes(prayerSearchTerm.toLowerCase()) ||
                    p.tags.some(tag => tag.toLowerCase().includes(prayerSearchTerm.toLowerCase()))
                  )
                ).map(prayer => (
                  <Card 
                    key={prayer.id} 
                    className="cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => {
                      setSelectedPrayer(prayer);
                      setShowPrayerReader(true);
                    }}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg">{prayer.title}</CardTitle>
                        <Badge variant="secondary">{prayer.category}</Badge>
                      </div>
                      {prayer.scripture_reference && (
                        <p className="text-sm text-gray-600 flex items-center gap-1 mt-2">
                          <BookOpen className="h-3 w-3" />
                          {prayer.scripture_reference}
                        </p>
                      )}
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-700 line-clamp-3 mb-3">
                        {prayer.content}
                      </p>
                      {prayer.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {prayer.tags.slice(0, 3).map(tag => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {prayer.tags.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{prayer.tags.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Heart className="h-3 w-3" />
                          {t('ministrySpace', 'prayedCount', '{count} prayed').replace('{count}', String(prayer.prayer_count))}
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {t('ministrySpace', 'viewsCount', '{count} views').replace('{count}', String(prayer.view_count))}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); shareMinistryPrayer(prayer); }}
                            title={t('ministrySpace', 'sharePrayer', 'Share prayer')}
                            aria-label={t('ministrySpace', 'sharePrayer', 'Share prayer')}
                            className="flex items-center gap-1 rounded-full px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-purple-700"
                          >
                            <Share2 className="h-3.5 w-3.5" /> {t('ministrySpace', 'share', 'Share')}
                          </button>
                        </span>
                      </div>
                      {prayer.audio_url && (
                        <div className="mt-3 flex items-center gap-1 text-xs" style={{ color: themeColor }}>
                          <Play className="h-3 w-3" />
                          {t('ministrySpace', 'audioAvailable', 'Audio available')}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <Heart className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-700">{t('ministrySpace', 'noPrayersFound', 'No Prayers Found')}</h3>
                <p className="text-gray-500">
                  {prayerSearchTerm || prayerCategoryFilter !== 'all'
                    ? t('ministrySpace', 'adjustFiltersSearch', 'Try adjusting your filters or search term')
                    : t('ministrySpace', 'prayerContentSoon', 'Ministry prayer content will be available here soon')}
                </p>
              </Card>
            )}
            </div>
            )}
            {prayerSubTab === 'library' && <PrayerLibrary />}
            {prayerSubTab === 'journal' && <PrayerJournal />}
            {prayerSubTab === 'wall' && <CommunityPrayerWall />}
          </div>
        )}
          </div>
        </div>
      </div>

      {/* Announcement Modal */}
      <Dialog open={showAnnouncementModal} onOpenChange={setShowAnnouncementModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ministrySpace', 'newAnnouncement', 'New Announcement')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('ministrySpace', 'titleRequiredLabel', 'Title *')}</Label>
              <Input
                value={announcementForm.title}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                placeholder={t('ministrySpace', 'announcementTitlePlaceholder', 'Announcement title')}
              />
            </div>
            <div>
              <Label>{t('ministrySpace', 'contentLabel', 'Content')}</Label>
              <Textarea
                value={announcementForm.content}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, content: e.target.value })}
                placeholder={t('ministrySpace', 'announcementDetailsPlaceholder', 'Announcement details...')}
                rows={4}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="pinned"
                checked={announcementForm.is_pinned}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, is_pinned: e.target.checked })}
              />
              <Label htmlFor="pinned">{t('ministrySpace', 'pinThisAnnouncement', 'Pin this announcement')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAnnouncementModal(false)}>{t('ministrySpace', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleCreateAnnouncement} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('ministrySpace', 'postAnnouncement', 'Post Announcement')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prayer Request Modal */}
      <Dialog open={showPrayerModal} onOpenChange={setShowPrayerModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ministrySpace', 'submitPrayerRequest', 'Submit Prayer Request')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('ministrySpace', 'titleRequiredLabel', 'Title *')}</Label>
              <Input
                value={prayerForm.title}
                onChange={(e) => setPrayerForm({ ...prayerForm, title: e.target.value })}
                placeholder={t('ministrySpace', 'prayerRequestTitlePlaceholder', 'Prayer request title')}
              />
            </div>
            <div>
              <Label>{t('ministrySpace', 'detailsOptionalLabel', 'Details (optional)')}</Label>
              <Textarea
                value={prayerForm.content}
                onChange={(e) => setPrayerForm({ ...prayerForm, content: e.target.value })}
                placeholder={t('ministrySpace', 'prayerRequestDetailsPlaceholder', 'Share more details about your prayer request...')}
                rows={4}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="anonymous"
                checked={prayerForm.is_anonymous}
                onChange={(e) => setPrayerForm({ ...prayerForm, is_anonymous: e.target.checked })}
              />
              <Label htmlFor="anonymous">{t('ministrySpace', 'submitAnonymously', 'Submit anonymously')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPrayerModal(false)}>{t('ministrySpace', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleCreatePrayerRequest} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('ministrySpace', 'submitRequest', 'Submit Request')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Testimony Modal */}
      <Dialog open={showTestimonyModal} onOpenChange={setShowTestimonyModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ministrySpace', 'shareYourTestimony', 'Share Your Testimony')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('ministrySpace', 'titleRequiredLabel', 'Title *')}</Label>
              <Input
                value={testimonyForm.title}
                onChange={(e) => setTestimonyForm({ ...testimonyForm, title: e.target.value })}
                placeholder={t('ministrySpace', 'testimonyTitlePlaceholder', 'Give your testimony a title')}
              />
            </div>
            <div>
              <Label>{t('ministrySpace', 'yourTestimonyRequiredLabel', 'Your Testimony *')}</Label>
              <Textarea
                value={testimonyForm.content}
                onChange={(e) => setTestimonyForm({ ...testimonyForm, content: e.target.value })}
                placeholder={t('ministrySpace', 'testimonyContentPlaceholder', 'Share what God has done in your life...')}
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTestimonyModal(false)}>{t('ministrySpace', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleCreateTestimony} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('ministrySpace', 'shareTestimony', 'Share Testimony')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prayer Reader with DevotionalModule */}
      {showPrayerReader && selectedPrayer && (
        <DevotionalModule
          entry={{
            id: selectedPrayer.id,
            series_id: selectedPrayer.campaign_id,
            day_number: 1,
            title: selectedPrayer.title,
            scripture_reference: selectedPrayer.scripture_reference,
            scripture_text: selectedPrayer.scripture_text,
            content: selectedPrayer.content,
            prayer: selectedPrayer.content,
            audio_url: selectedPrayer.audio_url,
            is_bookmarked: false
          }}
          seriesTitle={ministry.name}
          shareUrl={`${window.location.origin}/ministry-prayer/${selectedPrayer.id}`}
          onComplete={async () => {
            // Increment prayer count
            try {
              const { error } = await supabase
                .from('ministry_prayer_library')
                .update({ 
                  prayer_count: selectedPrayer.prayer_count + 1,
                  view_count: selectedPrayer.view_count + 1
                })
                .eq('id', selectedPrayer.id);
              
              if (!error) {
                loadMinistryData();
              }
            } catch (err) {
              console.error('Error updating prayer stats:', err);
            }
            setShowPrayerReader(false);
          }}
          onClose={() => {
            // Just increment view count
            try {
              supabase
                .from('ministry_prayer_library')
                .update({ view_count: selectedPrayer.view_count + 1 })
                .eq('id', selectedPrayer.id);
            } catch (err) {
              console.error('Error updating view count:', err);
            }
            setShowPrayerReader(false);
          }}
        />
      )}

      {/* Devotional Reader */}
      {showDevotionalModule && selectedDevotional && (
        <DevotionalModule
          entry={{
            id: selectedDevotional.id,
            series_id: selectedDevotional.series_id,
            day_number: selectedDevotional.day_number || 1,
            title: selectedDevotional.title,
            scripture_reference: selectedDevotional.scripture_reference,
            scripture_text: selectedDevotional.scripture_text,
            bible_passage_reference: selectedDevotional.bible_passage_reference,
            bible_passage_text: selectedDevotional.bible_passage_text,
            scripture_references: selectedDevotional.scripture_references,
            content: selectedDevotional.content,
            reflection_questions: selectedDevotional.reflection_questions,
            prayer: selectedDevotional.prayer_focus,
            audio_url: selectedDevotional.audio_url,
            video_url: selectedDevotional.video_url,
            cover_image_url: selectedDevotional.featured_image || selectedDevotional.cover_image_url,
            background_music_id: selectedDevotional.background_music_id,
            is_bookmarked: false
          }}
          seriesTitle={ministry.name}
          totalDays={1}
          shareUrl={`${window.location.origin}/ministry-devotional/${selectedDevotional.id}`}
          onComplete={async () => {
            // Mark devotional as completed
            try {
              const { error } = await supabase
                .from('ministry_devotionals')
                .update({ 
                  completion_count: (selectedDevotional.completion_count || 0) + 1,
                  view_count: (selectedDevotional.view_count || 0) + 1
                })
                .eq('id', selectedDevotional.id);
              
              if (!error) {
                loadMinistryData();
              }
            } catch (err) {
              console.error('Error updating devotional stats:', err);
            }
            setShowDevotionalModule(false);
          }}
          onClose={() => {
            // Just increment view count
            try {
              supabase
                .from('ministry_devotionals')
                .update({ view_count: (selectedDevotional.view_count || 0) + 1 })
                .eq('id', selectedDevotional.id);
            } catch (err) {
              console.error('Error updating view count:', err);
            }
            setShowDevotionalModule(false);
          }}
        />
      )}
    </div>
    </TakeDeclarationContext.Provider>
  );
};

export default MinistrySpace;