import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CommunityRevelationsManager } from './CommunityRevelationsManager';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';
import { ScriptureSelector, ScriptureReference } from './ScriptureSelector';
import { MusicSelector } from './MusicSelector';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { EmailNotificationManager } from './EmailNotificationManager';
import { AdminNotificationComposer } from './AdminNotificationComposer';
import { DonationsManagement } from './DonationsManagement';
import { AdminDevotionalLibraryManager } from './AdminDevotionalLibraryManager';
import { AdminDevotionalStreamsManager } from './AdminDevotionalStreamsManager';
import { MinistryGroupsManager } from './MinistryGroupsManager';
import { AdminLeaderboard } from './AdminLeaderboard';
import { AdminPrayerLibrary } from './AdminPrayerLibrary';
import { BroadcastMessaging } from './BroadcastMessaging';
import { CommunityPrayerManager } from './CommunityPrayerManager';
import { PrayerChallengeBackendManager } from './PrayerChallengeBackendManager';
import { AdminCounsellorManager } from './AdminCounsellorManager';
import { AdminBookManager } from './AdminBookManager';
import PlatformAdminDashboard from './platform-admin/PlatformAdminDashboard';
import { AICompanionAdminSettings } from './AiCompanionAdminSettings';
import { ReferralAdminManager } from './ReferralAdminManager';
import { ReadingPlanManager } from './ReadingPlanManager';
import { AdminLiveChannelManager } from './AdminLiveChannelManager';
import { AdminSubscriptionManager } from './AdminSubscriptionManager';
import { AdminTranslationDashboard } from './AdminTranslationDashboard';
import { LanguageManager } from './platform-admin/LanguageManager';
import { ContentTranslationManager } from './ContentTranslationManager';
import { AdminDeclarationManager } from './AdminDeclarationManager';
import { AdminAffirmationManager } from './AdminAffirmationManager';
// NEW: Import Bulk TTS Component
import { AdminBulkTTSPanel } from './AdminBulkTTSPanel';
import { AdminBroadcastLogViewer } from './AdminBroadcastLogViewer';
import { AdminWhatsAppManager } from './AdminWhatsAppManager';
import { UniversalTTSExportButton } from './UniversalTTSExportButton';
import { 
  Users, Shield, BookOpen, Music, FileText, Trophy,
  Trash2, Edit, Plus, Upload, Calendar, Clock, Search, RefreshCw,
  Heart, MessageSquare, Bell, Bookmark, Mic, Video, DollarSign,
  Send, Mail, Phone, Star, Book, UserCheck, Settings, Radio,
  BarChart3, TrendingUp, Crown, Lock, AlertTriangle, Loader2, Church,
  Menu, X, ChevronDown, Building2, Download, Languages, Globe, Layers
} from 'lucide-react';
import { fetchScripture, BIBLE_VERSIONS } from '@/lib/bibleApi';
import { useLanguage } from '@/contexts/LanguageContext';


// Constants
const LOAD_TIMEOUT = 12000;
const SAVE_TIMEOUT = 8000;

// Props interface
interface AdminDashboardProps {
  isSuperAdmin?: boolean;
}

// File Upload Component
const FileUploadButton: React.FC<{
  accept: string;
  onUpload: (url: string) => void;
  folder: string;
  label: string;
  bucket?: string; // Add optional bucket parameter
}> = ({ accept, onUpload, folder, label, bucket = 'admin-content' }) => { // Default to admin-content
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileName = `${folder}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const { data, error } = await supabase.storage
        .from(bucket) // Use the bucket parameter
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from(bucket) // Use the bucket parameter
        .getPublicUrl(fileName);

      onUpload(urlData.publicUrl);
      toast({ title: t('adminDashboard', 'success', 'Success'), description: t('adminDashboard', 'fileUploaded', 'File uploaded successfully') });
    } catch (err: any) {
      toast({ title: t('adminDashboard', 'uploadError', 'Upload Error'), description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleUpload}
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        <Upload className="h-4 w-4 mr-2" />
        {uploading ? t('adminDashboard', 'uploading', 'Uploading...') : label}
      </Button>
    </div>
  );
};

// Stat Card Component
const StatCard: React.FC<{
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}> = ({ icon: Icon, label, value, color }) => {
  const colorClasses: Record<string, string> = {
    purple: 'text-purple-500',
    red: 'text-red-500',
    blue: 'text-blue-500',
    green: 'text-green-500',
    orange: 'text-orange-500',
    indigo: 'text-indigo-500',
    pink: 'text-pink-500',
    amber: 'text-amber-500'
  };

  return (
    <Card>
      <CardContent className="p-4 text-center">
        <Icon className={`h-8 w-8 mx-auto mb-2 ${colorClasses[color]}`} />
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </CardContent>
    </Card>
  );
};

// Loading Skeleton
const AdminLoadingSkeleton: React.FC = () => {
  const { t } = useLanguage();
  return (
  <div className="min-h-screen bg-gray-50 p-6">
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">{t('adminDashboard', 'loadingDashboard', 'Loading admin dashboard...')}</p>
        </div>
      </div>
    </div>
  </div>
  );
};

// Error Fallback
const AdminErrorFallback: React.FC<{ onRetry: () => void }> = ({ onRetry }) => {
  const { t } = useLanguage();
  return (
  <div className="min-h-screen bg-gray-50 p-6">
    <div className="max-w-7xl mx-auto">
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-red-800 mb-2">{t('adminDashboard', 'failedToLoad', 'Failed to Load Dashboard')}</h3>
          <p className="text-red-600 mb-4">
            {t('adminDashboard', 'failedToLoadDesc', 'There was an error loading the admin dashboard. This might be due to a network issue.')}
          </p>
          <Button onClick={onRetry} variant="outline" className="border-red-300 text-red-700 hover:bg-red-100">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('adminDashboard', 'tryAgain', 'Try Again')}
          </Button>
        </CardContent>
      </Card>
    </div>
  </div>
  );
};

// Mobile Menu Component
const MobileMenu: React.FC<{
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: Array<{ value: string; label: string; icon?: React.ElementType }>;
}> = ({ activeTab, onTabChange, tabs }) => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  const handleTabSelect = (value: string) => {
    onTabChange(value);
    setIsOpen(false);
  };

  const activeTabLabel = tabs.find(tab => tab.value === activeTab)?.label || t('adminDashboard', 'menu', 'Menu');

  return (
    <div className="relative lg:hidden">
      <Button
        variant="outline"
        className="w-full justify-between"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="flex items-center gap-2">
          <Menu className="h-4 w-4" />
          {activeTabLabel}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black bg-opacity-25"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border z-50 max-h-96 overflow-y-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.value}
                  onClick={() => handleTabSelect(tab.value)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-2 border-b last:border-b-0 ${
                    activeTab === tab.value ? 'bg-purple-50 text-purple-700 font-medium' : ''
                  }`}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  {tab.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

// Main Admin Dashboard Component
const AdminDashboard: React.FC<AdminDashboardProps> = ({ isSuperAdmin = false }) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [loadingScripture, setLoadingScripture] = useState(false);
  const [scriptureVersion, setScriptureVersion] = useState('kjv');

  const handleLoadScripture = async () => {
    setLoadingScripture(true);
    try {
      const text = await fetchScripture(formData.scripture_reference || formData.scripture, scriptureVersion);
      setFormData((prev: any) => ({ ...prev, scripture_text: text }));
      toast({ title: t('adminDashboard', 'success', 'Success'), description: t('adminDashboard', 'scriptureLoaded', 'Scripture text loaded') });
    } catch (err: any) {
      toast({ title: t('adminDashboard', 'note', 'Note'), description: err.message || t('adminDashboard', 'couldNotLoadScripture', 'Could not load scripture'), variant: 'destructive' });
    } finally {
      setLoadingScripture(false);
    }
  };

  const [loadingBiblePassage, setLoadingBiblePassage] = useState(false);
  const [biblePassageVersion, setBiblePassageVersion] = useState('kjv');
  const handleLoadBiblePassage = async () => {
    setLoadingBiblePassage(true);
    try {
      const text = await fetchScripture(formData.bible_passage_reference, biblePassageVersion);
      setFormData((prev: any) => ({ ...prev, bible_passage_text: text }));
      toast({ title: t('adminDashboard', 'success', 'Success'), description: t('adminDashboard', 'biblePassageLoaded', 'Bible passage loaded') });
    } catch (err: any) {
      toast({ title: t('adminDashboard', 'note', 'Note'), description: err.message || t('adminDashboard', 'couldNotLoadPassage', 'Could not load passage'), variant: 'destructive' });
    } finally {
      setLoadingBiblePassage(false);
    }
  };
  const [searchTerm, setSearchTerm] = useState('');

  // State for different content types
  const [users, setUsers] = useState<any[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(0);
  const [userPageSize] = useState(100);
  const [usersLoading, setUsersLoading] = useState(false);
  const [devotionals, setDevotionals] = useState<any[]>([]);
  // Daily-devotional streams (0149) — the named feed each devotional is assigned to.
  const [devotionalStreams, setDevotionalStreams] = useState<{ id: string; name: string; is_default: boolean }[]>([]);
  const [music, setMusic] = useState<any[]>([]);
  const [affirmations, setAffirmations] = useState<any[]>([]);
  const [prayerWallPosts, setPrayerWallPosts] = useState<any[]>([]);
  const [donations, setDonations] = useState<any[]>([]);
  const [sponsors, setSponsors] = useState<any[]>([]);

  // Stats
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalDevotionals: 0,
    publishedDevotionals: 0,
    totalMusic: 0,
    totalPrayers: 0,
    totalDonations: 0,
    totalSponsors: 0
  });

  // Updated tabs array - Adding Bulk TTS tab
  const adminTabs = [
    { value: 'dashboard', label: t('adminDashboard', 'tabDashboard', 'Dashboard'), icon: BarChart3 },
    { value: 'users', label: t('adminDashboard', 'tabUsers', 'Users'), icon: Users },
    { value: 'subscriptions', label: t('adminDashboard', 'tabSubscriptions', 'Subscriptions'), icon: Crown },
    { value: 'devotionals', label: t('adminDashboard', 'devotionals', 'Devotionals'), icon: BookOpen },
    { value: 'devotional-library', label: t('adminDashboard', 'tabDevotionalLibrary', 'Devotional Library'), icon: Book },
    { value: 'devotional-streams', label: t('adminDashboard', 'tabDevotionalStreams', 'Devotional Streams'), icon: Layers },
    { value: 'bulk-tts', label: t('adminDashboard', 'tabBulkTts', 'Bulk TTS'), icon: Globe }, // NEW TAB
    { value: 'prayer-library', label: t('adminDashboard', 'tabPrayerLibrary', 'Prayer Library'), icon: Heart },
    { value: 'prayer-wall', label: t('adminDashboard', 'tabPrayerWall', 'Prayer Wall'), icon: MessageSquare },
    { value: 'prayer-challenges', label: t('adminDashboard', 'tabPrayerChallenges', 'Prayer Challenges'), icon: Trophy },
    { value: 'music', label: t('adminDashboard', 'tabMusic', 'Music'), icon: Music },
    { value: 'affirmations', label: t('adminDashboard', 'affirmations', 'Affirmations'), icon: Star },
    { value: 'declarations', label: t('adminDashboard', 'tabDeclarations', 'Declarations'), icon: Mic },
    { value: 'community-revelations', label: t('adminDashboard', 'tabCommunityRevelations', 'Community Revelations'), icon: Church },
    { value: 'ministry-groups', label: t('adminDashboard', 'tabMinistryGroups', 'Ministry Groups'), icon: Users },
    { value: 'mentors', label: t('adminDashboard', 'tabCounsellors', 'Counsellors'), icon: UserCheck },
    { value: 'books', label: t('adminDashboard', 'tabBooks', 'Books'), icon: Book },
    { value: 'reading-plans', label: t('adminDashboard', 'tabReadingPlans', 'Reading Plans'), icon: Calendar },
    { value: 'live-channels', label: t('adminDashboard', 'tabLiveChannels', 'Live Channels'), icon: Radio },
    { value: 'analytics', label: t('adminDashboard', 'tabAnalytics', 'Analytics'), icon: TrendingUp },
    { value: 'leaderboard', label: t('adminDashboard', 'tabLeaderboard', 'Leaderboard'), icon: Trophy },
    { value: 'donations-manage', label: t('adminDashboard', 'donations', 'Donations'), icon: DollarSign },
    { value: 'notifications', label: t('adminDashboard', 'tabNotifications', 'Notifications'), icon: Bell },
    { value: 'broadcast', label: t('adminDashboard', 'tabBroadcast', 'Broadcast'), icon: Send },
    { value: 'broadcast-history', label: t('adminDashboard', 'tabDelivery', 'Delivery'), icon: Clock },
    { value: 'whatsapp-admin', label: t('adminDashboard', 'tabWhatsappWallet', 'WhatsApp & Wallet'), icon: MessageSquare },
    { value: 'ai-companion', label: t('adminDashboard', 'tabAiCompanion', 'AI Companion'), icon: Settings },
    { value: 'referrals', label: t('adminDashboard', 'tabReferrals', 'Referrals'), icon: Users },
    { value: 'translations', label: t('adminDashboard', 'tabTranslations', 'Translations'), icon: Languages },
    { value: 'content-translation', label: t('adminDashboard', 'tabContentTranslation', 'Translate Content'), icon: FileText },
    { value: 'languages', label: t('adminDashboard', 'tabLanguages', 'Languages'), icon: Globe },
    ...(isSuperAdmin ? [{ value: 'platform-admin', label: t('adminDashboard', 'tabPlatformAdmin', 'Platform Admin'), icon: Shield }] : [])
  ];

  // Load all data
  const loadAllData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    
    const loadTimeout = setTimeout(() => {
      setLoadError(true);
      setLoading(false);
      toast({
        title: t('adminDashboard', 'loadingTimeout', 'Loading Timeout'),
        description: t('adminDashboard', 'loadingTimeoutDesc', 'Dashboard is taking longer than expected to load.'),
        variant: 'destructive'
      });
    }, LOAD_TIMEOUT);

    try {
      // Load users with pagination
      const loadUsers = async (page = 0) => {
        setUsersLoading(true);
        const from = page * userPageSize;
        const to   = from + userPageSize - 1;
        const { data, error, count } = await supabase
          .from('user_profiles')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, to);

        if (!error) {
          setUsers(data ?? []);
          setUserTotal(count ?? 0);
          setUserPage(page);
        } else {
          console.error('[AdminDashboard] user_profiles query error:', error);
        }
        setUsersLoading(false);
      };

      // Parallel data loading — users load independently so a slow user table
      // doesn't block devotionals, music, etc.
      const [
        devotionalsData,
        musicData,
        affirmationsData,
        prayerWallData,
        donationsData,
        sponsorsData
      ] = await Promise.all([
        supabase.from('devotionals').select('*').order('created_at', { ascending: false }),
        supabase.from('music').select('*').order('created_at', { ascending: false }).then(r => r.error?.code === 'PGRST116' || (r.error as any)?.status === 404 ? { data: [], error: null, count: null, status: 200, statusText: 'OK' } : r),
        supabase.from('affirmations').select('*').order('created_at', { ascending: false }),
        supabase.from('prayer_wall_posts').select('*').order('created_at', { ascending: false }),
        supabase.from('donations').select('*').order('created_at', { ascending: false }),
        supabase.from('sponsors').select('*').order('created_at', { ascending: false })
      ]);

      // Fire user load without awaiting so dashboard renders immediately
      loadUsers(0);

      if (devotionalsData.data) setDevotionals(devotionalsData.data);
      // Streams for the devotional form's stream selector (best-effort — the table
      // may not exist until migration 0149 runs).
      supabase.from('devotional_streams').select('id, name, is_default')
        .order('is_default', { ascending: false }).order('sort_order', { ascending: true })
        .then(({ data }) => { if (data) setDevotionalStreams(data as any); });
      if (musicData.data) setMusic(musicData.data);
      if (affirmationsData.data) setAffirmations(affirmationsData.data);
      if (prayerWallData.data) setPrayerWallPosts(prayerWallData.data);
      if (donationsData.data) setDonations(donationsData.data);
      if (sponsorsData.data) setSponsors(sponsorsData.data);

      // Get accurate user count for stats without fetching all rows
      const { count: totalUserCount } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true });

      const { count: activeUserCount } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })
        .gte('updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      // Calculate stats with accurate counts
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      setStats({
        totalUsers: totalUserCount ?? 0,
        activeUsers: activeUserCount ?? 0,
        totalDevotionals: devotionalsData.data?.length || 0,
        publishedDevotionals: devotionalsData.data?.filter((d: any) => d.is_published).length || 0,
        totalMusic: musicData.data?.length || 0,
        totalPrayers: prayerWallData.data?.length || 0,
        totalDonations: donationsData.data?.length || 0,
        totalSponsors: sponsorsData.data?.length || 0
      });

      clearTimeout(loadTimeout);
      setLoading(false);
    } catch (err: any) {
      clearTimeout(loadTimeout);
      console.error('Error loading data:', err);
      setLoadError(true);
      setLoading(false);
      toast({
        title: t('adminDashboard', 'errorLoadingData', 'Error Loading Data'),
        description: err.message,
        variant: 'destructive'
      });
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Create handler
  const handleCreate = (type: string) => {
    setModalType(type);
    setEditingItem(null);
    setFormData({});
    setShowModal(true);
  };

  // Edit handler
  const handleEdit = (type: string, item: any) => {
    setModalType(type);
    setEditingItem(item);
    setFormData(item);
    setShowModal(true);
  };

  // Open the devotional editor pre-scoped to a stream. Used by the Devotional
  // Streams manager's "Add devotional" action so authoring a MANUAL stream's
  // entry is one click (the fields live in the devotional form, not the stream
  // editor). Defaults the schedule date to today for convenience.
  const handleAddDevotionalToStream = (streamId: string) => {
    setActiveTab('devotionals');
    setModalType('devotional');
    setEditingItem(null);
    setFormData({ stream_id: streamId, schedule_date: new Date().toISOString() });
    setShowModal(true);
  };

  // Delete handler
  const handleDelete = async (type: string, id: string) => {
    if (!confirm(t('adminDashboard', 'confirmDelete', 'Are you sure you want to delete this item?'))) return;

    try {
      const tableMap: Record<string, string> = {
        user: 'user_profiles',
        devotional: 'devotionals',
        music: 'music',
        affirmation: 'affirmations'
      };

      const { error } = await supabase
        .from(tableMap[type])
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({ title: t('adminDashboard', 'success', 'Success'), description: t('adminDashboard', 'itemDeleted', 'Item deleted successfully') });
      loadAllData();
    } catch (err: any) {
      toast({ title: t('adminDashboard', 'deleteError', 'Delete Error'), description: err.message, variant: 'destructive' });
    }
  };

  // Save handler
  const handleSave = async () => {
    setSaving(true);
    
    const saveTimeout = setTimeout(() => {
      setSaving(false);
      toast({
        title: t('adminDashboard', 'saveTimeout', 'Save Timeout'),
        description: t('adminDashboard', 'saveTimeoutDesc', 'Saving is taking longer than expected.'),
        variant: 'destructive'
      });
    }, SAVE_TIMEOUT);

    try {
      const tableMap: Record<string, string> = {
        user: 'user_profiles',
        devotional: 'devotionals',
        music: 'music',
        affirmation: 'affirmations'
      };

      const table = tableMap[modalType];

      // Build a devotionals payload with ONLY real table columns. formData also
      // carries form-only fields (author, author_name, category, featured_image)
      // that are NOT columns on `devotionals`, so it must never be sent raw — that
      // was the "author column not found" 400 on create. Used for insert AND update.
      const buildDevotionalPayload = (): Record<string, any> => {
        const p: Record<string, any> = {
          title:                formData.title,
          message:              formData.message || formData.content,
          scripture:            formData.scripture || formData.scripture_reference,
          scripture_text:       formData.scripture_text,
          prayer:               formData.prayer,
          reflection_questions: formData.reflection_questions,
          schedule_date:        formData.schedule_date,
          is_published:         formData.is_published ?? false,
        };
        if (formData.scripture_reference)     p.scripture_reference     = formData.scripture_reference;
        if (formData.scripture_version)       p.scripture_version       = formData.scripture_version;
        if (formData.bible_passage_reference) p.bible_passage_reference = formData.bible_passage_reference;
        if (formData.bible_passage_text)      p.bible_passage_text      = formData.bible_passage_text;
        if (formData.image_url)               p.image_url               = formData.image_url;
        if (formData.audio_url)               p.audio_url               = formData.audio_url;
        if (formData.stream_id)               p.stream_id               = formData.stream_id;
        Object.keys(p).forEach(k => { if (p[k] === undefined) delete p[k]; });
        return p;
      };

      if (editingItem) {
        // user_profiles uses user_id as the lookup key, not id
        const matchKey = modalType === 'user' ? 'user_id' : 'id';
        const matchVal = modalType === 'user'
          ? (editingItem.user_id || editingItem.id)
          : editingItem.id;

        // For users, only update the fields we expose in the form
        // Clean payload — only send columns that exist in each table
        let updatePayload: Record<string, any>;
        if (modalType === 'user') {
          updatePayload = {
            role:              formData.role,
            full_name:         formData.full_name,
            subscription_tier: formData.subscription_tier,
          };
        } else if (modalType === 'devotional') {
          updatePayload = buildDevotionalPayload();
        } else {
          updatePayload = formData;
        }

        const { error } = await supabase
          .from(table)
          .update(updatePayload)
          .eq(matchKey, matchVal);
        
        if (error) throw error;
      } else {
        // Devotionals need the same column whitelist as update — formData carries
        // form-only fields that aren't table columns (author/category/…). Other
        // types insert formData as before.
        const insertPayload = modalType === 'devotional' ? buildDevotionalPayload() : formData;
        const { error } = await supabase
          .from(table)
          .insert([insertPayload]);

        if (error) throw error;
      }

      clearTimeout(saveTimeout);
      toast({ title: t('adminDashboard', 'success', 'Success'), description: t('adminDashboard', 'itemSaved', 'Item saved successfully') });
      setShowModal(false);
      loadAllData();
      setSaving(false);
    } catch (err: any) {
      clearTimeout(saveTimeout);
      toast({ title: t('adminDashboard', 'saveError', 'Save Error'), description: err.message, variant: 'destructive' });
      setSaving(false);
    }
  };

  // Render form fields based on modal type
  const renderFormFields = () => {
    switch (modalType) {
      case 'devotional':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>{t('adminDashboard', 'titleRequired', 'Title *')}</Label>
                <Input
                  value={formData.title || ''}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t('adminDashboard', 'devotionalTitlePlaceholder', 'Devotional title')}
                />
              </div>
              <div>
                <Label>{t('adminDashboard', 'scriptureReference', 'Scripture Reference')}</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    className="flex-1"
                    value={formData.scripture_reference || formData.scripture || ''}
                    onChange={(e) => setFormData({ ...formData, scripture_reference: e.target.value, scripture: e.target.value })}
                    placeholder={t('adminDashboard', 'scriptureRefExample', 'e.g., John 3:16')}
                  />
                  <Select value={scriptureVersion} onValueChange={setScriptureVersion}>
                    <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BIBLE_VERSIONS.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={handleLoadScripture} disabled={loadingScripture}>
                    {loadingScripture ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Download className="h-4 w-4 mr-1" /> {t('adminDashboard', 'load', 'Load')}</>}
                  </Button>
                </div>
              </div>
              <div>
                <Label>{t('adminDashboard', 'author', 'Author')}</Label>
                <Input
                  value={formData.author || formData.author_name || ''}
                  onChange={(e) => setFormData({ ...formData, author: e.target.value, author_name: e.target.value })}
                  placeholder={t('adminDashboard', 'authorNamePlaceholder', 'Author name')}
                />
              </div>
              <div className="col-span-2">
                <Label>{t('adminDashboard', 'scripturePassage', 'Scripture Passage')}</Label>
                <Textarea
                  value={formData.scripture_text || ''}
                  onChange={(e) => setFormData({ ...formData, scripture_text: e.target.value })}
                  placeholder={t('adminDashboard', 'scripturePassagePlaceholder', 'Full scripture passage text...')}
                  rows={3}
                />
              </div>
              <div className="col-span-2 rounded-lg border p-3 space-y-2">
                <Label className="flex items-center gap-2">
                  <Book className="h-4 w-4" /> {t('adminDashboard', 'biblePassage', 'Bible Passage')}
                </Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    className="flex-1"
                    value={formData.bible_passage_reference || ''}
                    onChange={(e) => setFormData({ ...formData, bible_passage_reference: e.target.value })}
                    placeholder={t('adminDashboard', 'biblePassageRefExample', 'e.g., Romans 8:1-11')}
                  />
                  <Select value={biblePassageVersion} onValueChange={setBiblePassageVersion}>
                    <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BIBLE_VERSIONS.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={handleLoadBiblePassage} disabled={loadingBiblePassage}>
                    {loadingBiblePassage ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Download className="h-4 w-4 mr-1" /> {t('adminDashboard', 'load', 'Load')}</>}
                  </Button>
                </div>
                <Textarea
                  value={formData.bible_passage_text || ''}
                  onChange={(e) => setFormData({ ...formData, bible_passage_text: e.target.value })}
                  placeholder={t('adminDashboard', 'biblePassageTextPlaceholder', 'Load from the reference above, or paste the passage. Long passages scroll.')}
                  rows={5}
                  className="max-h-60 overflow-y-auto"
                />
              </div>
              <div className="col-span-2">
                <Label>{t('adminDashboard', 'contentRequired', 'Content *')}</Label>
                <Textarea
                  value={formData.message || formData.content || ''}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value, content: e.target.value })}
                  placeholder={t('adminDashboard', 'contentPlaceholder', 'Main devotional teaching...')}
                  rows={8}
                />
              </div>
              <div className="col-span-2">
                <Label>{t('adminDashboard', 'prayer', 'Prayer')}</Label>
                <Textarea
                  value={formData.prayer || formData.prayer_focus || ''}
                  onChange={(e) => setFormData({ ...formData, prayer: e.target.value })}
                  placeholder={t('adminDashboard', 'prayerPlaceholder', 'Closing prayer or prayer focus...')}
                  rows={3}
                />
              </div>
              <div className="col-span-2">
                <Label>{t('adminDashboard', 'reflectionQuestions', 'Reflection Questions (one per line)')}</Label>
                <Textarea
                  value={Array.isArray(formData.reflection_questions)
                    ? formData.reflection_questions.join('\n')
                    : formData.reflection_questions || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    reflection_questions: e.target.value.split('\n').filter(Boolean)
                  })}
                  placeholder={t('adminDashboard', 'reflectionQuestionsPlaceholder', 'What does this verse mean to you?\nHow can you apply this today?')}
                  rows={3}
                />
              </div>
              <div>
                <Label>{t('adminDashboard', 'imageUrl', 'Image URL')}</Label>
                <Input
                  value={formData.image_url || formData.featured_image || ''}
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value, featured_image: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label>{t('adminDashboard', 'audioUrl', 'Audio URL')}</Label>
                <Input
                  value={formData.audio_url || ''}
                  onChange={(e) => setFormData({ ...formData, audio_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label>{t('adminDashboard', 'category', 'Category')}</Label>
                <Select
                  value={formData.category || ''}
                  onValueChange={(v) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger><SelectValue placeholder={t('adminDashboard', 'selectCategory', 'Select category')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="faith">{t('adminDashboard', 'catFaith', 'Faith')}</SelectItem>
                    <SelectItem value="prayer">{t('adminDashboard', 'catPrayer', 'Prayer')}</SelectItem>
                    <SelectItem value="worship">{t('adminDashboard', 'catWorship', 'Worship')}</SelectItem>
                    <SelectItem value="healing">{t('adminDashboard', 'catHealing', 'Healing')}</SelectItem>
                    <SelectItem value="growth">{t('adminDashboard', 'catGrowth', 'Growth')}</SelectItem>
                    <SelectItem value="family">{t('adminDashboard', 'catFamily', 'Family')}</SelectItem>
                    <SelectItem value="evangelism">{t('adminDashboard', 'catEvangelism', 'Evangelism')}</SelectItem>
                    <SelectItem value="general">{t('adminDashboard', 'catGeneral', 'General')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('adminDashboard', 'devotionalStream', 'Stream')}</Label>
                <Select
                  value={formData.stream_id || ''}
                  onValueChange={(v) => setFormData({ ...formData, stream_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder={t('adminDashboard', 'selectStream', 'Select stream')} /></SelectTrigger>
                  <SelectContent>
                    {devotionalStreams.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('adminDashboard', 'scheduleDate', 'Schedule Date')}</Label>
                <Input
                  type="date"
                  value={formData.schedule_date?.split('T')[0] || ''}
                  onChange={(e) => setFormData({ ...formData, schedule_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
                />
              </div>
              <div className="col-span-2 flex items-center gap-6 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_published || false}
                    onCheckedChange={(v) => setFormData({ ...formData, is_published: v })}
                  />
                  <Label>{t('adminDashboard', 'published', 'Published')}</Label>
                </div>

              </div>
            </div>
          </div>
        );
      
      case 'music':
        return (
          <div className="space-y-4">
            <div>
              <Label>{t('adminDashboard', 'title', 'Title')}</Label>
              <Input
                value={formData.title || ''}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            <div>
              <Label>{t('adminDashboard', 'artist', 'Artist')}</Label>
              <Input
                value={formData.artist || ''}
                onChange={(e) => setFormData({ ...formData, artist: e.target.value })}
              />
            </div>
            <div>
              <Label>{t('adminDashboard', 'category', 'Category')}</Label>
              <Select
                value={formData.category || ''}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('adminDashboard', 'selectCategory', 'Select category')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="worship">{t('adminDashboard', 'catWorship', 'Worship')}</SelectItem>
                  <SelectItem value="praise">{t('adminDashboard', 'catPraise', 'Praise')}</SelectItem>
                  <SelectItem value="meditation">{t('adminDashboard', 'catMeditation', 'Meditation')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('adminDashboard', 'audioUrl', 'Audio URL')}</Label>
              <Input
                value={formData.audio_url || ''}
                onChange={(e) => setFormData({ ...formData, audio_url: e.target.value })}
              />
              <FileUploadButton
                accept="audio/*"
                onUpload={(url) => setFormData({ ...formData, audio_url: url })}
                folder="music"
                label={t('adminDashboard', 'uploadAudio', 'Upload Audio')}
              />
            </div>
          </div>
        );

      case 'affirmation':
        return (
          <div className="space-y-4">
            <div>
              <Label>{t('adminDashboard', 'affirmationText', 'Affirmation Text')}</Label>
              <Textarea
                value={formData.text || ''}
                onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                rows={4}
              />
            </div>
            <div>
              <Label>{t('adminDashboard', 'category', 'Category')}</Label>
              <Select
                value={formData.category || ''}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('adminDashboard', 'selectCategory', 'Select category')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="faith">{t('adminDashboard', 'catFaith', 'Faith')}</SelectItem>
                  <SelectItem value="healing">{t('adminDashboard', 'catHealing', 'Healing')}</SelectItem>
                  <SelectItem value="prosperity">{t('adminDashboard', 'catProsperity', 'Prosperity')}</SelectItem>
                  <SelectItem value="peace">{t('adminDashboard', 'catPeace', 'Peace')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('adminDashboard', 'scriptureReference', 'Scripture Reference')}</Label>
              <Input
                value={formData.scripture_reference || ''}
                onChange={(e) => setFormData({ ...formData, scripture_reference: e.target.value })}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={formData.is_daily || false}
                onCheckedChange={(checked) => setFormData({ ...formData, is_daily: checked })}
              />
              <Label>{t('adminDashboard', 'dailyAffirmation', 'Daily Affirmation')}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={formData.is_published || false}
                onCheckedChange={(checked) => setFormData({ ...formData, is_published: checked })}
              />
              <Label>{t('adminDashboard', 'published', 'Published')}</Label>
            </div>
          </div>
        );

      case 'user':
        return (
          <div className="space-y-4">
            {/* Read-only identity */}
            <div className="p-3 bg-gray-50 rounded-lg space-y-1 text-sm">
              <p className="font-medium">{formData.full_name || t('adminDashboard', 'noName', '(no name)')}</p>
              <p className="text-gray-500">{formData.email || '—'}</p>
              <p className="text-xs text-gray-400">ID: {formData.user_id || formData.id}</p>
            </div>

            <div>
              <Label>{t('adminDashboard', 'role', 'Role')}</Label>
              <Select
                value={formData.role || 'user'}
                onValueChange={(value) => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">{t('adminDashboard', 'roleUser', 'User')}</SelectItem>
                  <SelectItem value="leader">{t('adminDashboard', 'roleLeader', 'Leader')}</SelectItem>
                  <SelectItem value="counsellor">{t('adminDashboard', 'roleCounsellor', 'Counsellor')}</SelectItem>
                  <SelectItem value="moderator">{t('adminDashboard', 'roleModerator', 'Moderator')}</SelectItem>
                  <SelectItem value="admin">{t('adminDashboard', 'roleAdmin', 'Admin')}</SelectItem>
                  <SelectItem value="super_admin">{t('adminDashboard', 'roleSuperAdmin', 'Super Admin')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                <strong>{t('adminDashboard', 'roleAdmin', 'Admin')}</strong> — {t('adminDashboard', 'roleAdminHelp', 'full dashboard access.')}&nbsp;
                <strong>{t('adminDashboard', 'roleSuperAdmin', 'Super Admin')}</strong> — {t('adminDashboard', 'roleSuperAdminHelp', 'admin + can delete users and assign roles.')}
              </p>
            </div>

            <div>
              <Label>{t('adminDashboard', 'subscriptionTier', 'Subscription Tier')}</Label>
              <Select
                value={formData.subscription_tier || 'free'}
                onValueChange={(value) => setFormData({ ...formData, subscription_tier: value })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">{t('adminDashboard', 'tierFree', 'Free')}</SelectItem>
                  <SelectItem value="premium">{t('adminDashboard', 'tierPremium', 'Premium')}</SelectItem>
                  <SelectItem value="premium_plus">{t('adminDashboard', 'tierPremiumPlus', 'Premium Plus')}</SelectItem>
                  <SelectItem value="family">{t('adminDashboard', 'tierFamily', 'Family')}</SelectItem>
                  <SelectItem value="ministry_plus">{t('adminDashboard', 'tierMinistryPlus', 'Ministry Plus')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('adminDashboard', 'fullName', 'Full Name')}</Label>
              <Input
                className="mt-1"
                value={formData.full_name || ''}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Content Table Component
  const ContentTable: React.FC<{
    data: any[];
    type: string;
    columns: Array<{ key: string; label: string }>;
  }> = ({ data, type, columns }) => {
    const filteredData = data.filter((item) =>
      Object.values(item).some((val) =>
        String(val).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={t('adminDashboard', 'searchPlaceholder', 'Search...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button onClick={() => handleCreate(type)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('adminDashboard', 'addItem', 'Add {type}').replace('{type}', type)}
          </Button>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {columns.map((col) => (
                    <th key={col.key} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {col.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('adminDashboard', 'actions', 'Actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredData.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3 text-sm">
                        {col.key === 'is_published' || col.key === 'is_daily' ? (
                          <Badge variant={item[col.key] ? 'default' : 'secondary'}>
                            {item[col.key] ? t('adminDashboard', 'yes', 'Yes') : t('adminDashboard', 'no', 'No')}
                          </Badge>
                        ) : col.key === 'schedule_date' ? (
                          item[col.key] ? new Date(item[col.key]).toLocaleString() : t('adminDashboard', 'notScheduled', 'Not scheduled')
                        ) : (
                          String(item[col.key] || '-').substring(0, 50)
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-sm text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(type, item)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        
                        {/* Add TTS Export button for devotionals */}
                        {type === 'devotional' && (
                          <UniversalTTSExportButton
                            contentType="daily_devotional"
                            contentId={item.id}
                            contentTitle={item.title || 'Devotional'}
                            size="sm"
                          />
                        )}
                        
                        {/* TTS Export Button for Affirmations */}
                        {type === 'affirmation' && (
                          <UniversalTTSExportButton
                            contentType="affirmation"
                            contentId={item.id}
                            contentTitle={item.text?.substring(0, 30) + '...' || 'Affirmation'}
                            size="sm"
                          />
                        )}
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(type, item.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // User Management Component
  const UserManagement: React.FC<{
    users: any[];
    userTotal: number;
    userPage: number;
    userPageSize: number;
    usersLoading: boolean;
    onPageChange: (page: number) => void;
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    handleCreate: (type: string) => void;
    handleEdit: (type: string, item: any) => void;
    handleDelete: (type: string, id: string) => void;
    loadAllData: () => void;
    isSuperAdmin?: boolean;
  }> = ({ users, userTotal, userPage, userPageSize, usersLoading, onPageChange, searchTerm, setSearchTerm, handleCreate, handleEdit, handleDelete, loadAllData, isSuperAdmin }) => {
    const filteredUsers = users.filter((user) =>
      Object.values(user).some((val) =>
        String(val).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );

    const totalPages = Math.ceil(userTotal / userPageSize);
    const start = userPage * userPageSize + 1;
    const end   = Math.min((userPage + 1) * userPageSize, userTotal);

    const roleColour = (role: string) => {
      const map: Record<string, string> = {
        super_admin: 'bg-red-100 text-red-800 border-red-200',
        admin:       'bg-purple-100 text-purple-800 border-purple-200',
        moderator:   'bg-blue-100 text-blue-800 border-blue-200',
        counsellor:  'bg-teal-100 text-teal-800 border-teal-200',
        leader:      'bg-amber-100 text-amber-800 border-amber-200',
        user:        'bg-gray-100 text-gray-600 border-gray-200',
      };
      return map[role] ?? map.user;
    };

    const tierColour = (tier: string) => {
      const map: Record<string, string> = {
        premium:       'bg-amber-100 text-amber-800',
        premium_plus:  'bg-orange-100 text-orange-800',
        ministry_plus: 'bg-purple-100 text-purple-800',
        family:        'bg-indigo-100 text-indigo-800',
        free:          'bg-gray-100 text-gray-600',
      };
      return map[tier] ?? map.free;
    };

    const fmtDate = (ts: string | null) => {
      if (!ts) return '—';
      return new Date(ts).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
      });
    };

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
          <div className="relative flex-1 w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={t('adminDashboard', 'searchUsersPlaceholder', 'Search name, email, role, subscription…')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm text-gray-500">
              {usersLoading
                ? t('adminDashboard', 'loadingEllipsis', 'Loading…')
                : searchTerm
                ? `${filteredUsers.length} ${filteredUsers.length !== 1 ? t('adminDashboard', 'matchesLabel', 'matches') : t('adminDashboard', 'matchLabel', 'match')}`
                : t('adminDashboard', 'usersRange', '{start}–{end} of {total} users').replace('{start}', String(start)).replace('{end}', String(end)).replace('{total}', userTotal.toLocaleString())}
            </span>
            <Button variant="outline" size="sm" onClick={loadAllData} disabled={usersLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${usersLoading ? 'animate-spin' : ''}`} />
              {t('adminDashboard', 'refresh', 'Refresh')}
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-52">
                    {t('adminDashboard', 'colUser', 'User')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {t('adminDashboard', 'role', 'Role')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {t('adminDashboard', 'colSubscription', 'Subscription')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    {t('adminDashboard', 'colActivity', 'Activity')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                    {t('adminDashboard', 'colJoined', 'Joined')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {t('adminDashboard', 'actions', 'Actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {usersLoading && users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-purple-500" />
                      {t('adminDashboard', 'loadingUsers', 'Loading users…')}
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                      {searchTerm ? t('adminDashboard', 'noUsersMatch', 'No users match "{term}"').replace('{term}', searchTerm) : t('adminDashboard', 'noUsersFound', 'No users found.')}
                    </td>
                  </tr>
                ) : filteredUsers.map((user) => {
                  const xp      = user.xp_points ?? 0;
                  const streak  = user.prayer_streak ?? 0;
                  const prayers = user.total_prayers ?? 0;
                  const tier    = user.subscription_tier || 'free';
                  const role    = user.role || 'user';

                  return (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">

                      {/* User — avatar + name + email */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {user.avatar_url ? (
                            <img
                              src={user.avatar_url}
                              alt=""
                              className="h-8 w-8 rounded-full object-cover shrink-0 border border-gray-200"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0 text-purple-600 font-semibold text-sm">
                              {(user.full_name || user.email || '?')[0].toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">
                              {user.full_name || user.name || '(no name)'}
                            </p>
                            <p className="text-xs text-gray-400 truncate">{user.email || '—'}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`text-xs font-medium capitalize ${roleColour(role)}`}
                        >
                          {role.replace('_', ' ')}
                        </Badge>
                      </td>

                      {/* Subscription */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${tierColour(tier)}`}>
                          {tier.replace('_', ' ')}
                        </span>
                        {user.subscription_status && user.subscription_status !== 'active' && (
                          <p className="text-[10px] text-amber-600 mt-0.5 capitalize">
                            {user.subscription_status}
                          </p>
                        )}
                      </td>

                      {/* Activity — XP, streak, prayers */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="space-y-0.5">
                          <p className="text-xs text-gray-700">
                            <span className="font-semibold">{xp.toLocaleString()}</span>
                            <span className="text-gray-400"> {t('adminDashboard', 'xp', 'XP')}</span>
                            {streak > 0 && (
                              <span className="ml-2 text-orange-500">🔥 {streak}d</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400">
                            {prayers.toLocaleString()} {prayers !== 1 ? t('adminDashboard', 'prayersLabel', 'prayers') : t('adminDashboard', 'prayerLabel', 'prayer')}
                          </p>
                          {user.onboarding_completed === false && (
                            <p className="text-[10px] text-amber-500">{t('adminDashboard', 'onboardingIncomplete', 'Onboarding incomplete')}</p>
                          )}
                        </div>
                      </td>

                      {/* Joined */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <p className="text-xs text-gray-600">{fmtDate(user.created_at)}</p>
                        {user.updated_at && user.updated_at !== user.created_at && (
                          <p className="text-[10px] text-gray-400">
                            {t('adminDashboard', 'activeDate', 'Active {date}').replace('{date}', fmtDate(user.updated_at))}
                          </p>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit('user', user)}
                            className="h-8 w-8 p-0"
                            title={t('adminDashboard', 'editUser', 'Edit user')}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          {isSuperAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete('user', user.id)}
                              className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                              title={t('adminDashboard', 'deleteUser', 'Delete user')}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && !searchTerm && (
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-gray-500">
              {t('adminDashboard', 'pageOf', 'Page {page} of {total} · {count} total users').replace('{page}', String(userPage + 1)).replace('{total}', String(totalPages)).replace('{count}', userTotal.toLocaleString())}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(userPage - 1)}
                disabled={userPage === 0 || usersLoading}
              >
                {t('adminDashboard', 'prev', '← Prev')}
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(0, Math.min(totalPages - 5, userPage - 2)) + i;
                return (
                  <Button
                    key={p}
                    variant={p === userPage ? 'default' : 'outline'}
                    size="sm"
                    className="w-9"
                    onClick={() => onPageChange(p)}
                    disabled={usersLoading}
                  >
                    {p + 1}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(userPage + 1)}
                disabled={userPage >= totalPages - 1 || usersLoading}
              >
                {t('adminDashboard', 'next', 'Next →')}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Loading state
  if (loading) {
    return <AdminLoadingSkeleton />;
  }

  // Error state
  if (loadError) {
    return <AdminErrorFallback onRetry={loadAllData} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Super Admin Banner */}
      {isSuperAdmin && (
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-2 px-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <Shield className="h-4 w-4" />
            <span className="text-sm font-medium">{t('adminDashboard', 'superAdminMode', 'Super Admin Mode')}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('adminDashboard', 'adminDashboardTitle', 'Admin Dashboard')}</h1>
              <p className="text-sm text-gray-500 mt-1">{t('adminDashboard', 'adminDashboardSubtitle', 'Manage your platform content and users')}</p>
            </div>
            <Button onClick={loadAllData} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('adminDashboard', 'refreshData', 'Refresh Data')}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Mobile Menu */}
          <div className="lg:hidden mb-4">
            <MobileMenu 
              activeTab={activeTab}
              onTabChange={setActiveTab}
              tabs={adminTabs}
            />
          </div>

          {/* Desktop Tabs */}
          <TabsList className="hidden lg:flex flex-wrap h-auto mb-6 bg-white border rounded-lg p-2 gap-1">
            {adminTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger 
                  key={tab.value} 
                  value={tab.value}
                  className="flex items-center gap-2 data-[state=active]:bg-purple-100 data-[state=active]:text-purple-700"
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  <span className="hidden xl:inline">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Dashboard Overview */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-purple-600" />
                    {t('adminDashboard', 'platformOverview', 'Platform Overview')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <StatCard icon={Users} label={t('adminDashboard', 'statTotalUsers', 'Total Users')} value={stats.totalUsers} color="purple" />
                    <StatCard icon={UserCheck} label={t('adminDashboard', 'statActiveUsers', 'Active Users')} value={stats.activeUsers} color="green" />
                    <StatCard icon={BookOpen} label={t('adminDashboard', 'devotionals', 'Devotionals')} value={stats.totalDevotionals} color="blue" />
                    <StatCard icon={Music} label={t('adminDashboard', 'statMusicTracks', 'Music Tracks')} value={stats.totalMusic} color="indigo" />
                    <StatCard icon={Heart} label={t('adminDashboard', 'statPrayers', 'Prayers')} value={stats.totalPrayers} color="red" />
                    <StatCard icon={Star} label={t('adminDashboard', 'affirmations', 'Affirmations')} value={affirmations.length} color="amber" />
                    <StatCard icon={DollarSign} label={t('adminDashboard', 'donations', 'Donations')} value={stats.totalDonations} color="green" />
                    <StatCard icon={Trophy} label={t('adminDashboard', 'statSponsors', 'Sponsors')} value={stats.totalSponsors} color="orange" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Button
                      onClick={() => setActiveTab('devotional-library')}
                      className="h-auto py-4 flex flex-col items-center gap-2 bg-blue-600 hover:bg-blue-700"
                    >
                      <BookOpen className="h-5 w-5" />
                      <span className="text-sm font-medium">{t('adminDashboard', 'tabDevotionalLibrary', 'Devotional Library')}</span>
                    </Button>
                    
                    <Button
                      onClick={() => {
                        setActiveTab('affirmations');
                        setModalType('affirmation');
                        setEditingItem(null);
                        setFormData({});
                        setShowModal(true);
                      }}
                      className="h-auto py-4 flex flex-col items-center gap-2 bg-purple-600 hover:bg-purple-700"
                    >
                      <Plus className="h-5 w-5" />
                      <span className="text-sm font-medium">{t('adminDashboard', 'addAffirmation', 'Add Affirmation')}</span>
                    </Button>
                    
                    <Button
                      onClick={() => setActiveTab('prayer-library')}
                      className="h-auto py-4 flex flex-col items-center gap-2 bg-pink-600 hover:bg-pink-700"
                    >
                      <Heart className="h-5 w-5" />
                      <span className="text-sm font-medium">{t('adminDashboard', 'tabPrayerLibrary', 'Prayer Library')}</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="grid md:grid-cols-3 gap-4">
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-blue-800">{t('adminDashboard', 'contentManagement', 'Content Management')}</h3>
                    <p className="text-sm text-blue-600">{t('adminDashboard', 'contentManagementDesc', 'Manage devotionals, prayers, and spiritual content')}</p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-green-800">{t('adminDashboard', 'userManagement', 'User Management')}</h3>
                    <p className="text-sm text-green-600">{t('adminDashboard', 'userManagementDesc', 'Manage users, roles, and subscriptions')}</p>
                  </CardContent>
                </Card>
                <Card className="bg-purple-50 border-purple-200">
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-purple-800">{t('adminDashboard', 'tabAnalytics', 'Analytics')}</h3>
                    <p className="text-sm text-purple-600">{t('adminDashboard', 'analyticsDesc', 'View platform usage and engagement metrics')}</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <UserManagement 
              users={users}
              userTotal={userTotal}
              userPage={userPage}
              userPageSize={userPageSize}
              usersLoading={usersLoading}
              onPageChange={async (page) => {
                setUsersLoading(true);
                const from = page * userPageSize;
                const to   = from + userPageSize - 1;
                const { data, error } = await supabase
                  .from('user_profiles')
                  .select('*', { count: 'exact' })
                  .order('created_at', { ascending: false })
                  .range(from, to);
                if (!error && data) {
                  setUsers(data);
                  setUserPage(page);
                }
                setUsersLoading(false);
              }}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              handleCreate={handleCreate}
              handleEdit={handleEdit}
              handleDelete={handleDelete}
              loadAllData={loadAllData}
              isSuperAdmin={isSuperAdmin}
            />
          )}

          {activeTab === 'subscriptions' && (
            <AdminSubscriptionManager isSuperAdmin={isSuperAdmin} />
          )}

          {activeTab === 'live-channels' && (
            <AdminLiveChannelManager />
          )}

          {activeTab === 'community-revelations' && (
            <CommunityRevelationsManager 
              onUpdate={loadAllData}
            />
          )}

          {activeTab === 'ai-companion' && (
            <AICompanionAdminSettings />
          )}

          {activeTab === 'referrals' && (
            <ReferralAdminManager />
          )}

          {activeTab === 'reading-plans' && (
            <ReadingPlanManager />
          )}

          {activeTab === 'translations' && (
            <AdminTranslationDashboard />
          )}

          {activeTab === 'languages' && (
            <LanguageManager />
          )}

          {activeTab === 'content-translation' && (
            <ContentTranslationManager />
          )}

          {/* NEW: Bulk TTS Tab Content */}
          {activeTab === 'bulk-tts' && (
            <AdminBulkTTSPanel />
          )}

          {activeTab === 'ministry-groups' && (
            <MinistryGroupsManager onUpdate={loadAllData} />
          )}

          {activeTab === 'prayer-challenges' && (
            <PrayerChallengeBackendManager />
          )}

          {activeTab === 'devotionals' && (
            <ContentTable 
              data={devotionals}
              type="devotional"
              columns={[
                { key: 'title', label: 'Title' },
                { key: 'scripture', label: 'Scripture' },
                { key: 'schedule_date', label: 'Schedule Date & Time' },
                { key: 'is_published', label: 'Published' }
              ]}
            />
          )}

          {activeTab === 'prayer-library' && (
            <AdminPrayerLibrary />
          )}

          {activeTab === 'music' && (
            <ContentTable 
              data={music}
              type="music"
              columns={[
                { key: 'title', label: 'Title' },
                { key: 'artist', label: 'Artist' },
                { key: 'category', label: 'Category' }
              ]}
            />
          )}

          {activeTab === 'mentors' && (
            <AdminCounsellorManager />
          )}

          {activeTab === 'books' && (
            <AdminBookManager />
          )}

          {activeTab === 'affirmations' && (
            <AdminAffirmationManager onUpdate={loadAllData} />
          )}

          {activeTab === 'declarations' && (
            <AdminDeclarationManager />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsDashboard />
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-8">
              <AdminNotificationComposer />
              <EmailNotificationManager />
            </div>
          )}

          {activeTab === 'donations-manage' && (
            <DonationsManagement 
              donations={donations}
              sponsors={sponsors}
              onUpdate={loadAllData}
            />
          )}

          {activeTab === 'broadcast' && (
            <BroadcastMessaging 
              onSend={loadAllData}
            />
          )}

          {activeTab === 'broadcast-history' && (
            <AdminBroadcastLogViewer />
          )}

          {activeTab === 'whatsapp-admin' && (
            <AdminWhatsAppManager />
          )}
          
          {activeTab === 'leaderboard' && (
            <AdminLeaderboard />
          )}

          {activeTab === 'prayer-wall' && (
            <CommunityPrayerManager 
              posts={prayerWallPosts}
              onUpdate={loadAllData}
            />
          )}

          {activeTab === 'devotional-library' && (
            <AdminDevotionalLibraryManager />
          )}

          {activeTab === 'devotional-streams' && (
            <AdminDevotionalStreamsManager onAddDevotional={handleAddDevotionalToStream} />
          )}

          {isSuperAdmin && activeTab === 'platform-admin' && (
            <PlatformAdminDashboard />
          )}
          
        </Tabs>

        {/* Modal */}
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingItem
                  ? t('adminDashboard', 'editTitle', 'Edit {type}').replace('{type}', modalType)
                  : t('adminDashboard', 'createTitle', 'Create {type}').replace('{type}', modalType)}
              </DialogTitle>
            </DialogHeader>
            {renderFormFields()}
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setShowModal(false)} className="w-full sm:w-auto">
                {t('adminDashboard', 'cancel', 'Cancel')}
              </Button>
              <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('adminDashboard', 'saving', 'Saving...')}
                  </>
                ) : t('adminDashboard', 'save', 'Save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export { AdminDashboard };
export default AdminDashboard;