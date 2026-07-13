import React, { useState, useEffect, useCallback } from 'react';
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
import { toast } from '@rekindle/ui/use-toast';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { useUserEntitlements } from '@rekindle/auth/useUserEntitlements';
import {
  ArrowLeft, Home, BookOpen, Heart, Calendar, MessageSquare,
  Megaphone, Gift, Video, Users, Settings, Crown, Shield,
  Plus, Loader2, Clock, Pin, Send, Building2, ChevronRight,
  Lock, Star, Edit, Trash2, Eye, LayoutDashboard, Play, Radio,
  HelpCircle, ThumbsUp, CheckCircle2, ChevronDown, ChevronUp, Book, Sparkles, Menu, Share2, ScrollText
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
import { DevotionalModule } from '@rekindle/features/components/DevotionalModule';
import { MinistryInteractiveMeetings } from './MinistryInteractiveMeetings';
import { MLiveChannel } from './MLiveChannel';
import { MinistryDonationForm } from './MinistryDonationForm';
import { MinistryWhatsAppOptIn } from '@rekindle/features/components/WhatsAppOptIn';
import MinistryContentManager from './MinistryContentManager';
import { getFeatureSource, fetchFeatureContent } from '@rekindle/features/contentSource';

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

interface MinistrySpaceProps {
  ministry: Ministry;
  membership?: MembershipInfo;
  onExit: () => void;
}

const MinistrySpace: React.FC<MinistrySpaceProps> = ({ ministry, membership, onExit }) => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const entitlements = useUserEntitlements();
  
  const [activeTab, setActiveTab] = useState('home');
  const [communitySubTab, setCommunitySubTab] = useState<'revelations' | 'qa'>('revelations');

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
  
  // Subscription-based permissions
  const hasOwnMinistryAccess = entitlements.hasMinistryAccess;
  const canManageTeam = entitlements.canManageTeam;
  const canCustomizeDashboard = entitlements.can_customize_dashboard;
  const canUseMinistryBranding = entitlements.can_use_ministry_branding;
  const canUseWhiteLabel = entitlements.canUseWhiteLabel;

  // Management access follows the MINISTRY's subscription (the owner's tier), not each
  // individual leader's personal subscription. So a leader/admin the owner designates can
  // manage a ministry whose owner holds a Ministry tier, without their own subscription.
  const [ownerHasMinistryAccess, setOwnerHasMinistryAccess] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // If the current user already has access, or isn't a leader/admin, no owner lookup needed.
      if (hasOwnMinistryAccess || !canManageMinistry) { setOwnerHasMinistryAccess(false); return; }
      if (!ministry.owner_id || ministry.owner_id === user?.id) { setOwnerHasMinistryAccess(false); return; }
      const { data, error } = await supabase
        .from('user_profiles')
        .select('subscription_tier')
        .eq('user_id', ministry.owner_id)
        .maybeSingle();
      if (error) { if (!cancelled) setOwnerHasMinistryAccess(false); return; }
      const tier = (data as any)?.subscription_tier || '';
      const ministryTiers = ['ministry', 'ministry_plus', 'ministry_starter', 'ministry_growth', 'ministry_enterprise'];
      const ownerAccess = ministryTiers.includes(tier);
      if (!cancelled) setOwnerHasMinistryAccess(ownerAccess);
    })();
    return () => { cancelled = true; };
  }, [ministry.owner_id, user?.id, hasOwnMinistryAccess, canManageMinistry]);

  // Effective access used to gate the Manage Ministry button + management features.
  const hasMinistryAccess = hasOwnMinistryAccess || ownerHasMinistryAccess;

  // Block access if neither the user nor the ministry's owner has Ministry tier.
  const showMinistryFeatureUpgradePrompt = isLeader && !hasMinistryAccess;

  const loadMinistryData = useCallback(async () => {
    setLoading(true);
    try {
      const [announcementsRes, eventsRes, prayersRes, testimoniesRes, devotionalsRes, prayerLibraryRes, campaignsRes] = await Promise.all([
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
          // Local end-of-day boundary so today's devotional (with a daytime
          // timestamp) is included rather than yesterday's. Matches the home widget.
          .or(`scheduled_date.is.null,scheduled_date.lte.${endOfLocalDayISO()}`)
          .order('scheduled_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(10),
        supabase.from('ministry_prayer_library').select('*').eq('ministry_id', ministry.id).eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('prayer_campaigns').select('*').eq('ministry_id', ministry.id).eq('is_active', true).order('created_at', { ascending: false })
      ]);

      setAnnouncements(announcementsRes.data || []);
      setEvents(eventsRes.data || []);
      setPrayerRequests(prayersRes.data || []);
      setTestimonies(testimoniesRes.data || []);

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
    } catch (err) {
      console.error('Error loading ministry data:', err);
    } finally {
      setLoading(false);
    }
  }, [ministry.id]);

  useEffect(() => {
    loadMinistryData();
  }, [loadMinistryData]);

  // Load community data when community tab is first activated
  useEffect(() => {
    if (activeTab === 'community' && ministry?.id) {
      loadMinistryCommunity();
    }
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

  // Leaders/admins get an extra "Content" tab to manage declarations & affirmations.
  const navItems: { id: string; label: string; icon: any }[] = canManageMinistry
    ? [...MINISTRY_NAV, { id: 'content', label: 'Content', icon: Sparkles }]
    : [...MINISTRY_NAV];

  // Per-ministry module toggle (ministry_groups.settings.modules); unknown keys default on.
  const moduleOn = (key: string): boolean => {
    const m = (ministry.settings as any)?.modules;
    return m && typeof m === 'object' && key in m ? !!m[key] : true;
  };

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* DevotionalModule Overlay */}
      {showDevotionalModule && selectedDevotional && (
        <DevotionalModule
          entry={selectedDevotional}
          seriesTitle={t('ministrySpace', 'ministryDevotionalSeries', 'Ministry Devotional')}
          totalDays={1}
          ministryName={ministry?.name}
          shareUrl={`${window.location.origin}/ministry-devotional/${selectedDevotional.id}`}
          onComplete={() => {
            markDevotionalComplete(selectedDevotional.id);
            setShowDevotionalModule(false);
          }}
          onClose={() => setShowDevotionalModule(false)}
        />
      )}

      {/* Sticky header + navigation (kept together so the nav never overlaps
          the variable-height header on mobile). */}
      <div className="sticky top-0 z-40">
        {/* Ministry Header */}
        <div className="shadow-md" style={{ backgroundColor: themeColor }}>
          <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3">
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

                {/* Back to Rekindle (exit) — below the member section.
                    Mobile only; on web it lives in the left sidebar. */}
                <Button
                  onClick={onExit}
                  size="sm"
                  className="md:hidden bg-white/15 text-white hover:bg-white/25 border border-white/40"
                >
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  {t('ministrySpace', 'backToRekindle', 'Back to Rekindle')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Ministry Navigation — mobile only (web uses the left sidebar).
            Hamburger (labelled) menu + horizontal icon tabs. */}
        <div className="bg-white border-b md:hidden">
          <div className="max-w-7xl mx-auto px-2 sm:px-4">
            <div className="flex items-center gap-1 py-2">
              {/* Mobile menu button: tap to reveal navigation with text labels */}
              <div className="relative sm:hidden shrink-0">
                <button
                  onClick={() => setNavMenuOpen((o) => !o)}
                  aria-label={t('ministrySpace', 'openNavMenu', 'Open navigation menu')}
                  aria-expanded={navMenuOpen}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
                >
                  <Menu className="h-5 w-5" />
                  <span className="max-w-[6.5rem] truncate">
                    {(() => {
                      const current = navItems.find((item) => item.id === activeTab);
                      return current ? navLabel(current) : t('ministrySpace', 'menu', 'Menu');
                    })()}
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${navMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {navMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setNavMenuOpen(false)} />
                    <div className="absolute left-0 top-full mt-1 z-50 w-60 max-h-[70vh] overflow-y-auto rounded-xl border bg-white shadow-xl py-1">
                      {navItems.map((tab) => {
                        const Icon = tab.icon;
                        const active = activeTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => { setActiveTab(tab.id); setNavMenuOpen(false); }}
                            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${active ? 'font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                            style={active ? { color: themeColor, backgroundColor: `${themeColor}14` } : {}}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            {navLabel(tab)}
                          </button>
                        );
                      })}
                      {/* Switch Ministry — return to the ministries list to pick another */}
                      <div className="my-1 border-t border-gray-100" />
                      <button
                        onClick={() => { setNavMenuOpen(false); onExit(); }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Users className="h-4 w-4 shrink-0" />
                        {t('ministrySpace', 'switchMinistry', 'Switch Ministry')}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Icon tab row (labels appear from sm+) */}
              <div className="flex gap-1 overflow-x-auto">
                {navItems.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                        activeTab === tab.id
                          ? 'text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                      style={activeTab === tab.id ? { backgroundColor: themeColor } : {}}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="hidden sm:inline">{navLabel(tab)}</span>
                    </button>
                  );
                })}
              </div>
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
                onClick={() => window.location.href = '/subscribe'}
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
          <aside className="hidden md:flex w-64 shrink-0 sticky top-24 self-start rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex w-full flex-col">
              {/* Ministry identity + Back to Rekindle directly beneath it */}
              <div className="border-b border-gray-100 p-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                    style={{ backgroundColor: `${themeColor}1a` }}
                  >
                    {ministry.logo_url ? (
                      <img src={ministry.logo_url} alt={ministry.name} className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <Building2 className="h-5 w-5" style={{ color: themeColor }} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{ministry.name}</p>
                    <p className="text-xs text-gray-500">{t('ministrySpace', 'membersCount', '{count} members').replace('{count}', String(ministry.member_count))}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onExit}
                  className="w-full justify-start mt-3"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t('ministrySpace', 'backToRekindle', 'Back to Rekindle')}
                </Button>
              </div>

              {/* Vertical navigation */}
              <nav className="flex flex-col gap-1 p-3" aria-label={t('ministrySpace', 'ministryNavigation', '{name} navigation').replace('{name}', ministry.name)}>
                {navItems.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                        active ? 'text-white shadow-sm' : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                      style={active ? { backgroundColor: themeColor } : {}}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{navLabel(tab)}</span>
                    </button>
                  );
                })}
              </nav>

              {/* Switch Ministry */}
              <div className="mt-auto border-t border-gray-100 p-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onExit}
                  className="w-full justify-start"
                >
                  <Users className="h-4 w-4 mr-2" />
                  {t('ministrySpace', 'switchMinistry', 'Switch Ministry')}
                </Button>
              </div>
            </div>
          </aside>

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

        {/* Home Tab */}
        {activeTab === 'home' && (
          <div className="space-y-6">

            {/* Welcome Banner */}
            <Card className="overflow-hidden">
              <div
                className="flex items-end p-6 min-h-[96px]"
                style={{
                  background: `linear-gradient(135deg, ${themeColor} 0%, ${themeColor}cc 100%)`
                }}
              >
                <div className="text-white w-full">
                  <h2 className="text-lg md:text-2xl font-bold truncate">{t('ministrySpace', 'welcomeTo', 'Welcome to {name}').replace('{name}', ministry.name)}</h2>
                  {(ministry.welcome_message || ministry.description) && (
                    <p className="opacity-90 text-sm mt-1 line-clamp-2">
                      {ministry.welcome_message || ministry.description}
                    </p>
                  )}
                </div>
              </div>
            </Card>

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

              {/* Active Prayer Points */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Heart className="h-5 w-5" style={{ color: themeColor }} />
                    {t('ministrySpace', 'prayerRequests', 'Prayer Requests')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {prayerRequests.length > 0 ? (
                    <div className="space-y-3">
                      {prayerRequests.slice(0, 3).map(prayer => (
                        <div key={prayer.id} className="p-3 bg-gray-50 rounded-lg">
                          <p className="font-medium text-sm">{prayer.title}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-gray-500">
                              {t('ministrySpace', 'prayersCount', '{count} prayers').replace('{count}', String(prayer.prayer_count))}
                            </span>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => handlePrayForRequest(prayer.id, prayer.prayer_count)}
                            >
                              <Heart className="h-3 w-3 mr-1" />
                              {t('ministrySpace', 'pray', 'Pray')}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-4 text-sm">{t('ministrySpace', 'noPrayerRequestsShort', 'No prayer requests')}</p>
                  )}
                  <Button 
                    variant="outline" 
                    className="w-full mt-3"
                    onClick={() => setActiveTab('requests')}
                  >
                    {t('ministrySpace', 'viewAll', 'View All')}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Today's Declaration & Affirmation — source-aware (ReKindle / own / both),
                module-gated, hidden when the resolved source yields nothing. */}
            {(() => {
              const decOn = moduleOn('declarations');
              const affOn = moduleOn('affirmations');
              const todaysDec = decOn ? pickDaily(declarations) : null;
              const todaysAff = affOn ? pickDaily(affirmations) : null;
              if (!todaysDec && !todaysAff) return null;
              return (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {todaysDec && (
                    <Card className="overflow-hidden">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <ScrollText className="h-5 w-5" style={{ color: themeColor }} />
                          {t('ministrySpace', 'todaysDeclaration', "Today's Declaration")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {todaysDec.title && <p className="text-sm font-semibold">{todaysDec.title}</p>}
                        <p className="text-sm leading-relaxed text-gray-700">&ldquo;{todaysDec.text}&rdquo;</p>
                        {todaysDec.scripture_reference && (
                          <p className="text-xs font-medium" style={{ color: themeColor }}>{todaysDec.scripture_reference}</p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                  {todaysAff && (
                    <Card className="overflow-hidden">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Sparkles className="h-5 w-5" style={{ color: themeColor }} />
                          {t('ministrySpace', 'todaysAffirmation', "Today's Affirmation")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {todaysAff.title && <p className="text-sm font-semibold">{todaysAff.title}</p>}
                        <p className="text-sm leading-relaxed text-gray-700">&ldquo;{todaysAff.text}&rdquo;</p>
                        {todaysAff.scripture_reference && (
                          <p className="text-xs font-medium" style={{ color: themeColor }}>{todaysAff.scripture_reference}</p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              );
            })()}

            {/* WhatsApp opt-in — only rendered if ministry has an active WhatsApp connection */}
            <MinistryWhatsAppOptIn
              ministryId={ministry.id}
              ministryName={ministry.name}
            />

            {/* Announcements */}
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
                      <div key={ann.id} className="p-4 border rounded-lg">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              {ann.is_pinned && <Pin className="h-4 w-4 text-amber-500" />}
                              <h4 className="font-semibold">{ann.title}</h4>
                            </div>
                            <p className="text-gray-600 mt-1 text-sm">{ann.content}</p>
                          </div>
                          <span className="text-xs text-gray-400">
                            {new Date(ann.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">{t('ministrySpace', 'noAnnouncementsYet', 'No announcements yet')}</p>
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

            {/* Sub-tab bar */}
            <div className="flex border-b border-gray-200 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setCommunitySubTab('revelations')}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px whitespace-nowrap ${
                  communitySubTab === 'revelations'
                    ? 'border-purple-600 text-purple-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Book className="h-4 w-4" />
                {t('ministrySpace', 'revelations', 'Revelations')}
              </button>
              <button
                onClick={() => setCommunitySubTab('qa')}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px whitespace-nowrap ${
                  communitySubTab === 'qa'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <HelpCircle className="h-4 w-4" />
                {t('ministrySpace', 'gotQuestionsSeekClarity', 'Got Questions? Seek Clarity')}
              </button>
            </div>

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

        {/* Prayer Library Tab */}
        {activeTab === 'prayer' && (
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
  );
};

export default MinistrySpace;