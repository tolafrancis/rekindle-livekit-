import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useViewHistory } from '@rekindle/features/hooks/useViewHistory';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Badge } from '@rekindle/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@rekindle/ui/dialog';
import { Label } from '@rekindle/ui/label';
import { COUNTRY_OPTIONS } from '../giftAid';
import { Switch } from '@rekindle/ui/switch';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import {
  Plus, Users, Crown, Shield,
  QrCode, Loader2, ChevronRight, Building2,
  Heart, Upload, Image as ImageIcon,
  Sparkles
} from 'lucide-react';
import MinistrySpace from './MinistrySpace';
import { peekDeepLink } from '@rekindle/features/deepLink';

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
  created_at: string;
  approval_status?: string;
}

interface MembershipInfo {
  ministry_id: string;
  role: string;
  subscription_level: number;
  is_leader: boolean;
  joined_at: string;
}

const MINISTRY_CATEGORIES = [
  'General', 'Youth', 'Women', 'Men', 'Children', 'Worship',
  'Prayer', 'Outreach', 'Missions', 'Education', 'Family', 'Singles'
];

// A gentle verse of encouragement in the welcome hero — rotates daily.
const WELCOME_VERSES = [
  '"For where two or three gather in my name, there am I with them." — Matthew 18:20',
  '"And let us consider how we may spur one another on toward love and good deeds." — Hebrews 10:24',
  '"How good and pleasant it is when God\'s people live together in unity!" — Psalm 133:1',
  '"Carry each other\'s burdens, and in this way you will fulfill the law of Christ." — Galatians 6:2',
  '"Therefore encourage one another and build each other up." — 1 Thessalonians 5:11',
];

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const MINISTRY_DOMAIN = (import.meta as any).env?.VITE_MINISTRY_DOMAIN || 'rekindlebc.com';
const RESERVED_HANDLES = new Set([
  'app', 'www', 'api', 'admin', 'dashboard', 'portal', 'auth', 'login', 'signup',
  'mail', 'email', 'smtp', 'ftp', 'cdn', 'assets', 'static', 'status', 'help',
  'support', 'docs', 'blog', 'ministry', 'ministries', 'staging', 'dev', 'test',
  'rekindle', 'rekindlebc', 'join', 'kiosk', 'settings', 'billing',
]);

type ViewMode = 'my-ministries' | 'ministry-space';

interface MinistriesHubProps {
  activeView?: string;
  onActiveViewChange?: (view: string) => void;
  onWorkspaceChange?: (active: boolean) => void;
}

const MinistriesHub: React.FC<MinistriesHubProps> = ({ activeView: controlledActiveView, onActiveViewChange, onWorkspaceChange }) => {
  const { user, profile, isAdmin: authIsAdmin, isPartner, initialized: authInitialized } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [internalActiveView, setInternalActiveView] = useViewHistory<ViewMode>('ministries-hub', 'my-ministries');
  const activeView = (controlledActiveView as ViewMode) ?? internalActiveView;
  const setActiveView = useCallback((view: ViewMode) => {
    setInternalActiveView(view);
    onActiveViewChange?.(view);
  }, [onActiveViewChange]);

  const [selectedMinistryId, setSelectedMinistryId] = useViewHistory<string>('ministries-hub-selected-ministry', '');
  const [myMinistries, setMyMinistries] = useState<Ministry[]>([]);
  const [memberships, setMemberships] = useState<Record<string, MembershipInfo>>({});
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedMinistry, setSelectedMinistry] = useState<Ministry | null>(null);
  const [creating, setCreating] = useState(false);

  // Join with Code modal states
  const [showCodeJoinModal, setShowCodeJoinModal] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'General',
    location: '',
    country_code: '',
    welcome_message: '',
    logo_url: '',
    banner_url: '',
    is_public: true,
    join_method: 'open',
    theme_color: '#7c3aed',
    slug: ''
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  useEffect(() => {
    if (!slugEdited) setFormData(prev => ({ ...prev, slug: slugify(prev.name) }));
  }, [formData.name, slugEdited]);

  const is_ministry_Leader = isPartner || authIsAdmin;
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  useEffect(() => {
    onWorkspaceChange?.(activeView === 'ministry-space' && !!selectedMinistry);
    return () => onWorkspaceChange?.(false);
  }, [activeView, selectedMinistry, onWorkspaceChange]);

  // Load user's joined & owned ministries
  const loadMyMinistries = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data: memberData, error: memberError } = await supabase
        .from('ministry_group_members')
        .select('*')
        .eq('user_id', user.id);

      if (memberError) throw memberError;

      const membershipMap: Record<string, MembershipInfo> = {};
      const membershipIds = new Set<string>();
      (memberData || []).forEach(m => {
        membershipIds.add(String(m.group_id));
        membershipMap[m.group_id] = {
          ministry_id: m.group_id,
          role: m.role,
          subscription_level: m.subscription_level || 1,
          is_leader: m.is_leader || false,
          joined_at: m.joined_at
        };
      });

      const { data: activeProfiles, error: activeProfileError } = await supabase
        .from('ministry_member_profiles')
        .select('ministry_id')
        .eq('user_id', user.id)
        .eq('registration_status', 'active');

      if (activeProfileError) throw activeProfileError;

      for (const profileItem of activeProfiles || []) {
        const id = String(profileItem.ministry_id);
        if (!membershipIds.has(id)) {
          const { data: existing } = await supabase
            .from('ministry_group_members')
            .select('id')
            .eq('group_id', id)
            .eq('user_id', user.id)
            .maybeSingle();
          if (!existing) {
            const { error: insertError } = await supabase.from('ministry_group_members').insert({
              ministry_id: id,
              group_id: id,
              user_id: user.id,
              role: 'member',
              is_leader: false,
              joined_at: new Date().toISOString(),
            });
            if (insertError && !/duplicate|already exists|unique/i.test(insertError.message || '')) {
              console.warn('Unable to reconcile active ministry membership:', insertError.message);
            }
          }
          membershipMap[id] = {
            ministry_id: id,
            role: 'member',
            subscription_level: 1,
            is_leader: false,
            joined_at: new Date().toISOString(),
          };
          membershipIds.add(id);
        }
      }

      setMemberships(membershipMap);

      let allMinistries: Ministry[] = [];
      if (membershipIds.size > 0) {
        const { data: ministryData, error: ministryError } = await supabase
          .from('ministry_groups')
          .select('*')
          .in('id', Array.from(membershipIds));

        if (ministryError) throw ministryError;
        allMinistries = ministryData || [];
      }

      const { data: ownedData } = await supabase
        .from('ministry_groups')
        .select('*')
        .or(`owner_id.eq.${user.id},leader_id.eq.${user.id}`);

      if (ownedData) {
        ownedData.forEach(m => {
          if (!allMinistries.find(c => c.id === m.id)) {
            allMinistries.push(m);
            membershipMap[m.id] = {
              ministry_id: m.id,
              role: 'admin',
              subscription_level: 2,
              is_leader: true,
              joined_at: m.created_at
            };
          }
        });
        setMemberships(membershipMap);
      }

      setMyMinistries(allMinistries);
    } catch (err: any) {
      console.error('Error loading my ministries:', err);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!authInitialized) return;
    const loadData = async () => {
      setLoading(true);
      await loadMyMinistries();
      setLoading(false);
    };
    loadData();
  }, [loadMyMinistries, authInitialized]);

  // Deep links handler
  useEffect(() => {
    if (loading || selectedMinistry) return;
    const dl = peekDeepLink();
    if (!dl?.id) return;

    (async () => {
      try {
        let targetMinistryId: string | null = null;
        if (dl.type === 'ministry-videos') {
          const { data: video } = await supabase.from('ministry_video_messages').select('ministry_id').eq('id', dl.id).maybeSingle();
          targetMinistryId = video?.ministry_id || null;
        } else if (dl.type === 'ministry-devotional') {
          const { data: dev } = await supabase.from('ministry_devotionals').select('ministry_id').eq('id', dl.id).maybeSingle();
          targetMinistryId = dev?.ministry_id || null;
        } else if (dl.type === 'ministry-prayer') {
          const { data: prayer } = await supabase.from('ministry_prayer_requests').select('ministry_id').eq('id', dl.id).maybeSingle();
          targetMinistryId = prayer?.ministry_id || null;
        } else if (dl.type === 'small-group') {
          const { data: sg } = await supabase.from('small_groups').select('ministry_id').eq('id', dl.id).maybeSingle();
          targetMinistryId = sg?.ministry_id || null;
        }

        if (!targetMinistryId) return;

        const known = myMinistries.find(m => m.id === targetMinistryId);
        if (known) {
          handleEnterMinistry(known);
          return;
        }
        const { data: ministry } = await supabase.from('ministry_groups').select('*').eq('id', targetMinistryId).maybeSingle();
        if (ministry) handleEnterMinistry(ministry);
      } catch (err) {
        console.error('Error resolving shared link:', err);
      }
    })();
  }, [loading]);

  const uploadMinistryImage = async (
    file: File,
    bucket: 'channel-logos' | 'channel-featured'
  ): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `ministry-${user?.id || 'temp'}-${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, file, { upsert: true });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return publicUrl;
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const url = await uploadMinistryImage(file, 'channel-logos');
      setFormData(prev => ({ ...prev, logo_url: url }));
      toast({ title: t('ministriesHub', 'logoUploaded', 'Logo uploaded') });
    } catch (err: any) {
      toast({ title: t('ministriesHub', 'uploadFailed', 'Upload failed'), description: err.message, variant: 'destructive' });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBanner(true);
    try {
      const url = await uploadMinistryImage(file, 'channel-featured');
      setFormData(prev => ({ ...prev, banner_url: url }));
      toast({ title: t('ministriesHub', 'featuredImageUploaded', 'Featured image uploaded') });
    } catch (err: any) {
      toast({ title: t('ministriesHub', 'uploadFailed', 'Upload failed'), description: err.message, variant: 'destructive' });
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleCreateMinistry = async () => {
    if (!formData.name.trim()) {
      toast({ title: t('ministriesHub', 'error', 'Error'), description: t('ministriesHub', 'ministryNameRequired', 'Ministry name is required'), variant: 'destructive' });
      return;
    }

    const slug = slugify(formData.slug || formData.name);
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) {
      toast({ title: t('ministriesHub', 'error', 'Error'), description: t('ministriesHub', 'handleInvalid', 'Web address must be 3–40 letters, numbers or hyphens.'), variant: 'destructive' });
      return;
    }
    if (RESERVED_HANDLES.has(slug)) {
      toast({ title: t('ministriesHub', 'error', 'Error'), description: t('ministriesHub', 'handleReserved', 'That web address is reserved. Please choose another.'), variant: 'destructive' });
      return;
    }

    setCreating(true);
    try {
      const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

      const { data, error } = await supabase
        .from('ministry_groups')
        .insert({
          name: formData.name.trim(),
          description: formData.description.trim(),
          category: formData.category,
          location: formData.location.trim(),
          country_code: formData.country_code || null,
          welcome_message: formData.welcome_message.trim(),
          logo_url: formData.logo_url.trim() || null,
          banner_url: formData.banner_url.trim() || null,
          is_public: formData.is_public,
          join_method: formData.join_method,
          theme_color: formData.theme_color,
          slug,
          invite_code: inviteCode,
          owner_id: user?.id,
          leader_id: user?.id,
          member_count: 1,
          is_active: true,
          settings: { allow_broadcasts: true, public_join: formData.join_method === 'open' }
        })
        .select()
        .single();

      if (error) throw error;

      await supabase
        .from('ministry_group_members')
        .insert({
          ministry_id: data.id,
          group_id: data.id,
          user_id: user?.id,
          role: 'admin',
          is_leader: true,
          joined_at: new Date().toISOString()
        });

      toast({ title: t('ministriesHub', 'success', 'Success'), description: t('ministriesHub', 'ministryCreated', 'Ministry created successfully!') });
      setShowCreateModal(false);
      setFormData({
        name: '',
        description: '',
        category: 'General',
        location: '',
        country_code: '',
        welcome_message: '',
        logo_url: '',
        banner_url: '',
        is_public: true,
        join_method: 'open',
        theme_color: '#7c3aed',
        slug: ''
      });
      setSlugEdited(false);
      loadMyMinistries();
    } catch (err: any) {
      const taken = /uniq_ministry_groups_slug|duplicate key/i.test(err?.message || '');
      toast({
        title: t('ministriesHub', 'error', 'Error'),
        description: taken ? t('ministriesHub', 'handleTaken', 'That web address is already taken. Please choose another.') : err.message,
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleEnterMinistry = (ministry: Ministry) => {
    setSelectedMinistry(ministry);
    setActiveView('ministry-space');
    setSelectedMinistryId(ministry.id, { replace: true });
  };

  const handleExitMinistry = () => {
    setSelectedMinistry(null);
    setActiveView('my-ministries');
    setSelectedMinistryId('', { replace: true });
  };

  useEffect(() => {
    if (loading || activeView !== 'ministry-space' || selectedMinistry || !selectedMinistryId) return;
    const found = myMinistries.find(m => m.id === selectedMinistryId);
    if (found) {
      setSelectedMinistry(found);
    } else {
      handleExitMinistry();
    }
  }, [loading, activeView, selectedMinistry, selectedMinistryId, myMinistries]);

  // QR Scanner logic
  const stopScanner = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const processDetectedCode = (raw: string) => {
    stopScanner();
    setShowCodeJoinModal(false);
    let extractedCode = raw.trim();
    try {
      if (raw.startsWith('http://') || raw.startsWith('https://')) {
        const url = new URL(raw);
        const codeParam = url.searchParams.get('code');
        if (codeParam) extractedCode = codeParam;
      }
    } catch { /* use raw */ }
    window.location.href = `/join-ministry?code=${encodeURIComponent(extractedCode)}`;
  };

  const startScanner = async () => {
    setScanError(null);

    if (!('BarcodeDetector' in window)) {
      setScanError('QR scanning not supported on this device. Please type the code manually.');
      return;
    }

    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      const detectFrame = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0 && barcodes[0].rawValue) {
            processDetectedCode(barcodes[0].rawValue);
            return;
          }
        } catch (e) {
          console.error('BarcodeDetector error:', e);
        }
        animFrameRef.current = requestAnimationFrame(detectFrame);
      };
      animFrameRef.current = requestAnimationFrame(detectFrame);
    } catch (err: any) {
      console.error('Camera access error:', err);
      stopScanner();
      setScanError('QR scanning not supported on this device. Please type the code manually.');
    }
  };

  if (activeView === 'ministry-space' && selectedMinistry) {
    const membership = memberships[selectedMinistry.id];
    return (
      <MinistrySpace
        ministry={selectedMinistry}
        membership={membership}
        onExit={handleExitMinistry}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  const firstName = (profile?.full_name || '').trim().split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12
    ? t('ministriesHub', 'goodMorning', 'Good morning')
    : hour < 18
      ? t('ministriesHub', 'goodAfternoon', 'Good afternoon')
      : t('ministriesHub', 'goodEvening', 'Good evening');
  const welcomeVerse = WELCOME_VERSES[Math.floor(Date.now() / 86_400_000) % WELCOME_VERSES.length];

  return (
    <div className="space-y-6">
      {/* Welcome hero — compact */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 p-5 sm:p-7 text-white shadow-lg shadow-indigo-500/20">
        <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-20 h-64 w-64 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="relative mx-auto max-w-2xl flex flex-col items-center text-center">
          <p className="text-sm font-medium text-white/80">
            {greeting}{firstName ? `, ${firstName}` : ''} 👋
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight">
            {t('ministriesHub', 'heroTitle', 'Welcome to your faith community')}
          </h1>
          <p className="mt-2 text-white/85">
            {t('ministriesHub', 'heroSubtitle', 'Discover ministries, grow together, and stay connected wherever you are.')}
          </p>

          <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/15 backdrop-blur-sm">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
            <p className="text-sm italic text-white/90">{welcomeVerse}</p>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            {(is_ministry_Leader || isAdmin) && (
              <Button
                variant="outline"
                className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('ministriesHub', 'createMinistry', 'Create Ministry')}
              </Button>
            )}
            <Button
              className="bg-white text-indigo-700 hover:bg-white/90 shadow-sm font-semibold"
              onClick={() => {
                setJoinCodeInput('');
                setScanError(null);
                setShowCodeJoinModal(true);
              }}
            >
              <QrCode className="h-4 w-4 mr-2" />
              {t('ministriesHub', 'joinWithCode', 'Join with Code')}
            </Button>
          </div>

          <div className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-1.5 text-sm text-white/85">
            <span className="flex items-center gap-1.5">
              <Heart className="h-4 w-4" />
              {t('ministriesHub', 'statYourMinistries', '{count} your ministries').replace('{count}', String(myMinistries.length))}
            </span>
          </div>
        </div>
      </div>

      {/* Your Ministries grid */}
      <div className="space-y-4">
        {myMinistries.length === 0 ? (
          <Card className="p-8 text-center">
            <Heart className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">{t('ministriesHub', 'noMinistriesYet', 'No Ministries Yet')}</h3>
            <p className="text-gray-500 mb-4">{t('ministriesHub', 'joinToConnect', 'Join a ministry to connect with a faith community')}</p>
            <Button
              onClick={() => {
                setJoinCodeInput('');
                setScanError(null);
                setShowCodeJoinModal(true);
              }}
            >
              <QrCode className="h-4 w-4 mr-2" />
              {t('ministriesHub', 'joinWithCode', 'Join with Code')}
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myMinistries.map(ministry => {
              const membership = memberships[ministry.id];
              const color = ministry.theme_color || '#7c3aed';
              return (
                <Card
                  key={ministry.id}
                  className="group overflow-hidden border-gray-200/70 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl cursor-pointer"
                  onClick={() => handleEnterMinistry(ministry)}
                >
                  <div
                    className="relative h-16 overflow-hidden"
                    style={ministry.banner_url
                      ? { backgroundImage: `url(${ministry.banner_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                      : { background: `linear-gradient(135deg, ${color} 0%, ${color}99 100%)` }
                    }
                  >
                    <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/15 blur-2xl" />
                  </div>
                  <CardContent className="p-4 -mt-5 relative">
                    <div className="flex items-start justify-between">
                      <div className="w-12 h-12 rounded-lg bg-white shadow flex items-center justify-center border">
                        {ministry.logo_url ? (
                          <img src={ministry.logo_url} alt={ministry.name} className="w-10 h-10 rounded object-cover" />
                        ) : (
                          <Building2 className="h-6 w-6 text-purple-600" />
                        )}
                      </div>

                      <Badge className={
                        membership?.is_leader ? 'bg-amber-500' :
                        membership?.role === 'admin' ? 'bg-purple-600' :
                        membership?.subscription_level === 2 ? 'bg-blue-600' :
                        'bg-gray-500'
                      }>
                        {membership?.is_leader ? (
                          <><Crown className="h-3 w-3 mr-1" />{t('ministriesHub', 'roleLeader', 'Leader')}</>
                        ) : membership?.role === 'admin' ? (
                          <><Shield className="h-3 w-3 mr-1" />{t('ministriesHub', 'roleAdmin', 'Admin')}</>
                        ) : membership?.subscription_level === 2 ? (
                          t('ministriesHub', 'rolePremium', 'Premium')
                        ) : (
                          t('ministriesHub', 'roleMember', 'Member')
                        )}
                      </Badge>
                    </div>

                    <h3 className="font-bold text-lg mt-3">{ministry.name}</h3>
                    {ministry.description && (
                      <p className="text-sm text-gray-500 line-clamp-2 mt-1">{ministry.description}</p>
                    )}
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-2">
                      <Users className="h-4 w-4" />
                      {t('ministriesHub', 'membersCount', '{count} members').replace('{count}', String(ministry.member_count || 0))}
                    </p>

                    <Button className="w-full mt-4 bg-gradient-to-br from-purple-600 to-indigo-700 text-white shadow-sm transition-transform hover:scale-105 hover:text-white rounded-xl" size="sm">
                      {t('ministriesHub', 'enterMinistry', 'Enter Ministry')}
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Join with Code Modal */}
      <Dialog open={showCodeJoinModal} onOpenChange={(open) => {
        if (!open) stopScanner();
        setShowCodeJoinModal(open);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-purple-600" />
              {t('ministriesHub', 'joinWithCode', 'Join with Code')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>{t('ministriesHub', 'enterInviteCode', 'Enter Invite Code')}</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  placeholder="e.g. ABC12345"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && joinCodeInput.trim()) {
                      window.location.href = `/join-ministry?code=${encodeURIComponent(joinCodeInput.trim())}`;
                    }
                  }}
                  className="font-mono uppercase"
                />
                <Button
                  disabled={!joinCodeInput.trim()}
                  onClick={() => {
                    window.location.href = `/join-ministry?code=${encodeURIComponent(joinCodeInput.trim())}`;
                  }}
                >
                  {t('ministriesHub', 'join', 'Join')}
                </Button>
              </div>
            </div>

            <div className="relative flex items-center justify-center my-2">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
              <span className="relative bg-white px-2 text-xs text-gray-500 uppercase">{t('ministriesHub', 'or', 'OR')}</span>
            </div>

            <div>
              {!scanning ? (
                <Button
                  variant="outline"
                  className="w-full flex items-center justify-center gap-2"
                  onClick={startScanner}
                >
                  <QrCode className="h-4 w-4" />
                  {t('ministriesHub', 'scanQrCode', 'Scan QR Code')}
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="relative aspect-square w-full max-w-xs mx-auto overflow-hidden rounded-xl bg-black border-2 border-purple-500">
                    <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                    <div className="absolute inset-0 border-2 border-dashed border-white/60 rounded-xl pointer-events-none" />
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={stopScanner}
                  >
                    {t('ministriesHub', 'cancelScan', 'Cancel Scanning')}
                  </Button>
                </div>
              )}

              {scanError && (
                <p className="text-xs text-amber-600 bg-amber-50 p-2.5 rounded-lg border border-amber-200 mt-2 text-center">
                  {scanError}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { stopScanner(); setShowCodeJoinModal(false); }}>
              {t('ministriesHub', 'close', 'Close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Ministry Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-purple-600" />
              {t('ministriesHub', 'createNewMinistry', 'Create New Ministry')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('ministriesHub', 'ministryNameLabel', 'Ministry Name *')}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('ministriesHub', 'ministryNamePlaceholder', 'e.g., Grace Community Church')}
              />
            </div>

            <div>
              <Label>{t('ministriesHub', 'webAddressLabel', 'Web Address (White Label)')}</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  value={formData.slug}
                  onChange={(e) => { setSlugEdited(true); setFormData({ ...formData, slug: slugify(e.target.value) }); }}
                  placeholder={t('ministriesHub', 'webAddressPlaceholder', 'grace')}
                  className="flex-1"
                />
                <span className="text-sm text-gray-500 whitespace-nowrap">.{MINISTRY_DOMAIN}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {t('ministriesHub', 'webAddressHelper', 'Your ministry will live at')}{' '}
                <span className="font-mono text-purple-600">{(formData.slug || slugify(formData.name)) || 'your-church'}.{MINISTRY_DOMAIN}</span>. {t('ministriesHub', 'webAddressHelper2', 'You can connect your own custom domain later.')}
              </p>
            </div>
            <div>
              <Label>{t('ministriesHub', 'descriptionLabel', 'Description')}</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('ministriesHub', 'descriptionPlaceholder', 'Tell people about your ministry...')}
                rows={3}
              />
            </div>

            <div>
              <Label>{t('ministriesHub', 'ministryLogoLabel', 'Ministry Logo')}</Label>
              <div className="flex items-center gap-3 mt-1">
                {formData.logo_url ? (
                  <img src={formData.logo_url} alt={t('ministriesHub', 'logoPreviewAlt', 'Logo preview')} className="w-14 h-14 rounded-lg object-cover border" />
                ) : (
                  <div className="w-14 h-14 rounded-lg border flex items-center justify-center bg-gray-50 flex-shrink-0">
                    <ImageIcon className="h-5 w-5 text-gray-300" />
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <Input
                    value={formData.logo_url}
                    onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                    placeholder={t('ministriesHub', 'pasteImageUrl', 'Paste image URL…')}
                  />
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-purple-600 cursor-pointer hover:text-purple-700">
                    {uploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {uploadingLogo ? t('ministriesHub', 'uploading', 'Uploading…') : t('ministriesHub', 'uploadFile', 'Upload file')}
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                  </label>
                </div>
              </div>
            </div>

            <div>
              <Label>{t('ministriesHub', 'featuredImageLabel', 'Featured Image')}</Label>
              <div className="mt-1 space-y-2">
                {formData.banner_url ? (
                  <img src={formData.banner_url} alt={t('ministriesHub', 'featuredPreviewAlt', 'Featured preview')} className="w-full h-28 rounded-lg object-cover border" />
                ) : (
                  <div className="w-full h-28 rounded-lg border flex items-center justify-center bg-gray-50">
                    <ImageIcon className="h-6 w-6 text-gray-300" />
                  </div>
                )}
                <Input
                  value={formData.banner_url}
                  onChange={(e) => setFormData({ ...formData, banner_url: e.target.value })}
                  placeholder={t('ministriesHub', 'pasteImageUrl', 'Paste image URL…')}
                />
                <label className="inline-flex items-center gap-2 text-xs font-medium text-purple-600 cursor-pointer hover:text-purple-700">
                  {uploadingBanner ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {uploadingBanner ? t('ministriesHub', 'uploading', 'Uploading…') : t('ministriesHub', 'uploadFile', 'Upload file')}
                  <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} disabled={uploadingBanner} />
                </label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('ministriesHub', 'categoryLabel', 'Category')}</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MINISTRY_CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('ministriesHub', 'locationLabel', 'Location')}</Label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder={t('ministriesHub', 'locationPlaceholder', 'City, Country')}
                />
              </div>
            </div>
            <div>
              <Label>{t('ministriesHub', 'countryLabel', 'Country')}</Label>
              <Select
                value={formData.country_code || undefined}
                onValueChange={(value) => setFormData({ ...formData, country_code: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('ministriesHub', 'selectCountry', 'Select country')} />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_OPTIONS.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                {t('ministriesHub', 'countryHelper', 'Used for region-specific features. Choose United Kingdom to enable Gift Aid.')}
              </p>
            </div>
            <div>
              <Label>{t('ministriesHub', 'welcomeMessageLabel', 'Welcome Message')}</Label>
              <Textarea
                value={formData.welcome_message}
                onChange={(e) => setFormData({ ...formData, welcome_message: e.target.value })}
                placeholder={t('ministriesHub', 'welcomeMessagePlaceholder', 'Welcome message for new members...')}
                rows={2}
              />
            </div>
            <div>
              <Label>{t('ministriesHub', 'themeColorLabel', 'Theme Color')}</Label>
              <div className="flex gap-2 mt-2">
                {['#7c3aed', '#2563eb', '#059669', '#dc2626', '#ea580c', '#0891b2'].map(color => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-full border-2 ${formData.theme_color === color ? 'border-gray-900' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormData({ ...formData, theme_color: color })}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <Label>{t('ministriesHub', 'publicMinistryLabel', 'Public Ministry')}</Label>
                <p className="text-xs text-gray-500">{t('ministriesHub', 'anyoneCanDiscover', 'Anyone can discover and join')}</p>
              </div>
              <Switch
                checked={formData.is_public}
                onCheckedChange={(v) => setFormData({ ...formData, is_public: v })}
              />
            </div>
            <div>
              <Label>{t('ministriesHub', 'joinMethodLabel', 'Join Method')}</Label>
              <Select
                value={formData.join_method}
                onValueChange={(v) => setFormData({ ...formData, join_method: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">{t('ministriesHub', 'joinMethodOpen', 'Open - Anyone can join')}</SelectItem>
                  <SelectItem value="approval">{t('ministriesHub', 'joinMethodApproval', 'Approval Required')}</SelectItem>
                  <SelectItem value="invite">{t('ministriesHub', 'joinMethodInvite', 'Invite Only')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>{t('ministriesHub', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleCreateMinistry} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('ministriesHub', 'createMinistry', 'Create Ministry')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MinistriesHub;
