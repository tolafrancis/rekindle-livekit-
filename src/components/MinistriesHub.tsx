import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Label } from './ui/label';
import { COUNTRY_OPTIONS } from '@/lib/giftAid';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { supabase } from '@/lib/supabase';
import { toast } from './ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Search, Plus, Users, Crown, Shield, Settings,
  Globe, Lock, Link, Copy, Check, QrCode, Loader2,
  ChevronRight, Building2, MapPin, Heart, X, ArrowLeft,
  BookOpen, LayoutDashboard, Upload, Image as ImageIcon
} from 'lucide-react';
import MinistrySpace from './MinistrySpace';
import { MinistryDevotionalCreator } from './MinistryDevotionalCreator';
import { MinistryManagement } from './ministry/MinistryManagement';
import {
  SearchFilterPanel,
  searchFilterIconClass,
  searchFilterInputClass,
  searchFilterSelectTriggerClass
} from './SearchFilterPanel';

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

interface MinistrySubscription {
  ministry_id: string;
  plan_type: string;
  status: string;
}

const MINISTRY_CATEGORIES = [
  'General', 'Youth', 'Women', 'Men', 'Children', 'Worship',
  'Prayer', 'Outreach', 'Missions', 'Education', 'Family', 'Singles'
];

type MinistryHubView = 'discover' | 'my-ministries' | 'manage' | 'ministry-space' | 'ministry-management';

interface MinistriesHubProps {
  activeView?: MinistryHubView;
  onActiveViewChange?: (view: MinistryHubView) => void;
  onWorkspaceChange?: (active: boolean) => void;
}

const MinistriesHub: React.FC<MinistriesHubProps> = ({ activeView: controlledActiveView, onActiveViewChange, onWorkspaceChange }) => {
  const { user, profile, isAdmin: authIsAdmin, isPartner } = useAuth();
  const { t } = useLanguage();
  const [internalActiveView, setInternalActiveView] = useState<MinistryHubView>('discover');
  const activeView = controlledActiveView ?? internalActiveView;
  const setActiveView = useCallback((view: MinistryHubView) => {
    setInternalActiveView(view);
    onActiveViewChange?.(view);
  }, [onActiveViewChange]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [myMinistries, setMyMinistries] = useState<Ministry[]>([]);
  const [memberships, setMemberships] = useState<Record<string, MembershipInfo>>({});
  const [subscriptions, setSubscriptions] = useState<Record<string, MinistrySubscription>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedMinistry, setSelectedMinistry] = useState<Ministry | null>(null);
  const [managingMinistry, setManagingMinistry] = useState<Ministry | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

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
    theme_color: '#7c3aed'
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  const is_ministry_Leader = ['ministry', 'ministry_plus', 'ministry_starter', 'ministry_growth', 'ministry_enterprise'].includes(profile?.subscription_tier || '') || isPartner || authIsAdmin;
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  useEffect(() => {
    onWorkspaceChange?.(activeView === 'ministry-space' && !!selectedMinistry);
    return () => onWorkspaceChange?.(false);
  }, [activeView, selectedMinistry, onWorkspaceChange]);

  // Get approved ministries that the user owns/leads
  const approvedOwnedMinistries = myMinistries.filter(m => 
    (m.owner_id === user?.id || m.leader_id === user?.id || memberships[m.id]?.is_leader) &&
    (m.approval_status === 'approved' || !m.approval_status) // Default to approved if no status
  );


  const loadMinistries = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('ministry_groups')
        .select('*')
        .eq('is_active', true)
        .eq('is_public', true)
        .order('member_count', { ascending: false });

      if (error) throw error;
      setMinistries(data || []);
    } catch (err: any) {
      console.error('Error loading ministries:', err);
    }
  }, []);

  // Load user's ministries
  const loadMyMinistries = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Get memberships
      const { data: memberData, error: memberError } = await supabase
        .from('ministry_group_members')
        .select('*')
        .eq('user_id', user.id);

      if (memberError) throw memberError;

      const membershipMap: Record<string, MembershipInfo> = {};
      const ministryIds = (memberData || []).map(m => {
        membershipMap[m.group_id] = {
          ministry_id: m.group_id,
          role: m.role,
          subscription_level: m.subscription_level || 1,
          is_leader: m.is_leader || false,
          joined_at: m.joined_at
        };
        return m.group_id;
      });

      setMemberships(membershipMap);

      // Initialize ministryData array to collect all ministries
      let allMinistries: Ministry[] = [];

      if (ministryIds.length > 0) {
        const { data: ministryData, error: ministryError } = await supabase
          .from('ministry_groups')
          .select('*')
          .in('id', ministryIds);

        if (ministryError) throw ministryError;
        allMinistries = ministryData || [];
      }

      // Also include ministries owned by user
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
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadMinistries(), loadMyMinistries()]);
      setLoading(false);
    };
    loadData();
  }, [loadMinistries, loadMyMinistries]);

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

      // Add creator as admin member
      const { error: memberError } = await supabase
        .from('ministry_group_members')
        .insert({
          ministry_id: data.id,
          group_id: data.id,
          user_id: user?.id,
          role: 'admin',
          is_leader: true,
          joined_at: new Date().toISOString()
        });

      if (memberError) {
        console.error('Error adding creator as admin:', memberError);
        // Continue anyway - ministry is created
      }

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
        theme_color: '#7c3aed'
      });
      loadMinistries();
      loadMyMinistries();
    } catch (err: any) {
      toast({ title: t('ministriesHub', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleJoinMinistry = async (ministry: Ministry) => {
    if (!user?.id) {
      toast({ title: t('ministriesHub', 'error', 'Error'), description: t('ministriesHub', 'signInToJoin', 'Please sign in to join'), variant: 'destructive' });
      return;
    }

    setJoining(true);
    try {
      // Check if already a member
      const { data: existing, error: checkError } = await supabase
        .from('ministry_group_members')
        .select('id')
        .eq('group_id', ministry.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking membership:', checkError);
        throw checkError;
      }

      if (existing) {
        toast({ title: t('ministriesHub', 'alreadyJoined', 'Already Joined'), description: t('ministriesHub', 'alreadyMember', 'You are already a member of this ministry') });
        setJoining(false);
        return;
      }

      // Add as member
      const { error: insertError } = await supabase
        .from('ministry_group_members')
        .insert({
          ministry_id: ministry.id,
          group_id: ministry.id,
          user_id: user.id,
          role: 'member',
          is_leader: false,
          joined_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('Error joining ministry:', insertError);
        toast({
          title: t('ministriesHub', 'error', 'Error'),
          description: t('ministriesHub', 'failedToJoin', 'Failed to join ministry. Please try again.'),
          variant: 'destructive'
        });
        setJoining(false);
        return;
      }

      // Update member count
      await supabase
        .from('ministry_groups')
        .update({ member_count: (ministry.member_count || 0) + 1 })
        .eq('id', ministry.id);

      toast({ title: t('ministriesHub', 'welcome', 'Welcome!'), description: t('ministriesHub', 'youHaveJoinedX', 'You have joined {name}').replace('{name}', ministry.name) });
      loadMyMinistries();
      setShowJoinModal(false);
      setSelectedMinistry(null);
    } catch (err: any) {
      toast({ title: t('ministriesHub', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setJoining(false);
    }
  };

  const handleJoinByCode = async () => {
    if (!joinCode.trim()) {
      toast({ title: t('ministriesHub', 'error', 'Error'), description: t('ministriesHub', 'enterInviteCode', 'Please enter an invite code'), variant: 'destructive' });
      return;
    }

    setJoining(true);
    try {
      const { data: ministry, error } = await supabase
        .from('ministry_groups')
        .select('*')
        .eq('invite_code', joinCode.trim().toUpperCase())
        .maybeSingle();

      if (error) {
        console.error('Error fetching ministry:', error);
        toast({ title: t('ministriesHub', 'error', 'Error'), description: t('ministriesHub', 'failedValidateCode', 'Failed to validate invite code'), variant: 'destructive' });
        setJoining(false);
        return;
      }

      if (!ministry) {
        toast({ title: t('ministriesHub', 'error', 'Error'), description: t('ministriesHub', 'invalidInviteCode', 'Invalid invite code'), variant: 'destructive' });
        setJoining(false);
        return;
      }

      await handleJoinMinistry(ministry);
      setJoinCode('');
    } catch (err: any) {
      toast({ title: t('ministriesHub', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setJoining(false);
    }
  };

  const handleEnterMinistry = (ministry: Ministry) => {
    setSelectedMinistry(ministry);
    setActiveView('ministry-space');
  };

  const handleExitMinistry = () => {
    setSelectedMinistry(null);
    setActiveView('my-ministries');
  };

  const copyInviteLink = (code: string) => {
    const link = `${window.location.origin}/join-ministry?code=${code}`;
    navigator.clipboard.writeText(link);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
    toast({ title: t('ministriesHub', 'copied', 'Copied!'), description: t('ministriesHub', 'inviteLinkCopied', 'Invite link copied to clipboard') });
  };

  const filteredMinistries = ministries.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || m.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // If viewing a ministry space, render that instead
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-500">{t('ministriesHub', 'headerSubtitle', 'Connect with faith communities and grow together')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowJoinModal(true)}>
            <Link className="h-4 w-4 mr-2" />
            {t('ministriesHub', 'joinByCode', 'Join by Code')}
          </Button>
          {(is_ministry_Leader || isAdmin) && (
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('ministriesHub', 'createMinistry', 'Create Ministry')}
            </Button>
          )}
        </div>
      </div>

      {/* Navigation Tabs — the Discover / My Ministries / Manage switcher is
          provided by the app's secondary navigation (sidebar on desktop, the
          nav card on mobile), so it is not duplicated here. */}
      <Tabs value={activeView} onValueChange={(v) => setActiveView(v as any)}>
        {/* Discover Ministries */}
        <TabsContent value="discover" className="space-y-4 mt-6">
          {/* Search & Filter */}
          <SearchFilterPanel icon={<Globe className="h-6 w-6 text-white/60" />}>
            <div className="relative flex-1">
              <Search className={searchFilterIconClass} />
              <Input
                placeholder={t('ministriesHub', 'searchPlaceholder', 'Search ministries...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={searchFilterInputClass}
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className={`w-full md:w-48 ${searchFilterSelectTriggerClass}`}>
                <SelectValue placeholder={t('ministriesHub', 'categoryPlaceholder', 'Category')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('ministriesHub', 'allCategories', 'All Categories')}</SelectItem>
                {MINISTRY_CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SearchFilterPanel>

          {/* Ministry Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMinistries.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <Building2 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-700">{t('ministriesHub', 'noMinistriesFound', 'No ministries found')}</h3>
                <p className="text-gray-500">{t('ministriesHub', 'adjustSearch', 'Try adjusting your search or filters')}</p>
              </div>
            ) : (
              filteredMinistries.map(ministry => {
                const isMember = !!memberships[ministry.id];
                return (
                  <Card key={ministry.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                    {/* Banner */}
                    <div 
                      className="h-24 bg-gradient-to-r from-purple-600 to-indigo-600"
                      style={ministry.banner_url ? { backgroundImage: `url(${ministry.banner_url})`, backgroundSize: 'cover' } : { backgroundColor: ministry.theme_color || '#7c3aed' }}
                    />
                    <CardContent className="p-4 -mt-8 relative">
                      {/* Logo */}
                      <div className="w-16 h-16 rounded-xl bg-white shadow-lg flex items-center justify-center mb-3 border-2 border-white">
                        {ministry.logo_url ? (
                          <img src={ministry.logo_url} alt={ministry.name} className="w-12 h-12 rounded-lg object-cover" />
                        ) : (
                          <Building2 className="h-8 w-8 text-purple-600" />
                        )}
                      </div>

                      <h3 className="font-bold text-lg mb-1">{ministry.name}</h3>
                      <p className="text-sm text-gray-600 line-clamp-2 mb-3">{ministry.description || t('ministriesHub', 'aFaithCommunity', 'A faith community')}</p>

                      <div className="flex items-center gap-3 text-sm text-gray-500 mb-4">
                        <span className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {ministry.member_count || 0}
                        </span>
                        {ministry.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            {ministry.location}
                          </span>
                        )}
                        <Badge variant="secondary">{ministry.category || 'General'}</Badge>
                      </div>

                      {isMember ? (
                        <Button 
                          className="w-full" 
                          onClick={() => handleEnterMinistry(ministry)}
                        >
                          {t('ministriesHub', 'enterMinistry', 'Enter Ministry')}
                          <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                      ) : (
                        <Button
                          className="w-full"
                          variant="outline"
                          onClick={() => {
                            setSelectedMinistry(ministry);
                            setShowJoinModal(true);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          {t('ministriesHub', 'joinMinistry', 'Join Ministry')}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* My Ministries */}
        <TabsContent value="my-ministries" className="space-y-4 mt-6">
          {myMinistries.length === 0 ? (
            <Card className="p-8 text-center">
              <Heart className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">{t('ministriesHub', 'noMinistriesYet', 'No Ministries Yet')}</h3>
              <p className="text-gray-500 mb-4">{t('ministriesHub', 'joinToConnect', 'Join a ministry to connect with a faith community')}</p>
              <Button onClick={() => setActiveView('discover')}>
                <Globe className="h-4 w-4 mr-2" />
                {t('ministriesHub', 'discoverMinistries', 'Discover Ministries')}
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myMinistries.map(ministry => {
                const membership = memberships[ministry.id];
                return (
                  <Card 
                    key={ministry.id} 
                    className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => handleEnterMinistry(ministry)}
                  >
                    <div 
                      className="h-20"
                      style={{ backgroundColor: ministry.theme_color || '#7c3aed' }}
                    />
                    <CardContent className="p-4 -mt-6 relative">
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
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                        <Users className="h-4 w-4" />
                        {t('ministriesHub', 'membersCount', '{count} members').replace('{count}', String(ministry.member_count || 0))}
                      </p>

                      <Button className="w-full mt-4" size="sm">
                        {t('ministriesHub', 'enterMinistry', 'Enter Ministry')}
                        <ChevronRight className="h-4 w-4 ml-2" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Manage Ministries */}
        <TabsContent value="manage" className="space-y-4 mt-6">
          {!is_ministry_Leader && !isAdmin ? (
            <Card className="p-8 text-center">
              <Crown className="h-12 w-12 mx-auto text-amber-500 mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">{t('ministriesHub', 'premiumFeature', 'Premium Feature')}</h3>
              <p className="text-gray-500 mb-4">{t('ministriesHub', 'upgradeToManage', 'Upgrade to Ministry tier to create and manage ministries')}</p>
              <Button>{t('ministriesHub', 'upgradeNow', 'Upgrade Now')}</Button>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">{t('ministriesHub', 'yourMinistries', 'Your Ministries')}</h3>
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('ministriesHub', 'createNew', 'Create New')}
                </Button>
              </div>

              {myMinistries.filter(m => memberships[m.id]?.is_leader || m.owner_id === user?.id).length === 0 ? (
                <Card className="p-8 text-center">
                  <Building2 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">{t('ministriesHub', 'noMinistriesCreated', 'No Ministries Created')}</h3>
                  <p className="text-gray-500 mb-4">{t('ministriesHub', 'createFirstMinistry', 'Create your first ministry to start building your community')}</p>
                  <Button onClick={() => setShowCreateModal(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('ministriesHub', 'createMinistry', 'Create Ministry')}
                  </Button>
                </Card>
              ) : (
                <div className="space-y-4">
                  {myMinistries
                    .filter(m => memberships[m.id]?.is_leader || m.owner_id === user?.id)
                    .map(ministry => (
                      <Card key={ministry.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div 
                              className="w-12 h-12 rounded-lg flex items-center justify-center"
                              style={{ backgroundColor: ministry.theme_color || '#7c3aed' }}
                            >
                              <Building2 className="h-6 w-6 text-white" />
                            </div>
                            <div>
                              <h4 className="font-semibold">{ministry.name}</h4>
                              <p className="text-sm text-gray-500">
                                {t('ministriesHub', 'membersCount', '{count} members').replace('{count}', String(ministry.member_count || 0))} • {ministry.category}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 bg-gray-100 px-3 py-1 rounded-lg">
                              <code className="text-sm font-mono">{ministry.invite_code}</code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyInviteLink(ministry.invite_code);
                                }}
                              >
                                {copiedCode === ministry.invite_code ? (
                                  <Check className="h-3 w-3 text-green-500" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleEnterMinistry(ministry)}
                            >
                              {t('ministriesHub', 'manage', 'Manage')}
                              <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

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
              <Label>{t('ministriesHub', 'descriptionLabel', 'Description')}</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('ministriesHub', 'descriptionPlaceholder', 'Tell people about your ministry...')}
                rows={3}
              />
            </div>

            {/* Ministry Logo */}
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

            {/* Featured Image */}
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

      {/* Join Ministry Modal */}
      <Dialog open={showJoinModal} onOpenChange={setShowJoinModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedMinistry ? t('ministriesHub', 'joinX', 'Join {name}').replace('{name}', selectedMinistry.name) : t('ministriesHub', 'joinMinistry', 'Join Ministry')}
            </DialogTitle>
          </DialogHeader>
          
          {selectedMinistry ? (
            <div className="space-y-4">
              <div 
                className="h-24 rounded-lg"
                style={{ backgroundColor: selectedMinistry.theme_color || '#7c3aed' }}
              />
              <div className="-mt-8 px-4">
                <div className="w-16 h-16 rounded-xl bg-white shadow-lg flex items-center justify-center border-2 border-white">
                  <Building2 className="h-8 w-8 text-purple-600" />
                </div>
              </div>
              <div className="px-4">
                <h3 className="font-bold text-xl">{selectedMinistry.name}</h3>
                <p className="text-gray-600 mt-1">{selectedMinistry.description}</p>
                <div className="flex items-center gap-3 mt-3 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {t('ministriesHub', 'membersCount', '{count} members').replace('{count}', String(selectedMinistry.member_count || 0))}
                  </span>
                  <Badge variant="secondary">{selectedMinistry.category}</Badge>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowJoinModal(false); setSelectedMinistry(null); }}>
                  {t('ministriesHub', 'cancel', 'Cancel')}
                </Button>
                <Button onClick={() => handleJoinMinistry(selectedMinistry)} disabled={joining}>
                  {joining ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {t('ministriesHub', 'joinMinistry', 'Join Ministry')}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-600">{t('ministriesHub', 'enterCodeToJoin', 'Enter an invite code to join a ministry')}</p>
              <div>
                <Label>{t('ministriesHub', 'inviteCodeLabel', 'Invite Code')}</Label>
                <Input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder={t('ministriesHub', 'inviteCodePlaceholder', 'Enter code (e.g., ABC123XY)')}
                  className="font-mono"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowJoinModal(false)}>{t('ministriesHub', 'cancel', 'Cancel')}</Button>
                <Button onClick={handleJoinByCode} disabled={joining || !joinCode.trim()}>
                  {joining ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {t('ministriesHub', 'join', 'Join')}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MinistriesHub;
