import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useViewHistory } from '@rekindle/features/hooks/useViewHistory';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/use-toast';
import { 
  Radio, 
  Plus, 
  Search, 
  RefreshCw, 
  Loader2, 
  Edit, 
  Trash2, 
  Eye, 
  EyeOff,
  Users, 
  Calendar,
  BarChart3,
  Settings,
  Upload,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
  Pause,
  Ban,
  Video,
  MessageSquare,
  User,
  Mail
} from 'lucide-react';
import { LiveChannel, ChannelCategory, CHANNEL_CATEGORIES } from '@rekindle/types/liveChannelTypes';
import { ChannelStreamConfig } from './ChannelStreamConfig';
import { useLanguage } from '@/contexts/LanguageContext';

interface ChannelStats {
  total_followers: number;
  total_events: number;
  upcoming_events: number;
  completed_events: number;
  total_views: number;
}

interface ChannelSubscriber {
  id: string;
  channel_id: string;
  user_id: string;
  phone_number: string;
  subscribed_at: string;
  user_profiles: {
    full_name: string | null;
    email: string | null;
  } | null;
}

interface ChannelEvent {
  id: string;
  channel_id: string;
  title: string;
  description: string;
  scheduled_start: string;
  scheduled_end: string | null;
  status: 'upcoming' | 'live' | 'ended' | 'cancelled';
  is_video_enabled: boolean;
  total_registered: number;
  created_at: string;
}

export const AdminLiveChannelManager: React.FC = () => {
  const { t } = useLanguage();
  // State management
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useViewHistory<string>("admin-livechannel", 'channels');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Selected data
  const [selectedChannel, setSelectedChannel] = useState<LiveChannel | null>(null);
  const [streamConfigChannel, setStreamConfigChannel] = useState<LiveChannel | null>(null);
  const [channelStats, setChannelStats] = useState<ChannelStats | null>(null);
  const [channelEvents, setChannelEvents] = useState<ChannelEvent[]>([]);
  const [showSubscribersModal, setShowSubscribersModal] = useState(false);
  const [channelSubscribers, setChannelSubscribers] = useState<ChannelSubscriber[]>([]);
  const [subscriberSearch, setSubscriberSearch] = useState('');

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'general' as ChannelCategory,
    featured_image_url: '',
    channel_logo_url: '',
    is_featured: false,
    is_active: true,
    owner_id: ''
  });

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFeatured, setUploadingFeatured] = useState(false);
  const [saving, setSaving] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const featuredInputRef = useRef<HTMLInputElement>(null);

  // Load all channels
  const loadChannels = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('live_channels')
        .select(`
          *,
          followers:channel_followers(count),
          events:channel_events(count)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const channelsData = data || [];

      // Attach owner profiles. owner_id references the auth user id, which is the
      // primary key (user_id) on user_profiles — so we resolve it with one bulk query.
      const ownerIds = [...new Set(channelsData.map((c: any) => c.owner_id).filter(Boolean))];
      let ownerMap: Record<string, { full_name: string | null; email: string | null }> = {};
      if (ownerIds.length > 0) {
        const { data: owners } = await supabase
          .from('user_profiles')
          .select('user_id, full_name, email')
          .in('user_id', ownerIds);
        (owners || []).forEach((o: any) => {
          ownerMap[o.user_id] = { full_name: o.full_name, email: o.email };
        });
      }

      setChannels(channelsData.map((c: any) => ({ ...c, owner: ownerMap[c.owner_id] || null })));
    } catch (error: any) {
      console.error('Error loading channels:', error);
      toast({
        title: t('adminLiveChannelManager', 'error', 'Error'),
        description: t('adminLiveChannelManager', 'failedToLoadChannels', 'Failed to load channels'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Load channel statistics - RLS-COMPATIBLE VERSION
  const loadChannelStats = async (channelId: string) => {
    try {
      const [followersRes, eventsRes, viewsRes] = await Promise.all([
        supabase
          .from('channel_followers')
          .select('id', { count: 'exact' })
          .eq('channel_id', channelId),

        supabase
          .from('channel_events')
          .select('id, status', { count: 'exact' })
          .eq('channel_id', channelId),

        supabase
          .from('channel_event_attendees')
          .select('id', { count: 'exact' })
          .eq('channel_id', channelId)
      ]);

      if (followersRes.error || eventsRes.error || viewsRes.error) {
        console.error('Stats load error', {
          followersRes,
          eventsRes,
          viewsRes
        });
        return;
      }

      const upcomingCount =
        eventsRes.data?.filter(e => e.status === 'upcoming').length ?? 0;

      const completedCount =
        eventsRes.data?.filter(e => e.status === 'ended').length ?? 0;

      setChannelStats({
        total_followers: Number(followersRes.count ?? 0),
        total_events: Number(eventsRes.count ?? 0),
        upcoming_events: upcomingCount,
        completed_events: completedCount,
        total_views: Number(viewsRes.count ?? 0)
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  // Load channel events
  const loadChannelEvents = async (channelId: string) => {
    try {
      const { data, error } = await supabase
        .from('channel_events')
        .select('*')
        .eq('channel_id', channelId)
        .order('scheduled_start', { ascending: false });

      if (error) throw error;

      setChannelEvents(data || []);
    } catch (error) {
      console.error('Error loading events:', error);
    }
  };

  // Upload image to storage
  const uploadImage = async (
    file: File, 
    bucket: 'channel-logos' | 'channel-featured',
    channelId?: string
  ): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${channelId || 'temp'}-${Date.now()}.${fileExt}`;
    const filePath = fileName;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return publicUrl;
  };

  // Handle logo upload
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: t('adminLiveChannelManager', 'error', 'Error'),
        description: t('adminLiveChannelManager', 'pleaseUploadImageFile', 'Please upload an image file'),
        variant: 'destructive'
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t('adminLiveChannelManager', 'error', 'Error'),
        description: t('adminLiveChannelManager', 'imageSizeLimit', 'Image size must be less than 5MB'),
        variant: 'destructive'
      });
      return;
    }

    try {
      setUploadingLogo(true);
      const url = await uploadImage(file, 'channel-logos', selectedChannel?.id);
      setFormData(prev => ({ ...prev, channel_logo_url: url }));
      toast({
        title: t('adminLiveChannelManager', 'success', 'Success'),
        description: t('adminLiveChannelManager', 'logoUploaded', 'Logo uploaded successfully')
      });
    } catch (error: any) {
      console.error('Logo upload error:', error);
      toast({
        title: t('adminLiveChannelManager', 'uploadError', 'Upload Error'),
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  // Handle featured image upload
  const handleFeaturedUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: t('adminLiveChannelManager', 'error', 'Error'),
        description: t('adminLiveChannelManager', 'pleaseUploadImageFile', 'Please upload an image file'),
        variant: 'destructive'
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t('adminLiveChannelManager', 'error', 'Error'),
        description: t('adminLiveChannelManager', 'imageSizeLimit', 'Image size must be less than 5MB'),
        variant: 'destructive'
      });
      return;
    }

    try {
      setUploadingFeatured(true);
      const url = await uploadImage(file, 'channel-featured', selectedChannel?.id);
      setFormData(prev => ({ ...prev, featured_image_url: url }));
      toast({
        title: t('adminLiveChannelManager', 'success', 'Success'),
        description: t('adminLiveChannelManager', 'featuredImageUploaded', 'Featured image uploaded successfully')
      });
    } catch (error: any) {
      console.error('Featured upload error:', error);
      toast({
        title: t('adminLiveChannelManager', 'uploadError', 'Upload Error'),
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setUploadingFeatured(false);
    }
  };

  // Create new channel
  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast({
        title: t('adminLiveChannelManager', 'validationError', 'Validation Error'),
        description: t('adminLiveChannelManager', 'channelNameRequired', 'Channel name is required'),
        variant: 'destructive'
      });
      return;
    }

    if (!formData.owner_id) {
      toast({
        title: t('adminLiveChannelManager', 'validationError', 'Validation Error'),
        description: t('adminLiveChannelManager', 'channelOwnerRequired', 'Channel owner is required'),
        variant: 'destructive'
      });
      return;
    }

    try {
      setSaving(true);

      const { data, error } = await supabase
        .from('live_channels')
        .insert([{
          name: formData.name,
          description: formData.description,
          category: formData.category,
          featured_image_url: formData.featured_image_url,
          channel_logo_url: formData.channel_logo_url,
          is_featured: formData.is_featured,
          is_active: formData.is_active,
          owner_id: formData.owner_id
        }])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: t('adminLiveChannelManager', 'success', 'Success'),
        description: t('adminLiveChannelManager', 'channelCreated', 'Channel created successfully')
      });

      setShowCreateModal(false);
      resetForm();
      loadChannels();
    } catch (error: any) {
      console.error('Error creating channel:', error);
      toast({
        title: t('adminLiveChannelManager', 'error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  // Update existing channel
  const handleUpdate = async () => {
    if (!selectedChannel) return;

    if (!formData.name.trim()) {
      toast({
        title: t('adminLiveChannelManager', 'validationError', 'Validation Error'),
        description: t('adminLiveChannelManager', 'channelNameRequired', 'Channel name is required'),
        variant: 'destructive'
      });
      return;
    }

    try {
      setSaving(true);

      // Same verify-the-row-actually-changed discipline as toggleActiveStatus
      // above — a bare .update() with no .select() reports success even when
      // RLS silently matched zero rows.
      const { data, error } = await supabase
        .from('live_channels')
        .update({
          name: formData.name,
          description: formData.description,
          category: formData.category,
          featured_image_url: formData.featured_image_url,
          channel_logo_url: formData.channel_logo_url,
          is_featured: formData.is_featured,
          is_active: formData.is_active
        })
        .eq('id', selectedChannel.id)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(t('adminLiveChannelManager', 'updateBlockedError', "The update didn't apply — you may not have permission to change this channel."));
      }

      toast({
        title: t('adminLiveChannelManager', 'success', 'Success'),
        description: t('adminLiveChannelManager', 'channelUpdated', 'Channel updated successfully')
      });

      setShowEditModal(false);
      setSelectedChannel(null);
      resetForm();
      loadChannels();
    } catch (error: any) {
      console.error('Error updating channel:', error);
      toast({
        title: t('adminLiveChannelManager', 'error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  // Delete channel
  const handleDelete = async () => {
    if (!selectedChannel) return;

    try {
      setSaving(true);

      // Delete channel (cascade will handle related records)
      const { error } = await supabase
        .from('live_channels')
        .delete()
        .eq('id', selectedChannel.id);

      if (error) throw error;

      toast({
        title: t('adminLiveChannelManager', 'success', 'Success'),
        description: t('adminLiveChannelManager', 'channelDeleted', 'Channel deleted successfully')
      });

      setShowDeleteDialog(false);
      setSelectedChannel(null);
      loadChannels();
    } catch (error: any) {
      console.error('Error deleting channel:', error);
      toast({
        title: t('adminLiveChannelManager', 'error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  // Toggle channel active status
  const toggleActiveStatus = async (channel: LiveChannel) => {
    try {
      // Real bug found live: a bare .update() with no .select() reports
      // success (error === null) even when RLS matches ZERO rows — Postgrest
      // doesn't treat "the row exists but you're not allowed to touch it" as
      // an error, it just silently no-ops. This toast used to fire
      // "successfully deactivated" regardless of whether anything actually
      // changed, which is exactly how a genuinely-unchanged channel could
      // look like it worked. Selecting the updated row back and checking it
      // actually came back is the only way to tell the two cases apart.
      const { data, error } = await supabase
        .from('live_channels')
        .update({ is_active: !channel.is_active })
        .eq('id', channel.id)
        .select('id, is_active');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(t('adminLiveChannelManager', 'updateBlockedError', "The update didn't apply — you may not have permission to change this channel."));
      }

      toast({
        title: t('adminLiveChannelManager', 'success', 'Success'),
        description: !channel.is_active
          ? t('adminLiveChannelManager', 'channelActivated', 'Channel activated successfully')
          : t('adminLiveChannelManager', 'channelDeactivated', 'Channel deactivated successfully')
      });

      loadChannels();
    } catch (error: any) {
      console.error('Error toggling status:', error);
      toast({
        title: t('adminLiveChannelManager', 'error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  // Toggle featured status
  const toggleFeaturedStatus = async (channel: LiveChannel) => {
    try {
      const { error } = await supabase
        .from('live_channels')
        .update({ is_featured: !channel.is_featured })
        .eq('id', channel.id);

      if (error) throw error;

      toast({
        title: t('adminLiveChannelManager', 'success', 'Success'),
        description: !channel.is_featured
          ? t('adminLiveChannelManager', 'channelFeatured', 'Channel featured successfully')
          : t('adminLiveChannelManager', 'channelUnfeatured', 'Channel unfeatured successfully')
      });

      loadChannels();
    } catch (error: any) {
      console.error('Error toggling featured:', error);
      toast({
        title: t('adminLiveChannelManager', 'error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  // Open edit modal
  const openEditModal = (channel: LiveChannel) => {
    setSelectedChannel(channel);
    setFormData({
      name: channel.name,
      description: channel.description || '',
      category: channel.category,
      featured_image_url: channel.featured_image_url || '',
      channel_logo_url: channel.channel_logo_url || '',
      is_featured: channel.is_featured,
      is_active: channel.is_active,
      owner_id: channel.owner_id
    });
    setShowEditModal(true);
  };

  // Open stats modal
  const openStatsModal = async (channel: LiveChannel) => {
    setSelectedChannel(channel);
    setChannelStats(null);
    setShowStatsModal(true);
    await loadChannelStats(channel.id);
  };

  // Open events modal
  const openEventsModal = async (channel: LiveChannel) => {
    setSelectedChannel(channel);
    setChannelEvents([]);
    setShowEventsModal(true);
    await loadChannelEvents(channel.id);
  };


  // Load channel subscribers
  const loadChannelSubscribers = async (channelId: string) => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_channel_subscribers')
        .select(`
          *,
          user_profiles(full_name, email)
        `)
        .eq('channel_id', channelId)
        .order('subscribed_at', { ascending: false });
      if (error) throw error;
      setChannelSubscribers(data || []);
    } catch (error) {
      console.error('Error loading subscribers:', error);
    }
  };

  // Open subscribers modal
  const openSubscribersModal = async (channel: LiveChannel) => {
    setSelectedChannel(channel);
    setChannelSubscribers([]);
    setSubscriberSearch('');
    setShowSubscribersModal(true);
    await loadChannelSubscribers(channel.id);
  };

  // Open delete dialog
  const openDeleteDialog = (channel: LiveChannel) => {
    setSelectedChannel(channel);
    setShowDeleteDialog(true);
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      category: 'general',
      featured_image_url: '',
      channel_logo_url: '',
      is_featured: false,
      is_active: true,
      owner_id: ''
    });
  };

  // Filter channels
  const filteredChannels = channels.filter(channel => {
    const matchesSearch = channel.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         channel.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || channel.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'active' && channel.is_active) ||
                         (statusFilter === 'inactive' && !channel.is_active) ||
                         (statusFilter === 'featured' && channel.is_featured);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Get status badge
  const getStatusBadge = (channel: LiveChannel) => {
    if (!channel.is_active) {
      return <Badge variant="destructive">{t('adminLiveChannelManager', 'inactive', 'Inactive')}</Badge>;
    }
    if (channel.is_featured) {
      return <Badge className="bg-yellow-500">{t('adminLiveChannelManager', 'featured', 'Featured')}</Badge>;
    }
    return <Badge variant="secondary">{t('adminLiveChannelManager', 'active', 'Active')}</Badge>;
  };

  // Get category label
  const getCategoryLabel = (category: ChannelCategory) => {
    const cat = CHANNEL_CATEGORIES.find(c => c.value === category);
    return cat?.label || category;
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get event status badge
  const getEventStatusBadge = (status: ChannelEvent['status']) => {
    switch (status) {
      case 'live':
        return <Badge className="bg-red-500 animate-pulse">{t('adminLiveChannelManager', 'live', 'Live')}</Badge>;
      case 'upcoming':
        return <Badge className="bg-blue-500">{t('adminLiveChannelManager', 'upcoming', 'Upcoming')}</Badge>;
      case 'ended':
        return <Badge variant="secondary">{t('adminLiveChannelManager', 'ended', 'Ended')}</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">{t('adminLiveChannelManager', 'cancelled', 'Cancelled')}</Badge>;
      default:
        return null;
    }
  };

  // Initial load
  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Radio className="h-5 w-5 text-red-500" />
                {t('adminLiveChannelManager', 'liveChannelsManagement', 'Live Channels Management')}
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                {t('adminLiveChannelManager', 'manageAllChannels', 'Manage all live broadcast channels and their content')}
              </p>
            </div>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('adminLiveChannelManager', 'createChannel', 'Create Channel')}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('adminLiveChannelManager', 'searchChannels', 'Search channels...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t('adminLiveChannelManager', 'filterByCategory', 'Filter by category')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('adminLiveChannelManager', 'allCategories', 'All Categories')}</SelectItem>
                {CHANNEL_CATEGORIES.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t('adminLiveChannelManager', 'filterByStatus', 'Filter by status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('adminLiveChannelManager', 'allStatus', 'All Status')}</SelectItem>
                <SelectItem value="active">{t('adminLiveChannelManager', 'active', 'Active')}</SelectItem>
                <SelectItem value="inactive">{t('adminLiveChannelManager', 'inactive', 'Inactive')}</SelectItem>
                <SelectItem value="featured">{t('adminLiveChannelManager', 'featured', 'Featured')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-gray-600">
              {t('adminLiveChannelManager', 'showingXofYChannels', 'Showing {shown} of {total} channels')
                .replace('{shown}', String(filteredChannels.length))
                .replace('{total}', String(channels.length))}
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={loadChannels}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {t('adminLiveChannelManager', 'refresh', 'Refresh')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Channels List */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : filteredChannels.length === 0 ? (
            <div className="text-center py-12">
              <Radio className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">{t('adminLiveChannelManager', 'noChannelsFound', 'No channels found')}</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setShowCreateModal(true)}
              >
                {t('adminLiveChannelManager', 'createFirstChannel', 'Create First Channel')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredChannels.map(channel => (
                <Card key={channel.id} className="overflow-hidden">
                  <div className="flex items-start gap-4 p-4">
                    {/* Channel Logo */}
                    <div className="flex-shrink-0">
                      {channel.channel_logo_url ? (
                        <img 
                          src={channel.channel_logo_url} 
                          alt={channel.name}
                          className="w-16 h-16 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center">
                          <Radio className="h-8 w-8 text-gray-400" />
                        </div>
                      )}
                    </div>

                    {/* Channel Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-semibold text-lg truncate">
                            {channel.name}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            {getStatusBadge(channel)}
                            <Badge variant="outline">
                              {getCategoryLabel(channel.category)}
                            </Badge>
                          </div>
                          {channel.owner && (
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {channel.owner.full_name || t('adminLiveChannelManager', 'unknownOwner', 'Unknown owner')}
                              </span>
                              {channel.owner.email && (
                                <span className="flex items-center gap-1 truncate">
                                  <Mail className="h-3 w-3" />
                                  {channel.owner.email}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {channel.description && (
                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                          {channel.description}
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          <span>{t('adminLiveChannelManager', 'xFollowers', '{count} followers').replace('{count}', String(channel.followers?.[0]?.count || 0))}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>{t('adminLiveChannelManager', 'xEvents', '{count} events').replace('{count}', String(channel.events?.[0]?.count || 0))}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          <span>{t('adminLiveChannelManager', 'createdX', 'Created {date}').replace('{date}', formatDate(channel.created_at))}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openStatsModal(channel)}
                      >
                        <BarChart3 className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEventsModal(channel)}
                      >
                        <Calendar className="h-4 w-4" />
                      </Button>


                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openSubscribersModal(channel)}
                        title={t('adminLiveChannelManager', 'viewSubscribers', 'View subscribers')}
                      >
                        <Users className="h-4 w-4 text-green-600" />
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setStreamConfigChannel(channel)}
                        title="Cloudflare Stream (HLS)"
                      >
                        <Radio className="h-4 w-4 text-purple-600" />
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditModal(channel)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>

                      <Button
                        variant={channel.is_active ? "outline" : "default"}
                        size="sm"
                        onClick={() => toggleActiveStatus(channel)}
                      >
                        {channel.is_active ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDeleteDialog(channel)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Channel Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('adminLiveChannelManager', 'createNewChannel', 'Create New Channel')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">{t('adminLiveChannelManager', 'channelNameLabel', 'Channel Name *')}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t('adminLiveChannelManager', 'enterChannelName', 'Enter channel name')}
              />
            </div>

            <div>
              <Label htmlFor="description">{t('adminLiveChannelManager', 'description', 'Description')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('adminLiveChannelManager', 'enterChannelDescription', 'Enter channel description')}
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="category">{t('adminLiveChannelManager', 'category', 'Category')}</Label>
              <Select 
                value={formData.category} 
                onValueChange={(value: ChannelCategory) => 
                  setFormData(prev => ({ ...prev, category: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="owner_id">{t('adminLiveChannelManager', 'ownerUserIdLabel', 'Owner User ID *')}</Label>
              <Input
                id="owner_id"
                value={formData.owner_id}
                onChange={(e) => setFormData(prev => ({ ...prev, owner_id: e.target.value }))}
                placeholder={t('adminLiveChannelManager', 'enterOwnerUserId', 'Enter owner user ID')}
              />
            </div>

            <div>
              <Label>{t('adminLiveChannelManager', 'channelLogo', 'Channel Logo')}</Label>
              <div className="flex items-center gap-4 mt-2">
                {formData.channel_logo_url && (
                  <img 
                    src={formData.channel_logo_url} 
                    alt="Logo preview"
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                >
                  {uploadingLogo ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {t('adminLiveChannelManager', 'uploadLogo', 'Upload Logo')}
                </Button>
                {formData.channel_logo_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFormData(prev => ({ ...prev, channel_logo_url: '' }))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div>
              <Label>{t('adminLiveChannelManager', 'featuredImage', 'Featured Image')}</Label>
              <div className="flex items-center gap-4 mt-2">
                {formData.featured_image_url && (
                  <img 
                    src={formData.featured_image_url} 
                    alt="Featured preview"
                    className="w-32 h-20 rounded-lg object-cover"
                  />
                )}
                <input
                  ref={featuredInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFeaturedUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => featuredInputRef.current?.click()}
                  disabled={uploadingFeatured}
                >
                  {uploadingFeatured ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {t('adminLiveChannelManager', 'uploadFeaturedImage', 'Upload Featured Image')}
                </Button>
                {formData.featured_image_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFormData(prev => ({ ...prev, featured_image_url: '' }))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_featured}
                  onCheckedChange={(checked) => 
                    setFormData(prev => ({ ...prev, is_featured: checked }))
                  }
                />
                <Label>{t('adminLiveChannelManager', 'featuredChannel', 'Featured Channel')}</Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => 
                    setFormData(prev => ({ ...prev, is_active: checked }))
                  }
                />
                <Label>{t('adminLiveChannelManager', 'active', 'Active')}</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowCreateModal(false);
                resetForm();
              }}
              disabled={saving}
            >
              {t('adminLiveChannelManager', 'cancel', 'Cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('adminLiveChannelManager', 'creating', 'Creating...')}
                </>
              ) : (
                t('adminLiveChannelManager', 'createChannel', 'Create Channel')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Channel Modal */}
      {streamConfigChannel && (
        <ChannelStreamConfig
          channel={streamConfigChannel}
          open={!!streamConfigChannel}
          onClose={() => setStreamConfigChannel(null)}
        />
      )}

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('adminLiveChannelManager', 'editChannel', 'Edit Channel')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">{t('adminLiveChannelManager', 'channelNameLabel', 'Channel Name *')}</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t('adminLiveChannelManager', 'enterChannelName', 'Enter channel name')}
              />
            </div>

            <div>
              <Label htmlFor="edit-description">{t('adminLiveChannelManager', 'description', 'Description')}</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('adminLiveChannelManager', 'enterChannelDescription', 'Enter channel description')}
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="edit-category">{t('adminLiveChannelManager', 'category', 'Category')}</Label>
              <Select 
                value={formData.category} 
                onValueChange={(value: ChannelCategory) => 
                  setFormData(prev => ({ ...prev, category: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('adminLiveChannelManager', 'channelLogo', 'Channel Logo')}</Label>
              <div className="flex items-center gap-4 mt-2">
                {formData.channel_logo_url && (
                  <img 
                    src={formData.channel_logo_url} 
                    alt="Logo preview"
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                >
                  {uploadingLogo ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {t('adminLiveChannelManager', 'uploadLogo', 'Upload Logo')}
                </Button>
                {formData.channel_logo_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFormData(prev => ({ ...prev, channel_logo_url: '' }))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div>
              <Label>{t('adminLiveChannelManager', 'featuredImage', 'Featured Image')}</Label>
              <div className="flex items-center gap-4 mt-2">
                {formData.featured_image_url && (
                  <img 
                    src={formData.featured_image_url} 
                    alt="Featured preview"
                    className="w-32 h-20 rounded-lg object-cover"
                  />
                )}
                <input
                  ref={featuredInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFeaturedUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => featuredInputRef.current?.click()}
                  disabled={uploadingFeatured}
                >
                  {uploadingFeatured ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {t('adminLiveChannelManager', 'uploadFeaturedImage', 'Upload Featured Image')}
                </Button>
                {formData.featured_image_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFormData(prev => ({ ...prev, featured_image_url: '' }))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_featured}
                  onCheckedChange={(checked) => 
                    setFormData(prev => ({ ...prev, is_featured: checked }))
                  }
                />
                <Label>{t('adminLiveChannelManager', 'featuredChannel', 'Featured Channel')}</Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => 
                    setFormData(prev => ({ ...prev, is_active: checked }))
                  }
                />
                <Label>{t('adminLiveChannelManager', 'active', 'Active')}</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowEditModal(false);
                setSelectedChannel(null);
                resetForm();
              }}
              disabled={saving}
            >
              {t('adminLiveChannelManager', 'cancel', 'Cancel')}
            </Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('adminLiveChannelManager', 'updating', 'Updating...')}
                </>
              ) : (
                t('adminLiveChannelManager', 'updateChannel', 'Update Channel')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Channel Statistics Modal */}
      <Dialog open={showStatsModal} onOpenChange={setShowStatsModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('adminLiveChannelManager', 'channelStatistics', 'Channel Statistics')}</DialogTitle>
            {selectedChannel && (
              <p className="text-sm text-gray-600">{selectedChannel.name}</p>
            )}
          </DialogHeader>

          <div className="space-y-4">
            {!channelStats ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">{t('adminLiveChannelManager', 'totalFollowers', 'Total Followers')}</p>
                        <p className="text-3xl font-bold mt-2">{channelStats.total_followers}</p>
                      </div>
                      <Users className="h-8 w-8 text-blue-500" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">{t('adminLiveChannelManager', 'totalEvents', 'Total Events')}</p>
                        <p className="text-3xl font-bold mt-2">{channelStats.total_events}</p>
                      </div>
                      <Calendar className="h-8 w-8 text-purple-500" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">{t('adminLiveChannelManager', 'upcomingEvents', 'Upcoming Events')}</p>
                        <p className="text-3xl font-bold mt-2">{channelStats.upcoming_events}</p>
                      </div>
                      <Clock className="h-8 w-8 text-green-500" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">{t('adminLiveChannelManager', 'totalViews', 'Total Views')}</p>
                        <p className="text-3xl font-bold mt-2">{channelStats.total_views}</p>
                      </div>
                      <BarChart3 className="h-8 w-8 text-orange-500" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Channel Events Modal */}
      <Dialog open={showEventsModal} onOpenChange={setShowEventsModal}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{t('adminLiveChannelManager', 'channelEvents', 'Channel Events')}</DialogTitle>
            {selectedChannel && (
              <p className="text-sm text-gray-600">{selectedChannel.name}</p>
            )}
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto max-h-[60vh]">
            {channelEvents.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">{t('adminLiveChannelManager', 'noEventsFound', 'No events found')}</p>
              </div>
            ) : (
              channelEvents.map(event => (
                <Card key={event.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">{event.title}</h4>
                          {getEventStatusBadge(event.status)}
                          {event.is_video_enabled && (
                            <Badge variant="outline">
                              <Video className="h-3 w-3 mr-1" />
                              {t('adminLiveChannelManager', 'video', 'Video')}
                            </Badge>
                          )}
                        </div>
                        {event.description && (
                          <p className="text-sm text-gray-600 mb-3">
                            {event.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span>{formatDate(event.scheduled_start)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            <span>{t('adminLiveChannelManager', 'xRegistered', '{count} registered').replace('{count}', String(event.total_registered))}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('adminLiveChannelManager', 'deleteChannel', 'Delete Channel')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">{t('adminLiveChannelManager', 'warningCannotBeUndone', 'Warning: This action cannot be undone')}</p>
                <p className="text-sm text-red-700 mt-1">
                  {t('adminLiveChannelManager', 'deletingWillRemove', 'Deleting this channel will permanently remove:')}
                </p>
                <ul className="text-sm text-red-700 mt-2 ml-4 list-disc">
                  <li>{t('adminLiveChannelManager', 'allChannelData', 'All channel data and settings')}</li>
                  <li>{t('adminLiveChannelManager', 'allEvents', 'All scheduled and past events')}</li>
                  <li>{t('adminLiveChannelManager', 'allFollowers', 'All follower relationships')}</li>
                  <li>{t('adminLiveChannelManager', 'allChatMessages', 'All chat messages and interactions')}</li>
                </ul>
              </div>
            </div>

            {selectedChannel && (
              <p className="text-center">
                {t('adminLiveChannelManager', 'confirmDeletePrefix', 'Are you sure you want to delete')} <strong>{selectedChannel.name}</strong>?
              </p>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowDeleteDialog(false);
                setSelectedChannel(null);
              }}
              disabled={saving}
            >
              {t('adminLiveChannelManager', 'cancel', 'Cancel')}
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDelete}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('adminLiveChannelManager', 'deleting', 'Deleting...')}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('adminLiveChannelManager', 'deleteChannel', 'Delete Channel')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subscribers Modal */}
      <Dialog open={showSubscribersModal} onOpenChange={setShowSubscribersModal}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-green-600" />
              {t('adminLiveChannelManager', 'whatsappSubscribers', 'WhatsApp Subscribers')}
            </DialogTitle>
            {selectedChannel && (
              <p className="text-sm text-gray-600">{selectedChannel.name}</p>
            )}
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={t('adminLiveChannelManager', 'searchByNameEmailPhone', 'Search by name, email or phone...')}
                  value={subscriberSearch}
                  onChange={e => setSubscriberSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Badge variant="secondary" className="shrink-0">
                {(channelSubscribers.length === 1
                  ? t('adminLiveChannelManager', 'xSubscriber', '{count} subscriber')
                  : t('adminLiveChannelManager', 'xSubscribers', '{count} subscribers')
                ).replace('{count}', String(channelSubscribers.length))}
              </Badge>
            </div>

            <div className="overflow-y-auto max-h-[50vh] space-y-2">
              {channelSubscribers.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">{t('adminLiveChannelManager', 'noSubscribersYet', 'No subscribers yet')}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('adminLiveChannelManager', 'optInAppearHere', 'Users who opt-in to WhatsApp will appear here')}</p>
                </div>
              ) : (
                channelSubscribers
                  .filter(s => {
                    if (!subscriberSearch) return true;
                    const q = subscriberSearch.toLowerCase();
                    return (
                      s.phone_number?.toLowerCase().includes(q) ||
                      s.user_profiles?.full_name?.toLowerCase().includes(q) ||
                      s.user_profiles?.email?.toLowerCase().includes(q)
                    );
                  })
                  .map(sub => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-white hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                          <MessageSquare className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {sub.user_profiles?.full_name || t('adminLiveChannelManager', 'unknownUser', 'Unknown User')}
                          </p>
                          <p className="text-xs text-gray-500">{sub.user_profiles?.email || '—'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono text-green-700">{sub.phone_number}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {sub.subscribed_at
                            ? new Date(sub.subscribed_at).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                              })
                            : '—'}
                        </p>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};