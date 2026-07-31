import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Badge } from '@rekindle/ui/badge';
import { Label } from '@rekindle/ui/label';
import { Switch } from '@rekindle/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@rekindle/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import { supabase } from '@rekindle/supabase';
import { notify } from '@rekindle/features/notify';
import { toast } from '@rekindle/ui/use-toast';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import {
  Megaphone, Plus, Edit, Trash2, Search, Loader2, Pin, Bell, Clock, Eye,
  Send, Calendar, Image, Link2, Users, Copy, CheckCircle, BarChart3,
  TrendingUp, AlertCircle, FileText, X, Download, Filter
} from 'lucide-react';
import {
  SearchFilterPanel,
  searchFilterIconClass,
  searchFilterInputClass,
  searchFilterSelectTriggerClass
} from '@rekindle/features/components/SearchFilterPanel';

interface MinistryAnnouncementsManagerProps {
  ministryId: string;
}
interface Announcement {
  id: string;
  title: string;
  content: string;
  category: string;
  is_pinned: boolean;
  priority: string;
  expires_at: string;
  publish_at: string;
  send_push: boolean;
  send_email: boolean;
  target_audience: string;
  image_url: string;
  link_url: string;
  link_text: string;
  view_count: number;
  read_count: number;
  click_count: number;
  status: string;
  created_at: string;
  author_id: string;
}

interface Analytics {
  totalAnnouncements: number;
  activeAnnouncements: number;
  totalViews: number;
  totalReads: number;
  avgEngagement: number;
  topAnnouncement: Announcement | null;
}

const CATEGORIES = [
  'General', 'Event', 'Urgent', 'Ministry Update', 'Celebration',
  'Prayer Call', 'Service Times', 'Community', 'Volunteer', 'Giving'
];

const TEMPLATES = [
  {
    name: 'Event Announcement',
    title: 'Join Us for [Event Name]',
    content: 'We\'re excited to invite you to [Event Name]!\n\nWhen: [Date & Time]\nWhere: [Location]\n\nDetails: [Event Description]\n\nPlease RSVP by [Date].',
    category: 'Event'
  },
  {
    name: 'Service Update',
    title: 'Service Time Change',
    content: 'Important Update: Our service times will be changing starting [Date].\n\nNew Times:\n- Morning Service: [Time]\n- Evening Service: [Time]\n\nWe look forward to worshipping with you!',
    category: 'Ministry Update'
  },
  {
    name: 'Volunteer Call',
    title: 'Volunteers Needed',
    content: 'We\'re looking for volunteers to serve in [Ministry/Area].\n\nCommitment: [Time Requirement]\nRequirements: [Any Requirements]\n\nInterested? Contact [Name] at [Contact].',
    category: 'Volunteer'
  }
];

export const MinistryAnnouncementsManager: React.FC<MinistryAnnouncementsManagerProps> = ({
  ministryId
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'General',
    is_pinned: false,
    priority: 'normal',
    expires_at: '',
    publish_at: '',
    send_push: false,
    send_email: false,
    target_audience: 'all',
    image_url: '',
    link_url: '',
    link_text: '',
    status: 'draft'
  });

  useEffect(() => {
    loadAnnouncements();
    loadAnalytics();
  }, [ministryId]);

  const loadAnnouncements = async () => {
    try {
      const { data, error } = await supabase
        .from('ministry_announcements')
        .select('*')
        .eq('ministry_id', ministryId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (err) {
      console.error('Error loading announcements:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      const { data, error } = await supabase
        .from('ministry_announcements')
        .select('*')
        .eq('ministry_id', ministryId);

      if (error) throw error;

      const announcementsData = data || [];
      const activeAnnouncements = announcementsData.filter(a => 
        a.status === 'published' && (!a.expires_at || new Date(a.expires_at) > new Date())
      );
      const totalViews = announcementsData.reduce((sum, a) => sum + (a.view_count || 0), 0);
      const totalReads = announcementsData.reduce((sum, a) => sum + (a.read_count || 0), 0);

      const topAnnouncement = [...announcementsData]
        .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))[0] || null;

      setAnalytics({
        totalAnnouncements: announcementsData.length,
        activeAnnouncements: activeAnnouncements.length,
        totalViews,
        totalReads,
        avgEngagement: announcementsData.length > 0 
          ? (totalReads / totalViews) * 100 || 0
          : 0,
        topAnnouncement
      });
    } catch (err) {
      console.error('Error loading analytics:', err);
    }
  };

  const handleCreate = () => {
    setEditingAnnouncement(null);
    setFormData({
      title: '',
      content: '',
      category: 'General',
      is_pinned: false,
      priority: 'normal',
      expires_at: '',
      publish_at: '',
      send_push: false,
      send_email: false,
      target_audience: 'all',
      image_url: '',
      link_url: '',
      link_text: '',
      status: 'draft'
    });
    setShowModal(true);
  };

  const handleEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setFormData({
      title: announcement.title,
      content: announcement.content,
      category: announcement.category || 'General',
      is_pinned: announcement.is_pinned,
      priority: announcement.priority || 'normal',
      expires_at: announcement.expires_at ? new Date(announcement.expires_at).toISOString().slice(0, 16) : '',
      publish_at: announcement.publish_at ? new Date(announcement.publish_at).toISOString().slice(0, 16) : '',
      send_push: announcement.send_push || false,
      send_email: announcement.send_email || false,
      target_audience: announcement.target_audience || 'all',
      image_url: announcement.image_url || '',
      link_url: announcement.link_url || '',
      link_text: announcement.link_text || '',
      status: announcement.status || 'draft'
    });
    setShowModal(true);
  };

  const handleDuplicate = (announcement: Announcement) => {
    setEditingAnnouncement(null);
    setFormData({
      title: `${announcement.title} (Copy)`,
      content: announcement.content,
      category: announcement.category || 'General',
      is_pinned: false,
      priority: announcement.priority || 'normal',
      expires_at: '',
      publish_at: '',
      send_push: announcement.send_push || false,
      send_email: announcement.send_email || false,
      target_audience: announcement.target_audience || 'all',
      image_url: announcement.image_url || '',
      link_url: announcement.link_url || '',
      link_text: announcement.link_text || '',
      status: 'draft'
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({ title: t('ministryAnnouncementsManager', 'error', 'Error'), description: t('ministryAnnouncementsManager', 'titleRequired', 'Title is required'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const sendPush = formData.status === 'published';

      const dataToSave = {
        ministry_id: ministryId,
        title: formData.title.trim(),
        content: formData.content.trim(),
        category: formData.category,
        is_pinned: formData.is_pinned,
        priority: formData.priority,
        expires_at: formData.expires_at || null,
        publish_at: formData.publish_at || null,
        send_push: sendPush,
        send_email: formData.send_email,
        target_audience: formData.target_audience,
        image_url: formData.image_url,
        link_url: formData.link_url,
        link_text: formData.link_text,
        status: formData.status,
        author_id: user?.id
      };

      let announcementId: string;

      if (editingAnnouncement) {
        const { error } = await supabase
          .from('ministry_announcements')
          .update(dataToSave)
          .eq('id', editingAnnouncement.id);
        if (error) throw error;
        announcementId = editingAnnouncement.id;
        toast({ title: t('ministryAnnouncementsManager', 'success', 'Success'), description: t('ministryAnnouncementsManager', 'announcementUpdated', 'Announcement updated') });
      } else {
        const { data: inserted, error } = await supabase
          .from('ministry_announcements')
          .insert(dataToSave)
          .select('id')
          .single();
        if (error) throw error;
        announcementId = inserted.id;
        toast({ title: t('ministryAnnouncementsManager', 'success', 'Success'), description: t('ministryAnnouncementsManager', 'announcementCreated', 'Announcement created') });
      }

      // -- Dispatch notifications when publishing ------------------------
      // Fire on first publish only: new announcements with status=published,
      // OR edits where status is changing from non-published -> published.
      const isBeingPublished =
        formData.status === 'published' &&
        (!editingAnnouncement || editingAnnouncement.status !== 'published');

      if (isBeingPublished && (sendPush || formData.send_email)) {
        const notifyPromises: Promise<void>[] = [];

        const notificationPayload = {
          announcementId,
          ministryId,
          targetAudience: formData.target_audience,
          title: formData.title.trim(),
        };

        if (sendPush) {
          notifyPromises.push(
            supabase.functions
              .invoke('send-push-notification', {
                body: {
                  ...notificationPayload,
                  body: formData.content.trim().slice(0, 200),
                  notificationType: 'ministry_announcement',
                },
              })
              .then(({ error }) => {
                if (error) throw error;
              })
          );
        }

        if (formData.send_email) {
          notifyPromises.push(
            supabase.functions
              .invoke('send-ministry-email', {
                body: {
                  ...notificationPayload,
                  content: formData.content.trim(),
                  category: formData.category,
                  priority: formData.priority,
                  linkUrl: formData.link_url,
                  linkText: formData.link_text,
                  imageUrl: formData.image_url,
                },
              })
              .then(({ error }) => {
                if (error) throw error;
              })
          );
        }

        const results = await Promise.allSettled(notifyPromises);

        const channelLabels: string[] = [];
        if (sendPush) {
          channelLabels.push(
            results[0]?.status === 'fulfilled'
              ? t('ministryAnnouncementsManager', 'pushSent', '✓ Push sent')
              : t('ministryAnnouncementsManager', 'pushFailed', '✗ Push failed')
          );
        }
        if (formData.send_email) {
          const idx = sendPush ? 1 : 0;
          channelLabels.push(
            results[idx]?.status === 'fulfilled'
              ? t('ministryAnnouncementsManager', 'emailSent', '✓ Email sent')
              : t('ministryAnnouncementsManager', 'emailFailed', '✗ Email failed')
          );
        }

        toast({
          title: t('ministryAnnouncementsManager', 'announcementPublished', 'Announcement published'),
          description: t('ministryAnnouncementsManager', 'sentVia', 'Sent via: {channels}').replace('{channels}', channelLabels.join(', ')),
        });
      }

      setShowModal(false);
      loadAnnouncements();
      loadAnalytics();
    } catch (err: any) {
      toast({ title: t('ministryAnnouncementsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('ministryAnnouncementsManager', 'confirmDelete', 'Are you sure you want to delete this announcement?'))) return;

    try {
      const { error } = await supabase
        .from('ministry_announcements')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast({ title: t('ministryAnnouncementsManager', 'success', 'Success'), description: t('ministryAnnouncementsManager', 'announcementDeleted', 'Announcement deleted') });
      loadAnnouncements();
      loadAnalytics();
    } catch (err: any) {
      toast({ title: t('ministryAnnouncementsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleTogglePin = async (announcement: Announcement) => {
    try {
      const { error } = await supabase
        .from('ministry_announcements')
        .update({ is_pinned: !announcement.is_pinned })
        .eq('id', announcement.id);
      if (error) throw error;
      loadAnnouncements();
    } catch (err: any) {
      toast({ title: t('ministryAnnouncementsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleApplyTemplate = (template: any) => {
    setFormData({
      ...formData,
      title: template.title,
      content: template.content,
      category: template.category
    });
    setShowTemplatesModal(false);
  };

  const handleExport = () => {
    const csv = [
      ['Title', 'Category', 'Priority', 'Status', 'Views', 'Reads', 'Created'].join(','),
      ...filteredAnnouncements.map(a => [
        `"${a.title}"`,
        a.category || '',
        a.priority,
        a.status,
        a.view_count || 0,
        a.read_count || 0,
        new Date(a.created_at).toLocaleDateString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `announcements-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <Badge className="bg-orange-100 text-orange-700">{t('ministryAnnouncementsManager', 'highPriority', 'High Priority')}</Badge>;
      case 'urgent':
        return <Badge className="bg-red-500 text-white">{t('ministryAnnouncementsManager', 'urgent', 'Urgent')}</Badge>;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string, publishAt?: string) => {
    if (status === 'scheduled' || (publishAt && new Date(publishAt) > new Date())) {
      return <Badge className="bg-blue-100 text-blue-700">{t('ministryAnnouncementsManager', 'scheduled', 'Scheduled')}</Badge>;
    }
    switch (status) {
      case 'published':
        return <Badge className="bg-green-100 text-green-700">{t('ministryAnnouncementsManager', 'published', 'Published')}</Badge>;
      case 'draft':
        return <Badge variant="secondary">{t('ministryAnnouncementsManager', 'draft', 'Draft')}</Badge>;
      case 'expired':
        return <Badge className="bg-gray-100 text-gray-700">{t('ministryAnnouncementsManager', 'expired', 'Expired')}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredAnnouncements = announcements.filter(a => {
    const matchesSearch = a.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.content?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || a.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const stats = {
    total: announcements.length,
    published: announcements.filter(a => a.status === 'published').length,
    drafts: announcements.filter(a => a.status === 'draft').length,
    pinned: announcements.filter(a => a.is_pinned).length,
    thisMonth: announcements.filter(a => {
      const date = new Date(a.created_at);
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SearchFilterPanel icon={<Megaphone className="h-6 w-6 text-white/60" />}>
        <div className="relative w-full md:max-w-sm">
            <Search className={searchFilterIconClass} />
            <Input
              placeholder={t('ministryAnnouncementsManager', 'searchPlaceholder', 'Search announcements...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={searchFilterInputClass}
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className={`w-full md:w-44 ${searchFilterSelectTriggerClass}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('ministryAnnouncementsManager', 'allCategories', 'All Categories')}</SelectItem>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className={`w-full md:w-36 ${searchFilterSelectTriggerClass}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('ministryAnnouncementsManager', 'allStatus', 'All Status')}</SelectItem>
              <SelectItem value="published">{t('ministryAnnouncementsManager', 'published', 'Published')}</SelectItem>
              <SelectItem value="draft">{t('ministryAnnouncementsManager', 'drafts', 'Drafts')}</SelectItem>
              <SelectItem value="scheduled">{t('ministryAnnouncementsManager', 'scheduled', 'Scheduled')}</SelectItem>
            </SelectContent>
          </Select>
        <div className="flex flex-wrap gap-2 md:ml-auto">
          <Button variant="ghost" className="text-white hover:bg-white/15 hover:text-white" onClick={() => setShowTemplatesModal(true)}>
            <FileText className="h-4 w-4 mr-2" />
            {t('ministryAnnouncementsManager', 'templates', 'Templates')}
          </Button>
          <Button variant="ghost" className="text-white hover:bg-white/15 hover:text-white" onClick={() => setShowAnalyticsModal(true)}>
            <BarChart3 className="h-4 w-4 mr-2" />
            {t('ministryAnnouncementsManager', 'analytics', 'Analytics')}
          </Button>
          <Button variant="ghost" className="text-white hover:bg-white/15 hover:text-white" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            {t('ministryAnnouncementsManager', 'export', 'Export')}
          </Button>
          <Button className="bg-white text-purple-700 hover:bg-white/90" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            {t('ministryAnnouncementsManager', 'newAnnouncement', 'New Announcement')}
          </Button>
        </div>
      </SearchFilterPanel>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryAnnouncementsManager', 'total', 'Total')}</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Megaphone className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryAnnouncementsManager', 'published', 'Published')}</p>
                <p className="text-2xl font-bold">{stats.published}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryAnnouncementsManager', 'drafts', 'Drafts')}</p>
                <p className="text-2xl font-bold">{stats.drafts}</p>
              </div>
              <FileText className="h-8 w-8 text-gray-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryAnnouncementsManager', 'pinned', 'Pinned')}</p>
                <p className="text-2xl font-bold">{stats.pinned}</p>
              </div>
              <Pin className="h-8 w-8 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryAnnouncementsManager', 'thisMonth', 'This Month')}</p>
                <p className="text-2xl font-bold">{stats.thisMonth}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Announcements List */}
      <Card>
        <CardContent className="p-0">
          {filteredAnnouncements.length === 0 ? (
            <div className="text-center py-12">
              <Megaphone className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-700">{t('ministryAnnouncementsManager', 'noAnnouncements', 'No Announcements')}</h3>
              <p className="text-gray-500 mb-4">{t('ministryAnnouncementsManager', 'createFirst', 'Create your first announcement')}</p>
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                {t('ministryAnnouncementsManager', 'newAnnouncement', 'New Announcement')}
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {filteredAnnouncements.map(announcement => (
                <div key={announcement.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex gap-4 flex-1">
                      {announcement.image_url && (
                        <img 
                          src={announcement.image_url} 
                          alt={announcement.title}
                          className="w-24 h-24 rounded object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {announcement.is_pinned && <Pin className="h-4 w-4 text-amber-500 fill-amber-500" />}
                          <h3 className="font-semibold">{announcement.title}</h3>
                          {getPriorityBadge(announcement.priority)}
                          {getStatusBadge(announcement.status, announcement.publish_at)}
                          {announcement.send_push && (
                            <Bell className="h-4 w-4 text-blue-500" />
                          )}
                          {announcement.send_email && (
                            <Send className="h-4 w-4 text-green-500" />
                          )}
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2 mb-2">{announcement.content}</p>
                        <div className="flex flex-wrap gap-2 items-center text-sm text-gray-500">
                          {announcement.category && (
                            <Badge variant="outline">{announcement.category}</Badge>
                          )}
                          <span>{new Date(announcement.created_at).toLocaleDateString()}</span>
                          {announcement.expires_at && (
                            <span className="text-amber-600 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {t('ministryAnnouncementsManager', 'expiresLabel', 'Expires:')} {new Date(announcement.expires_at).toLocaleDateString()}
                            </span>
                          )}
                          {announcement.publish_at && new Date(announcement.publish_at) > new Date() && (
                            <span className="text-blue-600 flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {t('ministryAnnouncementsManager', 'scheduledLabel', 'Scheduled:')} {new Date(announcement.publish_at).toLocaleDateString()}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" /> {t('ministryAnnouncementsManager', 'viewsCount', '{count} views').replace('{count}', String(announcement.view_count || 0))}
                          </span>
                          <Badge variant="outline">{announcement.target_audience}</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleTogglePin(announcement)}
                        title={announcement.is_pinned ? t('ministryAnnouncementsManager', 'unpin', 'Unpin') : t('ministryAnnouncementsManager', 'pin', 'Pin')}
                      >
                        <Pin className={`h-4 w-4 ${announcement.is_pinned ? 'text-amber-500 fill-amber-500' : ''}`} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(announcement)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDuplicate(announcement)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(announcement.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAnnouncement ? t('ministryAnnouncementsManager', 'editAnnouncement', 'Edit Announcement') : t('ministryAnnouncementsManager', 'newAnnouncement', 'New Announcement')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div>
              <Label>{t('ministryAnnouncementsManager', 'titleLabel', 'Title *')}</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t('ministryAnnouncementsManager', 'titlePlaceholder', 'Announcement title')}
              />
            </div>

            <div>
              <Label>{t('ministryAnnouncementsManager', 'content', 'Content')}</Label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder={t('ministryAnnouncementsManager', 'contentPlaceholder', 'Announcement content...')}
                rows={6}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t('ministryAnnouncementsManager', 'category', 'Category')}</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('ministryAnnouncementsManager', 'priority', 'Priority')}</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(v) => setFormData({ ...formData, priority: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">{t('ministryAnnouncementsManager', 'normal', 'Normal')}</SelectItem>
                    <SelectItem value="high">{t('ministryAnnouncementsManager', 'high', 'High')}</SelectItem>
                    <SelectItem value="urgent">{t('ministryAnnouncementsManager', 'urgent', 'Urgent')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>{t('ministryAnnouncementsManager', 'status', 'Status')}</Label>
              <Select
                value={formData.status}
                onValueChange={(v) => setFormData({ ...formData, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">{t('ministryAnnouncementsManager', 'draft', 'Draft')}</SelectItem>
                  <SelectItem value="published">{t('ministryAnnouncementsManager', 'published', 'Published')}</SelectItem>
                  <SelectItem value="scheduled">{t('ministryAnnouncementsManager', 'scheduled', 'Scheduled')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('ministryAnnouncementsManager', 'targetAudience', 'Target Audience')}</Label>
              <Select
                value={formData.target_audience}
                onValueChange={(v) => setFormData({ ...formData, target_audience: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('ministryAnnouncementsManager', 'allMembers', 'All Members')}</SelectItem>
                  <SelectItem value="leaders">{t('ministryAnnouncementsManager', 'leadersOnly', 'Leaders Only')}</SelectItem>
                  <SelectItem value="premium">{t('ministryAnnouncementsManager', 'premiumMembers', 'Premium Members')}</SelectItem>
                  <SelectItem value="volunteers">{t('ministryAnnouncementsManager', 'volunteers', 'Volunteers')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('ministryAnnouncementsManager', 'featuredImageUrl', 'Featured Image URL (Optional)')}</Label>
              <Input
                value={formData.image_url}
                onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                placeholder="https://..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t('ministryAnnouncementsManager', 'linkUrl', 'Link URL (Optional)')}</Label>
                <Input
                  value={formData.link_url}
                  onChange={(e) => setFormData({ ...formData, link_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label>{t('ministryAnnouncementsManager', 'linkText', 'Link Text')}</Label>
                <Input
                  value={formData.link_text}
                  onChange={(e) => setFormData({ ...formData, link_text: e.target.value })}
                  placeholder={t('ministryAnnouncementsManager', 'learnMore', 'Learn More')}
                />
              </div>
            </div>

            <div>
              <Label>{t('ministryAnnouncementsManager', 'publishAt', 'Publish At (Optional - for scheduled announcements)')}</Label>
              <Input
                type="datetime-local"
                value={formData.publish_at}
                onChange={(e) => setFormData({ ...formData, publish_at: e.target.value })}
              />
            </div>

            <div>
              <Label>{t('ministryAnnouncementsManager', 'expirationDate', 'Expiration Date (Optional)')}</Label>
              <Input
                type="datetime-local"
                value={formData.expires_at}
                onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
              />
            </div>

            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              <Switch
                checked={formData.is_pinned}
                onCheckedChange={(v) => setFormData({ ...formData, is_pinned: v })}
              />
              <Label>{t('ministryAnnouncementsManager', 'pinToTop', 'Pin to Top')}</Label>
            </div>

            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              <Switch
                checked={formData.send_email}
                onCheckedChange={(v) => setFormData({ ...formData, send_email: v })}
              />
              <div className="flex-1">
                <Label>{t('ministryAnnouncementsManager', 'sendEmailNotification', 'Send Email Notification')}</Label>
                <p className="text-xs text-gray-500">{t('ministryAnnouncementsManager', 'sendEmailToAll', 'Send email to all members')}</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>{t('ministryAnnouncementsManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingAnnouncement ? t('ministryAnnouncementsManager', 'update', 'Update') : formData.status === 'published' ? t('ministryAnnouncementsManager', 'publish', 'Publish') : t('ministryAnnouncementsManager', 'save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Templates Modal */}
      <Dialog open={showTemplatesModal} onOpenChange={setShowTemplatesModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('ministryAnnouncementsManager', 'announcementTemplates', 'Announcement Templates')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {TEMPLATES.map((template, index) => (
              <Card key={index} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleApplyTemplate(template)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold mb-1">{template.name}</h4>
                      <Badge variant="outline" className="mb-2">{template.category}</Badge>
                      <p className="text-sm text-gray-600 line-clamp-3">{template.content}</p>
                    </div>
                    <Button variant="outline" size="sm">
                      {t('ministryAnnouncementsManager', 'useTemplate', 'Use Template')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplatesModal(false)}>{t('ministryAnnouncementsManager', 'close', 'Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Analytics Modal */}
      <Dialog open={showAnalyticsModal} onOpenChange={setShowAnalyticsModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('ministryAnnouncementsManager', 'announcementsAnalytics', 'Announcements Analytics')}</DialogTitle>
          </DialogHeader>
          {analytics && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <Eye className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                      <p className="text-2xl font-bold">{analytics.totalViews.toLocaleString()}</p>
                      <p className="text-sm text-gray-500">{t('ministryAnnouncementsManager', 'totalViews', 'Total Views')}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <CheckCircle className="h-8 w-8 mx-auto text-green-500 mb-2" />
                      <p className="text-2xl font-bold">{analytics.totalReads.toLocaleString()}</p>
                      <p className="text-sm text-gray-500">{t('ministryAnnouncementsManager', 'totalReads', 'Total Reads')}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <TrendingUp className="h-8 w-8 mx-auto text-purple-500 mb-2" />
                      <p className="text-2xl font-bold">{analytics.avgEngagement.toFixed(1)}%</p>
                      <p className="text-sm text-gray-500">{t('ministryAnnouncementsManager', 'engagementRate', 'Engagement Rate')}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {analytics.topAnnouncement && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-amber-500" />
                      {t('ministryAnnouncementsManager', 'topPerforming', 'Top Performing Announcement')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h4 className="font-semibold mb-2">{analytics.topAnnouncement.title}</h4>
                      <p className="text-sm text-gray-600 mb-3">{analytics.topAnnouncement.content.slice(0, 150)}...</p>
                      <div className="flex gap-4 text-sm">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" /> {t('ministryAnnouncementsManager', 'viewsCount', '{count} views').replace('{count}', String(analytics.topAnnouncement.view_count))}
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> {t('ministryAnnouncementsManager', 'readsCount', '{count} reads').replace('{count}', String(analytics.topAnnouncement.read_count))}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className="bg-gradient-to-r from-purple-50 to-blue-50">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">{t('ministryAnnouncementsManager', 'activeAnnouncements', 'Active Announcements')}</p>
                      <p className="text-3xl font-bold text-purple-700">
                        {analytics.activeAnnouncements}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">{t('ministryAnnouncementsManager', 'currentlyVisible', 'Currently visible to members')}</p>
                    </div>
                    <Megaphone className="h-16 w-16 text-purple-400 opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowAnalyticsModal(false)}>{t('ministryAnnouncementsManager', 'close', 'Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MinistryAnnouncementsManager;
